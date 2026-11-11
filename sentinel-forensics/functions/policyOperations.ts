import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import crypto from 'node:crypto';
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
        return await createPolicy(base44, user, params);
      case 'update':
        return await updatePolicy(base44, user, params);
      case 'publishPolicy':
        return await publishPolicy(base44, user, params);
      case 'clone':
        return await clonePolicy(base44, user, params);
      case 'archive':
        return await archivePolicy(base44, user, params);
      case 'validatePolicyPayload':
        return validatePolicyPayload(params);
      default:
        return Response.json({ error: 'Unknown operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('Policy operation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function updatePolicy(base44, user, { policy_id, name, description, policy_payload_json }) {
  const validation = validatePayloadStructure(policy_payload_json);
  if (!validation.valid) {
    return Response.json({ error: 'Invalid policy payload', details: validation.errors }, { status: 400 });
  }

  const policy_hash = crypto.createHash('sha256')
    .update(JSON.stringify(policy_payload_json))
    .digest('hex');

  const beforeState = await base44.asServiceRole.entities.SecurityPolicy.get(policy_id);

  // PHASE 3: Route through versioning system
  // Check if policy has active version (new lifecycle)
  const activeVersions = await base44.asServiceRole.entities.PolicyVersion.filter({
    policy_id,
    status: 'ACTIVE'
  }, '-version_number', 1);

  if (activeVersions.length > 0) {
    // Policy uses new version lifecycle - create new draft version instead
    const currentVersion = activeVersions[0];
    const newVersionNumber = currentVersion.version_number + 1;

    const newVersion = await base44.asServiceRole.entities.PolicyVersion.create({
      organization_id: user.organization_id,
      policy_id,
      version_number: newVersionNumber,
      status: 'DRAFT',
      payload: policy_payload_json,
      change_summary: 'Updated via legacy endpoint',
      created_by: user.email
    });

    await writeAuditLog(base44, {
      organization_id: user.organization_id,
      event_type: 'policy_version_created',
      severity: 'info',
      description: `Created draft version ${newVersionNumber} for policy "${name}" via legacy update`,
      actor: user.email,
      success: true,
      metadata: { policy_id, version_number: newVersionNumber, via_legacy_endpoint: true },
      entity_type: 'PolicyVersion',
      entity_id: newVersion.id
    });

    return Response.json({ 
      policy_id,
      version_created: newVersionNumber,
      status: 'DRAFT',
      message: 'Created draft version. Submit for approval to activate.',
      version_id: newVersion.id
    });
  }

  // LEGACY FALLBACK: Policy not yet migrated to version system
  await base44.asServiceRole.entities.SecurityPolicy.update(policy_id, {
    name,
    description,
    policy_payload_json,
    policy_hash,
    updated_by: user.email
  });

  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_updated',
    severity: 'warning',
    description: `Updated policy "${name}" (LEGACY: not using version system)`,
    actor: user.email,
    success: true,
    before_json: { name: beforeState.name, version: beforeState.version },
    after_json: { name, updated_by: user.email },
    entity_type: 'SecurityPolicy',
    entity_id: policy_id,
    metadata: { legacy_update_fallback: true }
  });

  const policy = await base44.asServiceRole.entities.SecurityPolicy.get(policy_id);
  return Response.json({ policy, warning: 'Updated directly (policy not migrated to version system)' });
}

async function createPolicy(base44, user, { name, description, policy_payload_json, organization_id }) {
  // Validate payload structure
  const validation = validatePayloadStructure(policy_payload_json);
  if (!validation.valid) {
    return Response.json({ error: 'Invalid policy payload', details: validation.errors }, { status: 400 });
  }

  const policy_hash = crypto.createHash('sha256')
    .update(JSON.stringify(policy_payload_json))
    .digest('hex');

  const policy = await base44.asServiceRole.entities.SecurityPolicy.create({
    organization_id: user.organization_id,
    name,
    description,
    status: 'DRAFT',
    version: 1,
    is_enabled: false,
    policy_payload_json,
    policy_hash,
    updated_by: user.email
  });

  // PHASE 3: Create initial draft version
  const version = await base44.asServiceRole.entities.PolicyVersion.create({
    organization_id: user.organization_id,
    policy_id: policy.id,
    version_number: 1,
    status: 'DRAFT',
    payload: policy_payload_json,
    change_summary: 'Initial policy creation',
    created_by: user.email
  });

  // Audit log using standardized helper
  await writeAuditLog(base44, {
    organization_id: user.organization_id,
    event_type: 'policy_created',
    severity: 'info',
    description: `Created policy "${name}" with draft version 1`,
    actor: user.email,
    success: true,
    metadata: { status: 'DRAFT', version: 1, version_id: version.id },
    after_json: { name, status: 'DRAFT', version: 1 },
    entity_type: 'SecurityPolicy',
    entity_id: policy.id
  });

  return Response.json({ policy, version_id: version.id });
}

async function publishPolicy(base44, user, { policy_id }) {
  const existingPolicy = await base44.asServiceRole.entities.SecurityPolicy.get(policy_id);
  
  if (existingPolicy.status === 'PUBLISHED') {
    // Create new version
    const policy_hash = crypto.createHash('sha256')
      .update(JSON.stringify(existingPolicy.policy_payload_json))
      .digest('hex');

    const newVersion = await base44.asServiceRole.entities.SecurityPolicy.create({
      organization_id: user.organization_id,
      name: existingPolicy.name,
      description: existingPolicy.description,
      status: 'PUBLISHED',
      version: existingPolicy.version + 1,
      parent_policy_id: policy_id,
      is_enabled: true,
      policy_payload_json: existingPolicy.policy_payload_json,
      policy_hash,
      updated_by: user.email
    });

    // Archive old version
    await base44.asServiceRole.entities.SecurityPolicy.update(policy_id, {
      status: 'ARCHIVED',
      is_enabled: false
    });

    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      actor: user.email,
      action: 'policy_version_published',
      entity_type: 'SecurityPolicy',
      entity_id: newVersion.id,
      after_json: { version: newVersion.version, parent_id: policy_id },
      timestamp: new Date().toISOString()
    });

    return Response.json({ policy: newVersion, version_incremented: true });
  } else {
    // First publish
    await base44.asServiceRole.entities.SecurityPolicy.update(policy_id, {
      status: 'PUBLISHED',
      is_enabled: true,
      updated_by: user.email
    });

    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      actor: user.email,
      action: 'policy_published',
      entity_type: 'SecurityPolicy',
      entity_id: policy_id,
      after_json: { status: 'PUBLISHED' },
      timestamp: new Date().toISOString()
    });

    return Response.json({ policy_id, status: 'PUBLISHED' });
  }
}

async function clonePolicy(base44, user, { policy_id, new_name }) {
  const source = await base44.asServiceRole.entities.SecurityPolicy.get(policy_id);
  
  const policy_hash = crypto.createHash('sha256')
    .update(JSON.stringify(source.policy_payload_json))
    .digest('hex');

  const cloned = await base44.asServiceRole.entities.SecurityPolicy.create({
    organization_id: user.organization_id,
    name: new_name || `${source.name} (Copy)`,
    description: source.description,
    status: 'DRAFT',
    version: 1,
    is_enabled: false,
    policy_payload_json: source.policy_payload_json,
    policy_hash,
    updated_by: user.email
  });

  await base44.asServiceRole.entities.AuditLog.create({
    organization_id: user.organization_id,
    actor: user.email,
    action: 'policy_cloned',
    entity_type: 'SecurityPolicy',
    entity_id: cloned.id,
    after_json: { cloned_from: policy_id },
    timestamp: new Date().toISOString()
  });

  return Response.json({ policy: cloned });
}

async function archivePolicy(base44, user, { policy_id }) {
  await base44.asServiceRole.entities.SecurityPolicy.update(policy_id, {
    status: 'ARCHIVED',
    is_enabled: false,
    updated_by: user.email
  });

  await base44.asServiceRole.entities.AuditLog.create({
    organization_id: user.organization_id,
    actor: user.email,
    action: 'policy_archived',
    entity_type: 'SecurityPolicy',
    entity_id: policy_id,
    timestamp: new Date().toISOString()
  });

  return Response.json({ success: true });
}

function validatePolicyPayload(params) {
  const validation = validatePayloadStructure(params.policy_payload_json);
  return Response.json(validation);
}

function validatePayloadStructure(payload) {
  const errors = [];

  // Validate auto_response_rules
  if (payload.auto_response_rules) {
    payload.auto_response_rules.forEach((rule, idx) => {
      if (!rule.trigger_event) errors.push(`Rule ${idx}: missing trigger_event`);
      if (!rule.actions) errors.push(`Rule ${idx}: missing actions`);
    });
  }

  // Validate firewall_config
  if (payload.firewall_config) {
    if (!['STRICT', 'BALANCED', 'CUSTOM'].includes(payload.firewall_config.profile)) {
      errors.push('Invalid firewall profile');
    }
  }

  // Validate usb_restrictions
  if (payload.usb_restrictions) {
    if (!['ALLOW_ALL', 'BLOCK_ALL', 'ALLOWLIST', 'BLOCKLIST'].includes(payload.usb_restrictions.mode)) {
      errors.push('Invalid USB restriction mode');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}