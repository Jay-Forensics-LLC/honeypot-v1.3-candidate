import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import crypto from 'node:crypto';
import { writeAuditLog } from './helpers/auditLogger.js';
import { requireAdmin, logBlockedAttempt } from './helpers/rbacHelpers.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { operation, ...params } = await req.json();

    switch (operation) {
      case 'createPolicyVersion':
        return await createPolicyVersion(base44, user, params);
      case 'submitPolicyVersionForApproval':
        return await submitPolicyVersionForApproval(base44, user, params);
      case 'approvePolicyVersion':
        return await approvePolicyVersion(base44, user, params);
      case 'rejectPolicyVersion':
        return await rejectPolicyVersion(base44, user, params);
      case 'createPolicyFromTemplate':
        return await createPolicyFromTemplate(base44, user, params);
      case 'migratePoliciesToVersions':
        return await migratePoliciesToVersions(base44, user);
      default:
        return Response.json({ error: 'Unknown operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('Policy version lifecycle error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Contract Function 1: Create Policy Version
async function createPolicyVersion(base44, user, { policy_id, change_summary, payload }) {
  // Validate payload structure matches canonical schema
  if (!payload || typeof payload !== 'object') {
    return Response.json({ error: 'Invalid payload structure' }, { status: 400 });
  }

  if (!change_summary || change_summary.trim().length === 0) {
    return Response.json({ error: 'change_summary is required' }, { status: 400 });
  }

  // Get existing versions to determine next version number
  const existingVersions = await base44.entities.PolicyVersion.filter({
    policy_id,
    organization_id: user.organization_id
  }, '-version_number', 1);

  const currentMaxVersion = existingVersions.length > 0 ? existingVersions[0].version_number : 0;
  const version_number = currentMaxVersion + 1;

  // Create new draft version
  const version = await base44.entities.PolicyVersion.create({
    organization_id: user.organization_id,
    policy_id,
    version_number,
    status: 'DRAFT',
    payload,
    change_summary,
    created_by: user.email
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_version_created',
    severity: 'info',
    description: `Created draft version ${version_number} for policy ${policy_id}`,
    actor: user.email,
    success: true,
    metadata: { policy_id, version_number, status: 'DRAFT' },
    entity_type: 'PolicyVersion',
    entity_id: version.id
  });

  return Response.json({
    policy_id,
    version_number,
    status: 'DRAFT',
    version_id: version.id
  });
}

// Contract Function 2: Submit Policy Version for Approval
async function submitPolicyVersionForApproval(base44, user, { policy_id, version_number }) {
  // Get the version
  const versions = await base44.entities.PolicyVersion.filter({
    policy_id,
    version_number,
    organization_id: user.organization_id
  });

  if (versions.length === 0) {
    return Response.json({ error: 'Version not found' }, { status: 404 });
  }

  const version = versions[0];

  if (version.status !== 'DRAFT') {
    return Response.json({ 
      error: `Cannot submit version in status ${version.status}. Only DRAFT versions can be submitted.` 
    }, { status: 400 });
  }

  // Transition to PENDING_APPROVAL
  await base44.entities.PolicyVersion.update(version.id, {
    status: 'PENDING_APPROVAL'
  });

  // Create approval queue item
  const approvalItem = await base44.entities.ApprovalQueueItem.create({
    organization_id: user.organization_id,
    category: 'POLICY_CHANGE',
    status: 'PENDING_APPROVAL',
    priority: 'MEDIUM',
    title: `Policy Version ${version_number} Approval Request`,
    description: `Approval requested for version ${version_number} of policy. Changes: ${version.change_summary}`,
    requested_by: user.email,
    requested_at: new Date().toISOString(),
    payload: {
      policy_id,
      version_number,
      version_id: version.id,
      change_summary: version.change_summary
    },
    related_entity_type: 'PolicyVersion',
    related_entity_id: version.id
  });

  // Update version with approval reference
  await base44.entities.PolicyVersion.update(version.id, {
    approval_request_id: approvalItem.id
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_version_submitted',
    severity: 'info',
    description: `Submitted version ${version_number} for approval`,
    actor: user.email,
    success: true,
    metadata: { policy_id, version_number, approval_queue_item_id: approvalItem.id },
    entity_type: 'PolicyVersion',
    entity_id: version.id
  });

  return Response.json({
    approval_queue_item_id: approvalItem.id,
    status: 'PENDING_APPROVAL',
    version_id: version.id
  });
}

// Contract Function 3: Approve Policy Version (Admin Only)
async function approvePolicyVersion(base44, user, { approval_queue_item_id }) {
  const authCheck = requireAdmin(user);
  if (!authCheck.allowed) {
    await logBlockedAttempt(base44, {
      organization_id: user.organization_id,
      actor: user.email,
      event_type: 'policy_version_approval',
      blocked_reason: authCheck.blocked_reason,
      metadata: { approval_queue_item_id }
    });

    return Response.json({ 
      error: authCheck.message,
      blocked_reason: authCheck.blocked_reason
    }, { status: authCheck.status });
  }

  // Get approval queue item
  const queueItem = await base44.asServiceRole.entities.ApprovalQueueItem.get(approval_queue_item_id);

  if (!queueItem || queueItem.category !== 'POLICY_CHANGE') {
    return Response.json({ error: 'Invalid approval queue item' }, { status: 404 });
  }

  const { policy_id, version_number, version_id } = queueItem.payload;

  // Get the version to activate
  const version = await base44.asServiceRole.entities.PolicyVersion.get(version_id);

  if (version.status !== 'PENDING_APPROVAL') {
    return Response.json({ 
      error: `Version status is ${version.status}, expected PENDING_APPROVAL` 
    }, { status: 400 });
  }

  // Archive previous ACTIVE version(s)
  const activeVersions = await base44.asServiceRole.entities.PolicyVersion.filter({
    policy_id,
    status: 'ACTIVE',
    organization_id: user.organization_id
  });

  for (const activeVersion of activeVersions) {
    await base44.asServiceRole.entities.PolicyVersion.update(activeVersion.id, {
      status: 'ARCHIVED',
      archived_at: new Date().toISOString()
    });
  }

  // Activate new version
  const now = new Date().toISOString();
  await base44.asServiceRole.entities.PolicyVersion.update(version_id, {
    status: 'ACTIVE',
    approved_by: user.email,
    approved_at: now,
    activated_at: now
  });

  // Update approval queue item
  await base44.asServiceRole.entities.ApprovalQueueItem.update(approval_queue_item_id, {
    status: 'EXECUTED',
    reviewed_by: user.email,
    reviewed_at: now,
    review_notes: 'Version approved and activated'
  });

  // Update SecurityPolicy convenience fields
  await base44.asServiceRole.entities.SecurityPolicy.update(policy_id, {
    status: 'PUBLISHED',
    version: version_number,
    is_enabled: true,
    updated_by: user.email
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_version_approved',
    severity: 'info',
    description: `Approved and activated version ${version_number}`,
    actor: user.email,
    success: true,
    metadata: { 
      policy_id, 
      version_number, 
      activated_version: version_number,
      archived_versions: activeVersions.length 
    },
    entity_type: 'PolicyVersion',
    entity_id: version_id
  });

  return Response.json({
    policy_id,
    activated_version: version_number,
    status: 'ACTIVE',
    version_id
  });
}

// Contract Function 4: Reject Policy Version (Admin Only)
async function rejectPolicyVersion(base44, user, { approval_queue_item_id, reason }) {
  const authCheck = requireAdmin(user);
  if (!authCheck.allowed) {
    await logBlockedAttempt(base44, {
      organization_id: user.organization_id,
      actor: user.email,
      event_type: 'policy_version_rejection',
      blocked_reason: authCheck.blocked_reason,
      metadata: { approval_queue_item_id }
    });

    return Response.json({ 
      error: authCheck.message,
      blocked_reason: authCheck.blocked_reason
    }, { status: authCheck.status });
  }

  if (!reason || reason.trim().length === 0) {
    return Response.json({ error: 'Rejection reason is required' }, { status: 400 });
  }

  // Get approval queue item
  const queueItem = await base44.asServiceRole.entities.ApprovalQueueItem.get(approval_queue_item_id);

  if (!queueItem || queueItem.category !== 'POLICY_CHANGE') {
    return Response.json({ error: 'Invalid approval queue item' }, { status: 404 });
  }

  const { policy_id, version_number, version_id } = queueItem.payload;

  // Get the version
  const version = await base44.asServiceRole.entities.PolicyVersion.get(version_id);

  if (version.status !== 'PENDING_APPROVAL') {
    return Response.json({ 
      error: `Version status is ${version.status}, expected PENDING_APPROVAL` 
    }, { status: 400 });
  }

  // Revert to DRAFT with rejection metadata (allows resubmission)
  await base44.asServiceRole.entities.PolicyVersion.update(version_id, {
    status: 'DRAFT',
    diff_from_previous: {
      ...version.diff_from_previous,
      last_rejected_at: new Date().toISOString(),
      last_rejected_by: user.email,
      last_rejection_reason: reason
    }
  });

  // Update approval queue item
  const now = new Date().toISOString();
  await base44.asServiceRole.entities.ApprovalQueueItem.update(approval_queue_item_id, {
    status: 'REJECTED',
    reviewed_by: user.email,
    reviewed_at: now,
    review_notes: reason
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_version_rejected',
    severity: 'info',
    description: `Rejected version ${version_number}: ${reason}`,
    actor: user.email,
    success: true,
    metadata: { policy_id, version_number, reason },
    entity_type: 'PolicyVersion',
    entity_id: version_id
  });

  return Response.json({
    status: 'REJECTED',
    version_id,
    reverted_to: 'DRAFT'
  });
}

// Contract Function 5: Create Policy from Template
async function createPolicyFromTemplate(base44, user, { template_id, name, description }) {
  // Get template
  const templates = await base44.entities.PolicyTemplate.filter({
    id: template_id
  });

  if (templates.length === 0) {
    return Response.json({ error: 'Template not found' }, { status: 404 });
  }

  const template = templates[0];

  // Validate template access (global or org-owned)
  if (!template.is_global && template.organization_id !== user.organization_id) {
    return Response.json({ error: 'Template access denied' }, { status: 403 });
  }

  // Create policy
  const policy_hash = crypto.createHash('sha256')
    .update(JSON.stringify(template.payload))
    .digest('hex');

  const policy = await base44.entities.SecurityPolicy.create({
    organization_id: user.organization_id,
    name: name || template.template_name,
    description: description || template.description,
    status: 'DRAFT',
    version: 1,
    is_enabled: false,
    policy_payload_json: template.payload,
    policy_hash,
    updated_by: user.email
  });

  // Create initial draft version
  const version = await base44.entities.PolicyVersion.create({
    organization_id: user.organization_id,
    policy_id: policy.id,
    version_number: 1,
    status: 'DRAFT',
    payload: template.payload,
    change_summary: `Created from template: ${template.template_name}`,
    created_by: user.email
  });

  // Increment template usage count
  await base44.asServiceRole.entities.PolicyTemplate.update(template_id, {
    usage_count: (template.usage_count || 0) + 1
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_created_from_template',
    severity: 'info',
    description: `Created policy "${name}" from template "${template.template_name}"`,
    actor: user.email,
    success: true,
    metadata: { template_id, policy_id: policy.id, version_number: 1 },
    entity_type: 'SecurityPolicy',
    entity_id: policy.id
  });

  return Response.json({
    policy_id: policy.id,
    version_number: 1,
    status: 'DRAFT',
    version_id: version.id
  });
}

// Migration Helper: Convert Legacy Policies to Versioned Format (Idempotent)
async function migratePoliciesToVersions(base44, user) {
  const authCheck = requireAdmin(user);
  if (!authCheck.allowed) {
    await logBlockedAttempt(base44, {
      organization_id: user.organization_id,
      actor: user.email,
      event_type: 'policy_migration',
      blocked_reason: authCheck.blocked_reason,
      metadata: { operation: 'migratePoliciesToVersions' }
    });

    return Response.json({ 
      error: authCheck.message,
      blocked_reason: authCheck.blocked_reason
    }, { status: authCheck.status });
  }

  // Get all policies for this org
  const policies = await base44.asServiceRole.entities.SecurityPolicy.filter({
    organization_id: user.organization_id
  });

  let migrated = 0;
  let skipped = 0;
  const errors = [];

  for (const policy of policies) {
    try {
      // Check if ACTIVE version already exists (idempotent check)
      const activeVersions = await base44.asServiceRole.entities.PolicyVersion.filter({
        policy_id: policy.id,
        status: 'ACTIVE'
      });

      if (activeVersions.length > 0) {
        skipped++;
        continue;
      }

      // Create initial ACTIVE version from policy payload
      await base44.asServiceRole.entities.PolicyVersion.create({
        organization_id: user.organization_id,
        policy_id: policy.id,
        version_number: policy.version || 1,
        status: 'ACTIVE',
        payload: policy.policy_payload_json,
        change_summary: 'Initial version migration from legacy policy',
        created_by: 'system',
        approved_by: 'system',
        approved_at: policy.updated_date || new Date().toISOString(),
        activated_at: policy.updated_date || new Date().toISOString()
      });

      migrated++;
    } catch (error) {
      errors.push({
        policy_id: policy.id,
        policy_name: policy.name,
        error: error.message
      });
    }
  }

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_version_migrated',
    severity: 'info',
    description: `Migrated ${migrated} policies to version format`,
    actor: user.email,
    success: true,
    metadata: { 
      total_policies: policies.length,
      migrated,
      skipped,
      errors: errors.length 
    }
  });

  return Response.json({
    total_policies: policies.length,
    migrated,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
    message: `Successfully migrated ${migrated} policies. Skipped ${skipped} (already have ACTIVE versions).`
  });
}