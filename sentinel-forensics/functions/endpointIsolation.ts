import { requireUser, requireOrgContext, requirePermission } from './helpers/auth.ts';
import { errorJson } from './helpers/http.ts';
import { requireRecentMfa } from './helpers/stepUp.ts';

/**
 * ENDPOINT ISOLATION (ADMIN ONLY)
 * Quarantine/isolate compromised endpoints from network
 * 
 * Security: Admin-only, org-scoped, audit-logged, critical action
 */
Deno.serve(async (req) => {
  try {
    const { base44, user } = await requireUser(req);
    requireOrgContext(user);
    
    // RBAC: Only users with device:isolate permission
    requirePermission(user, 'device:isolate');
    
    // Step-up auth: isolation/restore is critical (15 min MFA freshness)
    const mfaCheck = await requireRecentMfa(base44, user, 15);
    if (mfaCheck) return mfaCheck;
    
    const orgId = user.organization_id;

    const {
      device_id,
      case_id,
      action, // 'isolate' or 'restore'
      reason = '',
      allow_list = [] // IPs/domains to allow during isolation (e.g., forensic server)
    } = await req.json();

    // Validate inputs
    if (!device_id || !action) {
      return Response.json({ 
        error: 'device_id and action required' 
      }, { status: 400 });
    }

    if (!['isolate', 'restore'].includes(action)) {
      return Response.json({ 
        error: 'action must be "isolate" or "restore"' 
      }, { status: 400 });
    }

    // Verify device belongs to org
    const devices = await base44.entities.Device.filter({ 
      id: device_id,
      organization_id: orgId 
    });

    if (!devices || devices.length === 0) {
      return Response.json({ 
        error: 'Device not found or access denied' 
      }, { status: 403 });
    }

    const device = devices[0];

    // Check current isolation status
    if (action === 'isolate' && device.is_isolated) {
      return Response.json({ 
        error: 'Device is already isolated',
        current_status: 'isolated'
      }, { status: 400 });
    }

    if (action === 'restore' && !device.is_isolated) {
      return Response.json({ 
        error: 'Device is not currently isolated',
        current_status: 'active'
      }, { status: 400 });
    }

    // Create isolation command
    const command = await base44.asServiceRole.entities.AgentCommand.create({
      organization_id: orgId,
      device_id,
      command_type: action === 'isolate' ? 'isolate_endpoint' : 'restore_endpoint',
      command_payload: {
        allow_list: action === 'isolate' ? allow_list : [],
        reason
      },
      status: 'pending',
      requested_by: user.email,
      requested_at: new Date().toISOString(),
      case_id: case_id || null
    });

    // Update device isolation status
    await base44.asServiceRole.entities.Device.update(device_id, {
      is_isolated: action === 'isolate',
      isolation_status: action === 'isolate' ? 'pending_isolation' : 'pending_restore',
      last_isolation_action: new Date().toISOString(),
      last_isolation_by: user.email
    });

    // Create containment action record
    await base44.asServiceRole.entities.ContainmentAction.create({
      organization_id: orgId,
      device_id,
      action_type: action === 'isolate' ? 'network_isolation' : 'restore_access',
      status: 'pending',
      triggered_by: user.email,
      reason,
      case_id: case_id || null
    });

    // Create critical audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: action === 'isolate' ? 'endpoint_isolated' : 'endpoint_restored',
      severity: 'critical',
      description: `Endpoint ${action} initiated: ${device.hostname || device_id}. Reason: ${reason || 'None provided'}`,
      resource_type: 'device',
      resource_id: device_id,
      case_id,
      metadata: {
        device_id,
        action,
        reason,
        allow_list: action === 'isolate' ? allow_list : undefined
      },
      success: true
    });

    // Create critical notification
    await base44.asServiceRole.entities.Notification.create({
      organization_id: orgId,
      user_email: user.email,
      type: 'alert_critical',
      title: action === 'isolate' ? 'Endpoint Isolated' : 'Endpoint Restored',
      message: `${device.hostname || 'Endpoint'} ${action} command sent. ${action === 'isolate' ? 'Network access blocked.' : 'Network access restored.'}`,
      severity: 'critical',
      link: case_id ? `/CaseDetail/${case_id}` : `/Devices`,
      metadata: { command_id: command.id, device_id }
    });

    return Response.json({ 
      success: true,
      command_id: command.id,
      status: 'pending',
      message: `${action === 'isolate' ? 'Isolation' : 'Restoration'} command sent to endpoint.`,
      device_status: action === 'isolate' ? 'pending_isolation' : 'pending_restore'
    });

  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[EndpointIsolation] Error:', error);
    return errorJson(500, 'Isolation action failed');
  }
});