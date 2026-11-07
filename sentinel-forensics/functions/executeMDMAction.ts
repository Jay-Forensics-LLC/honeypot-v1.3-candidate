import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_id, action_type, ...actionParams } = await req.json();

    if (!device_id || !action_type) {
      return Response.json({ 
        error: 'Missing required parameters: device_id and action_type' 
      }, { status: 400 });
    }

    // Fetch device with org validation
    const devices = await base44.entities.Device.filter({
      id: device_id,
      organization_id: user.organization_id
    });

    const device = devices[0];
    if (!device) {
      return Response.json({ 
        error: 'Device not found or access denied' 
      }, { status: 404 });
    }

    // Create MDM action record
    const actionRecord = await base44.asServiceRole.entities.MDMAction.create({
      organization_id: user.organization_id,
      device_id: device_id,
      action_type: action_type,
      status: 'pending',
      initiated_by: user.email,
      initiated_at: new Date().toISOString(),
      parameters: actionParams
    });

    // Execute action based on type
    let result = {};
    const now = new Date().toISOString();

    switch (action_type) {
      case 'isolate_network':
        await base44.asServiceRole.entities.Device.update(device_id, {
          isolation_status: {
            is_isolated: true,
            isolated_at: now,
            isolated_by: user.email,
            reason: actionParams.reason || 'Manual isolation due to security concern'
          },
          status: 'suspended'
        });
        result = { isolated: true };
        break;

      case 'revoke_credentials':
        await base44.asServiceRole.entities.Device.update(device_id, {
          credential_status: {
            credentials_valid: false,
            last_revoked: now,
            revoked_by: user.email
          }
        });
        result = { credentials_revoked: true };
        break;

      case 'lock_device':
        await base44.asServiceRole.entities.Device.update(device_id, {
          status: 'suspended'
        });
        result = { locked: true };
        break;

      case 'force_scan':
        await base44.asServiceRole.entities.Device.update(device_id, {
          last_security_scan: now
        });
        result = { scan_initiated: true };
        break;

      default:
        throw new Error(`Unknown action type: ${action_type}`);
    }

    // Update action record
    await base44.asServiceRole.entities.MDMAction.update(actionRecord.id, {
      status: 'completed',
      completed_at: now,
      result: result
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'mdm_action_executed',
      severity: 'warning',
      description: `MDM action ${action_type} executed on device ${device.display_name}`,
      user_id: user.email,
      resource_type: 'Device',
      resource_id: device_id,
      action_performed: action_type,
      timestamp: now,
      blockchain_hash: crypto.randomUUID(),
      metadata: {
        action_id: actionRecord.id,
        device_name: device.display_name,
        platform: device.platform
      },
      success: true
    });

    return Response.json({
      success: true,
      action_id: actionRecord.id,
      result
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});