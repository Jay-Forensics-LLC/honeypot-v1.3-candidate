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
      case 'create':
        return await createAssignment(base44, user, params);
      case 'update':
        return await updateAssignment(base44, user, params);
      case 'delete':
        return await deleteAssignment(base44, user, params);
      case 'list':
        return await listAssignments(base44, user, params);
      default:
        return Response.json({ error: 'Unknown operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('Policy assignment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function createAssignment(base44, user, { policy_id, target_type, target_id, enforcement_mode, priority }) {
  // Check for duplicates
  const existing = await base44.asServiceRole.entities.PolicyAssignment.filter({
    organization_id: user.organization_id,
    policy_id,
    target_type,
    target_id,
    is_active: true
  });

  if (existing.length > 0) {
    return Response.json({ 
      error: 'Duplicate assignment',
      details: 'This policy is already assigned to this target. Update priority/mode on existing assignment instead.'
    }, { status: 400 });
  }

  const assignment = await base44.asServiceRole.entities.PolicyAssignment.create({
    organization_id: user.organization_id,
    policy_id,
    target_type,
    target_id,
    enforcement_mode: enforcement_mode || 'AUDIT_ONLY',
    priority: priority || 0,
    rollout_mode: 'IMMEDIATE',
    is_active: true,
    assigned_by: user.email
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_assignment_created',
    severity: 'info',
    description: `Assigned policy to ${target_type} ${target_id}`,
    actor: user.email,
    success: true,
    metadata: { policy_id, target_type, target_id, priority },
    entity_type: 'PolicyAssignment',
    entity_id: assignment.id
  });

  return Response.json({ assignment });
}

async function updateAssignment(base44, user, { assignment_id, enforcement_mode, priority, is_active }) {
  const beforeState = await base44.asServiceRole.entities.PolicyAssignment.get(assignment_id);

  await base44.asServiceRole.entities.PolicyAssignment.update(assignment_id, {
    enforcement_mode: enforcement_mode !== undefined ? enforcement_mode : beforeState.enforcement_mode,
    priority: priority !== undefined ? priority : beforeState.priority,
    is_active: is_active !== undefined ? is_active : beforeState.is_active
  });

  await base44.asServiceRole.entities.AuditLog.create({
    organization_id: user.organization_id,
    actor: user.email,
    action: 'policy_assignment_updated',
    entity_type: 'PolicyAssignment',
    entity_id: assignment_id,
    before_json: { enforcement_mode: beforeState.enforcement_mode, priority: beforeState.priority },
    after_json: { enforcement_mode, priority, is_active },
    timestamp: new Date().toISOString()
  });

  return Response.json({ success: true });
}

async function deleteAssignment(base44, user, { assignment_id }) {
  const assignment = await base44.asServiceRole.entities.PolicyAssignment.get(assignment_id);

  await base44.asServiceRole.entities.PolicyAssignment.update(assignment_id, {
    is_active: false
  });

  await base44.asServiceRole.entities.AuditLog.create({
    organization_id: user.organization_id,
    actor: user.email,
    action: 'policy_assignment_deleted',
    entity_type: 'PolicyAssignment',
    entity_id: assignment_id,
    after_json: { deleted: true },
    timestamp: new Date().toISOString()
  });

  return Response.json({ success: true });
}

async function listAssignments(base44, user, { filters }) {
  const assignments = await base44.asServiceRole.entities.PolicyAssignment.filter({
    organization_id: user.organization_id,
    ...filters
  }, '-created_date');

  return Response.json({ assignments });
}