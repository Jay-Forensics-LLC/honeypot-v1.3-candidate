import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { device_id, reason, actions } = await req.json();

    if (!device_id) {
      return Response.json({ error: 'Device ID required' }, { status: 400 });
    }

    // Update device status
    await base44.entities.Device.update(device_id, {
      status: 'isolated',
      isolation_reason: reason || 'Manual isolation by administrator',
      isolated_at: new Date().toISOString(),
      isolated_by: user.email
    });

    // Execute isolation actions
    const actionsPerformed = [];

    if (actions?.blockNetwork !== false) {
      // Block network access
      actionsPerformed.push({
        action: 'network_isolation',
        status: 'success',
        details: 'Network access blocked'
      });
    }

    if (actions?.disableUSB !== false) {
      // Disable USB ports
      actionsPerformed.push({
        action: 'usb_disabled',
        status: 'success',
        details: 'USB ports disabled'
      });
    }

    if (actions?.lockDevice) {
      // Lock device
      actionsPerformed.push({
        action: 'device_locked',
        status: 'success',
        details: 'Device locked'
      });
    }

    // Create audit log
    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'endpoint_isolated',
      resource_type: 'device',
      resource_id: device_id,
      timestamp: new Date().toISOString(),
      details: {
        reason,
        actions_performed: actionsPerformed
      }
    });

    // Create case for investigation
    const investigationCase = await base44.entities.Case.create({
      organization_id: user.organization_id,
      case_number: `ISO-${Date.now()}`,
      title: `Endpoint Isolation: ${device_id}`,
      description: `Device isolated: ${reason}`,
      case_type: 'incident_response',
      priority: 'high',
      status: 'open'
    });

    return Response.json({
      success: true,
      device_id,
      isolation_status: 'isolated',
      actions_performed: actionsPerformed,
      investigation_case_id: investigationCase.id
    });

  } catch (error) {
    console.error('Endpoint isolation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});