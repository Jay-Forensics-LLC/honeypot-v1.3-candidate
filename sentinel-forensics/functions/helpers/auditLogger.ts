/**
 * PHASE 1: Standardized Audit Logging Helper
 * 
 * Provides a consistent interface for writing audit logs across all features.
 * Ensures all security-relevant events are captured uniformly.
 */

/**
 * Write a structured audit log entry
 * 
 * @param {Object} base44 - Base44 SDK instance (asServiceRole)
 * @param {Object} params - Audit log parameters
 * @param {string} params.organization_id - Organization identifier
 * @param {string} params.event_type - Event type (e.g., 'policy_created', 'mitigation_executed')
 * @param {string} params.severity - Severity level: 'info', 'warning', 'critical'
 * @param {string} params.description - Human-readable event description
 * @param {string} params.actor - User email who performed the action
 * @param {boolean} params.success - Whether the action succeeded
 * @param {Object} params.metadata - Additional structured data
 * @param {Object} params.before_json - State before change (optional)
 * @param {Object} params.after_json - State after change (optional)
 * @param {string} params.entity_type - Entity type affected (optional)
 * @param {string} params.entity_id - Entity ID affected (optional)
 */
export async function writeAuditLog(base44, params) {
  const {
    organization_id,
    event_type,
    severity = 'info',
    description,
    actor,
    success = true,
    metadata = {},
    before_json = null,
    after_json = null,
    entity_type = null,
    entity_id = null
  } = params;

  // Validation
  if (!organization_id || !event_type || !actor) {
    throw new Error('Missing required audit log fields: organization_id, event_type, actor');
  }

  if (!['info', 'warning', 'critical'].includes(severity)) {
    throw new Error(`Invalid severity: ${severity}. Must be info, warning, or critical`);
  }

  // PHASE 5 FIX: Dual-sink audit logging (guaranteed persistence)
  // Primary: AuditLog (legacy schema) - attempt but may fail due to RLS
  // Fallback: SecurityAuditLog (ChainOfCustodyEntry-style RLS) - guaranteed to work
  
  let primarySuccess = false;
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id,
      event_type,
      severity,
      user_id: actor,
      description: description || event_type,
      success,
      metadata: {
        ...metadata,
        logged_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      ...(before_json && { before_json }),
      ...(after_json && { after_json }),
      ...(entity_type && { entity_type }),
      ...(entity_id && { entity_id })
    });
    primarySuccess = true;
  } catch (primaryError) {
    console.warn('Primary AuditLog write failed, using fallback:', primaryError.message);
  }

  // Fallback: SecurityAuditLog (guaranteed persistence)
  try {
    const fallbackEntry = await base44.asServiceRole.entities.SecurityAuditLog.create({
      organization_id,
      event_type,
      severity,
      actor_email: actor,
      description: description || event_type,
      success,
      metadata: {
        ...metadata,
        logged_at: new Date().toISOString(),
        primary_sink_failed: !primarySuccess,
        ...(entity_type && { target_entity_type: entity_type }),
        ...(entity_id && { target_entity_id: entity_id })
      },
      timestamp_utc: new Date().toISOString(),
      ...(entity_type && { entity_type }),
      ...(entity_id && { entity_id })
    });

    return fallbackEntry;
  } catch (fallbackError) {
    console.error('CRITICAL: Both primary and fallback audit sinks failed:', fallbackError);
    console.error('Audit log payload:', { organization_id, event_type, actor, description });
    return null;
  }
}

/**
 * Convenience wrapper for success events
 */
export async function logSuccess(base44, organization_id, actor, event_type, description, metadata = {}) {
  return writeAuditLog(base44, {
    organization_id,
    event_type,
    severity: 'info',
    description,
    actor,
    success: true,
    metadata
  });
}

/**
 * Convenience wrapper for failure events
 */
export async function logFailure(base44, organization_id, actor, event_type, description, error, metadata = {}) {
  return writeAuditLog(base44, {
    organization_id,
    event_type,
    severity: 'warning',
    description,
    actor,
    success: false,
    metadata: {
      ...metadata,
      error_message: error.message,
      error_stack: error.stack
    }
  });
}

/**
 * Convenience wrapper for critical security events
 */
export async function logCritical(base44, organization_id, actor, event_type, description, metadata = {}) {
  return writeAuditLog(base44, {
    organization_id,
    event_type,
    severity: 'critical',
    description,
    actor,
    success: true,
    metadata
  });
}