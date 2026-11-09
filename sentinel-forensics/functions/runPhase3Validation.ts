import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAdmin, requireDevMode, logBlockedAttempt } from './helpers/rbacHelpers.js';

Deno.serve(async (req) => {
  const validation_run_id = `phase3_${Date.now()}`;
  const started_at = new Date().toISOString();
  const results = [];
  const artifacts = { sample_responses: {}, audit_events: [] };

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // CRITICAL: Dev mode required (production safety)
    const devModeCheck = requireDevMode();
    if (!devModeCheck.allowed) {
      await logBlockedAttempt(base44, {
        organization_id: user.organization_id,
        actor: user.email,
        event_type: 'phase3_validation',
        blocked_reason: devModeCheck.blocked_reason,
        metadata: { function: 'runPhase3Validation' }
      });

      return Response.json({ 
        error: devModeCheck.message,
        blocked_reason: devModeCheck.blocked_reason
      }, { status: devModeCheck.status });
    }

    // Admin-only (even in dev mode)
    const authCheck = requireAdmin(user);
    if (!authCheck.allowed) {
      await logBlockedAttempt(base44, {
        organization_id: user.organization_id,
        actor: user.email,
        event_type: 'phase3_validation',
        blocked_reason: authCheck.blocked_reason,
        metadata: { function: 'runPhase3Validation' }
      });

      return Response.json({ 
        error: authCheck.message,
        blocked_reason: authCheck.blocked_reason
      }, { status: authCheck.status });
    }

    const { mode = 'APPROVE', cleanup = true } = await req.json();

    // Step 0: Migration compatibility check
    try {
      const legacyPolicies = await base44.asServiceRole.entities.SecurityPolicy.filter({
        organization_id: user.organization_id
      });

      const policiesWithoutVersions = [];
      for (const policy of legacyPolicies) {
        const versions = await base44.asServiceRole.entities.PolicyVersion.filter({
          policy_id: policy.id
        });
        if (versions.length === 0) {
          policiesWithoutVersions.push(policy.id);
        }
      }

      results.push({
        step: 'migration_compatibility_check',
        pass: true,
        details: {
          total_policies: legacyPolicies.length,
          policies_without_versions: policiesWithoutVersions.length,
          status: policiesWithoutVersions.length === 0 ? 'All policies migrated' : 'Legacy policies exist (migration helper available)'
        }
      });
    } catch (error) {
      results.push({
        step: 'migration_compatibility_check',
        pass: false,
        details: { error: error.message }
      });
    }

    // Step 1: Create test policy
    try {
      const createResp = await base44.functions.invoke('policyOperations', {
        operation: 'create',
        name: `[VALIDATION] Test Policy ${validation_run_id}`,
        description: 'Automated Phase 3 validation test policy',
        policy_payload_json: {
          auto_response_rules: [],
          firewall_config: { profile: 'BALANCED', logging_level: 'BASIC', rules: [], apply_mode: 'RECOMMEND_ONLY' },
          usb_restrictions: { mode: 'ALLOW_ALL', log_violations: false },
          hardening_checklist: { items: [] }
        }
      });

      const testPolicy = createResp.data.policy;
      artifacts.policy_id = testPolicy.id;

      // Get initial policy_config hash (for legacy write detection)
      const policyBefore = await base44.asServiceRole.entities.SecurityPolicy.get(testPolicy.id);
      const initialConfigHash = await hashObject(policyBefore.policy_payload_json);
      artifacts.initial_config_hash = initialConfigHash;

      results.push({
        step: 'create_test_policy',
        pass: true,
        details: { policy_id: testPolicy.id, has_version: !!testPolicy.version }
      });

      // Step 2: Verify initial draft version exists
      const versions = await base44.asServiceRole.entities.PolicyVersion.filter({
        policy_id: testPolicy.id
      }, '-version_number');

      const initialDraft = versions.find(v => v.status === 'DRAFT');
      artifacts.draft_version_number = initialDraft?.version_number;

      results.push({
        step: 'initial_draft_exists',
        pass: !!initialDraft && initialDraft.version_number === 1,
        details: { version_count: versions.length, draft_version: initialDraft?.version_number }
      });

      // Step 3: Create additional draft from "active" (simulating Create Draft button)
      const createDraftResp = await base44.functions.invoke('policyVersionLifecycle', {
        operation: 'createPolicyVersion',
        policy_id: testPolicy.id,
        change_summary: 'Validation test draft',
        payload: initialDraft.payload
      });

      artifacts.sample_responses.createPolicyVersion = createDraftResp.data;

      const newDraftVersion = createDraftResp.data.version_number;
      results.push({
        step: 'create_draft',
        pass: newDraftVersion === 2,
        details: { expected: 2, actual: newDraftVersion }
      });

      // Step 4: Save draft (update payload)
      const updatedPayload = {
        ...initialDraft.payload,
        firewall_config: {
          ...initialDraft.payload.firewall_config,
          rules: [{ direction: 'IN', protocol: 'TCP', ports: '22', action: 'DENY', description: 'Test rule' }]
        }
      };

      await base44.asServiceRole.entities.PolicyVersion.update(createDraftResp.data.version_id, {
        payload: updatedPayload,
        change_summary: 'Added test firewall rule'
      });

      const draftAfterSave = await base44.asServiceRole.entities.PolicyVersion.get(createDraftResp.data.version_id);
      const payloadPersisted = draftAfterSave.payload.firewall_config.rules.length === 1;

      results.push({
        step: 'save_draft',
        pass: payloadPersisted,
        details: { rules_count: draftAfterSave.payload.firewall_config.rules.length }
      });

      // Step 5: Submit for approval
      const submitResp = await base44.functions.invoke('policyVersionLifecycle', {
        operation: 'submitPolicyVersionForApproval',
        policy_id: testPolicy.id,
        version_number: newDraftVersion
      });

      artifacts.sample_responses.submitPolicyVersionForApproval = submitResp.data;
      artifacts.approval_queue_item_id = submitResp.data.approval_queue_item_id;

      const versionAfterSubmit = await base44.asServiceRole.entities.PolicyVersion.get(createDraftResp.data.version_id);
      const queueItem = await base44.asServiceRole.entities.ApprovalQueueItem.get(submitResp.data.approval_queue_item_id);

      results.push({
        step: 'submit_for_approval',
        pass: versionAfterSubmit.status === 'PENDING_APPROVAL' && queueItem.category === 'POLICY_CHANGE',
        details: {
          version_status: versionAfterSubmit.status,
          queue_category: queueItem.category
        }
      });

      // Step 6: Approve or Reject
      if (mode === 'APPROVE') {
        const approveResp = await base44.functions.invoke('policyVersionLifecycle', {
          operation: 'approvePolicyVersion',
          approval_queue_item_id: queueItem.id
        });

        artifacts.sample_responses.approvePolicyVersion = approveResp.data;

        const versionAfterApprove = await base44.asServiceRole.entities.PolicyVersion.get(createDraftResp.data.version_id);
        const allVersionsAfter = await base44.asServiceRole.entities.PolicyVersion.filter({
          policy_id: testPolicy.id
        }, '-version_number');

        const activeCount = allVersionsAfter.filter(v => v.status === 'ACTIVE').length;
        const archivedCount = allVersionsAfter.filter(v => v.status === 'ARCHIVED').length;

        artifacts.active_version_number = versionAfterApprove.version_number;

        // Verify approval queue item status
        const queueItemAfter = await base44.asServiceRole.entities.ApprovalQueueItem.get(queueItem.id);

        results.push({
          step: 'approve_version',
          pass: versionAfterApprove.status === 'ACTIVE' && activeCount === 1 && archivedCount === 1 && queueItemAfter.status === 'EXECUTED',
          details: {
            new_status: versionAfterApprove.status,
            active_count: activeCount,
            archived_count: archivedCount,
            queue_status: queueItemAfter.status
          }
        });
      } else {
        const rejectResp = await base44.functions.invoke('policyVersionLifecycle', {
          operation: 'rejectPolicyVersion',
          approval_queue_item_id: queueItem.id,
          reason: 'Validation test rejection'
        });

        artifacts.sample_responses.rejectPolicyVersion = rejectResp.data;

        const versionAfterReject = await base44.asServiceRole.entities.PolicyVersion.get(createDraftResp.data.version_id);
        const queueItemAfter = await base44.asServiceRole.entities.ApprovalQueueItem.get(queueItem.id);

        results.push({
          step: 'reject_version',
          pass: versionAfterReject.status === 'DRAFT' && queueItemAfter.status === 'REJECTED',
          details: {
            new_status: versionAfterReject.status,
            queue_status: queueItemAfter.status,
            rejection_stored: !!rejectResp.data.reason
          }
        });
      }

      // Step 7: Active version enforcement check
      const allVersionsFinal = await base44.asServiceRole.entities.PolicyVersion.filter({
        policy_id: testPolicy.id
      }, '-version_number');

      const activeVersions = allVersionsFinal.filter(v => v.status === 'ACTIVE');
      const activeVersion = activeVersions[0];

      results.push({
        step: 'active_version_enforcement',
        pass: activeVersions.length === 1 && !!activeVersion,
        details: {
          active_count: activeVersions.length,
          active_version_number: activeVersion?.version_number,
          enforcement_status: activeVersions.length === 1 ? 'Single active version enforced' : 'VIOLATION: Multiple active versions'
        }
      });

      // Step 8: Verify no legacy writes
      const policyAfter = await base44.asServiceRole.entities.SecurityPolicy.get(testPolicy.id);
      const finalConfigHash = await hashObject(policyAfter.policy_payload_json);

      results.push({
        step: 'no_legacy_write_detected',
        pass: initialConfigHash === finalConfigHash,
        details: {
          initial_hash: initialConfigHash.substring(0, 16) + '...',
          final_hash: finalConfigHash.substring(0, 16) + '...',
          modified: initialConfigHash !== finalConfigHash,
          message: initialConfigHash === finalConfigHash ? 'No legacy writes detected' : 'VIOLATION: Legacy policy_payload_json was modified'
        }
      });

      // Step 9: Audit trail check
      const auditLogs = await base44.asServiceRole.entities.AuditLog.filter({
        'metadata.policy_id': testPolicy.id
      }, '-created_date', 50);

      const expectedEvents = mode === 'APPROVE'
        ? ['policy_created', 'policy_version_created', 'policy_version_submitted', 'policy_version_approved']
        : ['policy_created', 'policy_version_created', 'policy_version_submitted', 'policy_version_rejected'];

      const foundEvents = auditLogs.map(log => log.event_type);
      const auditComplete = expectedEvents.every(evt => foundEvents.includes(evt));

      artifacts.audit_events = auditLogs.map(log => ({
        event_type: log.event_type,
        created_date: log.created_date,
        actor: log.created_by
      }));

      results.push({
        step: 'audit_trail_complete',
        pass: auditComplete,
        details: {
          expected_events: expectedEvents,
          found_events: foundEvents,
          total_logs: auditLogs.length
        }
      });

      // Step 10: Cleanup (optional)
      if (cleanup) {
        const allVersions = await base44.asServiceRole.entities.PolicyVersion.filter({
          policy_id: testPolicy.id
        });
        
        await base44.asServiceRole.entities.SecurityPolicy.delete(testPolicy.id);
        await Promise.all(
          allVersions.map(v => base44.asServiceRole.entities.PolicyVersion.delete(v.id))
        );
        await base44.asServiceRole.entities.ApprovalQueueItem.delete(queueItem.id);

        results.push({
          step: 'cleanup',
          pass: true,
          details: { deleted_policy: testPolicy.id, deleted_versions: allVersions.length }
        });
      }

    } catch (error) {
      results.push({
        step: 'execution_error',
        pass: false,
        details: { error: error.message, stack: error.stack }
      });
    }

    const ended_at = new Date().toISOString();

    return Response.json({
      validation_run_id,
      started_at,
      ended_at,
      mode,
      results,
      artifacts,
      summary: {
        total_steps: results.length,
        passed: results.filter(r => r.pass).length,
        failed: results.filter(r => !r.pass).length,
        success_rate: `${Math.round((results.filter(r => r.pass).length / results.length) * 100)}%`
      }
    });

  } catch (error) {
    return Response.json({
      validation_run_id,
      started_at,
      ended_at: new Date().toISOString(),
      error: error.message,
      results,
      artifacts
    }, { status: 500 });
  }
});

async function hashObject(obj) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(obj));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}