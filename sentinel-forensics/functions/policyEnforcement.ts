import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { writeAuditLog } from './helpers/auditLogger.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { operation, ...params } = await req.json();

    switch (operation) {
      case 'evaluateCompliance':
        return await evaluateCompliance(base44, user, params);
      case 'approveAction':
        return await approveAction(base44, user, params);
      case 'denyAction':
        return await denyAction(base44, user, params);
      case 'cancelAction':
        return await cancelAction(base44, user, params);
      case 'executeAction':
        return await executeAction(base44, user, params);
      default:
        return Response.json({ error: 'Unknown operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('Enforcement error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function evaluateCompliance(base44, user, { device_id }) {
  // Get effective policy
  const resolutions = await base44.asServiceRole.entities.EffectivePolicyResolution.filter({
    organization_id: user.organization_id,
    device_id
  });

  if (resolutions.length === 0) {
    return Response.json({ status: 'COMPLIANT', reason: 'No policies assigned' });
  }

  const latestResolution = resolutions.sort((a, b) => 
    new Date(b.resolved_at) - new Date(a.resolved_at)
  )[0];

  // Evaluate each domain
  const findings = {
    auto_response_findings: [],
    firewall_findings: [],
    usb_findings: [],
    hardening_findings: []
  };

  let compliant = true;

  // Auto-response: check if rules are acknowledged
  const autoRules = latestResolution.resolved_policy_payload_json.auto_response_rules || [];
  if (autoRules.length > 0) {
    findings.auto_response_findings.push({
      status: 'INFO',
      message: `${autoRules.length} auto-response rules active`
    });
  }

  // Firewall: check if applied (placeholder for agent check)
  const fwConfig = latestResolution.resolved_policy_payload_json.firewall_config;
  if (fwConfig && fwConfig.apply_mode === 'ENFORCE') {
    findings.firewall_findings.push({
      status: 'PENDING',
      message: 'Firewall enforcement requires agent confirmation'
    });
    compliant = false;
  }

  // USB: check violations (would be from device telemetry)
  const usbConfig = latestResolution.resolved_policy_payload_json.usb_restrictions;
  if (usbConfig && usbConfig.mode !== 'ALLOW_ALL') {
    findings.usb_findings.push({
      status: 'INFO',
      message: `USB mode: ${usbConfig.mode}`
    });
  }

  // Hardening: check completion
  const hardeningItems = latestResolution.resolved_policy_payload_json.hardening_checklist?.items || [];
  const requiredItems = hardeningItems.filter(i => i.requirement === 'REQUIRED');
  if (requiredItems.length > 0) {
    findings.hardening_findings.push({
      status: 'NON_COMPLIANT',
      message: `${requiredItems.length} required controls pending evidence`
    });
    compliant = false;
  }

  // Store evaluation
  const evaluation = await base44.asServiceRole.entities.PolicyEvaluation.create({
    organization_id: user.organization_id,
    device_id,
    policy_id: latestResolution.id,
    status: compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
    findings_json: findings,
    compliance_score: compliant ? 100 : 50,
    last_evaluated_at: new Date().toISOString(),
    evaluation_metadata: {
      evaluated_by: user.email,
      agent_available: false
    }
  });

  return Response.json({ evaluation });
}

async function approveAction(base44, user, { action_id }) {
  const action = await base44.asServiceRole.entities.PolicyActionQueue.get(action_id);

  if (action.status !== 'PENDING_APPROVAL') {
    return Response.json({ error: 'Action not pending approval' }, { status: 400 });
  }

  await base44.asServiceRole.entities.PolicyActionQueue.update(action_id, {
    status: 'APPROVED',
    approved_by: user.email,
    approved_at: new Date().toISOString()
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_action_approved',
    severity: 'info',
    description: `Approved action ${action.action_type} for device ${action.device_id}`,
    actor: user.email,
    success: true,
    metadata: { action_type: action.action_type, device_id: action.device_id },
    entity_type: 'PolicyActionQueue',
    entity_id: action_id
  });

  // Execute action
  await executeActionInternal(base44, action);

  return Response.json({ success: true });
}

async function denyAction(base44, user, { action_id, reason }) {
  if (!reason || !reason.trim()) {
    return Response.json({ error: 'Denial reason is required' }, { status: 400 });
  }

  await base44.asServiceRole.entities.PolicyActionQueue.update(action_id, {
    status: 'CANCELED',
    approved_by: user.email,
    approved_at: new Date().toISOString(),
    execution_log: `DENIED by ${user.email}: ${reason}`
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_action_denied',
    severity: 'warning',
    description: `Denied action ${action_id}`,
    actor: user.email,
    success: true,
    metadata: { reason },
    entity_type: 'PolicyActionQueue',
    entity_id: action_id
  });

  return Response.json({ success: true });
}

async function cancelAction(base44, user, { action_id }) {
  await base44.asServiceRole.entities.PolicyActionQueue.update(action_id, {
    status: 'CANCELED',
    execution_log: `Canceled by ${user.email} at ${new Date().toISOString()}`
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_action_canceled',
    severity: 'info',
    description: `Canceled action ${action_id}`,
    actor: user.email,
    success: true,
    entity_type: 'PolicyActionQueue',
    entity_id: action_id
  });

  return Response.json({ success: true });
}

async function executeAction(base44, user, { action_id }) {
  const action = await base44.asServiceRole.entities.PolicyActionQueue.get(action_id);
  await executeActionInternal(base44, action);
  return Response.json({ success: true });
}

async function executeActionInternal(base44, action) {
  await base44.asServiceRole.entities.PolicyActionQueue.update(action.id, {
    status: 'RUNNING',
    executed_by: 'policy-engine',
    executed_at: new Date().toISOString()
  });

  try {
    let result = '';

    switch (action.action_type) {
      case 'ISOLATE_DEVICE':
        // Set containment flag (actual isolation requires agent)
        await base44.asServiceRole.entities.Device.update(action.device_id, {
          containment_status: 'ISOLATED',
          containment_reason: 'Policy auto-response',
          containment_at: new Date().toISOString()
        });
        result = 'Device marked for isolation (agent execution pending)';
        break;

      case 'APPLY_FIREWALL_PLAN':
        result = 'Firewall plan queued for agent (not yet applied)';
        break;

      case 'ENFORCE_USB_MODE':
        result = 'USB enforcement queued for agent';
        break;

      case 'REQUEST_HARDENING_EVIDENCE':
        result = 'Hardening evidence request sent';
        break;

      case 'CAPTURE_TRIAGE':
        result = 'Triage capture queued';
        break;

      default:
        result = 'Unknown action type';
    }

    await base44.asServiceRole.entities.PolicyActionQueue.update(action.id, {
      status: 'SUCCESS',
      execution_log: result
    });
  } catch (error) {
    await base44.asServiceRole.entities.PolicyActionQueue.update(action.id, {
      status: 'FAILED',
      execution_log: error.message
    });
  }
}