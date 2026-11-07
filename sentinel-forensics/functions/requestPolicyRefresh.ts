import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_id } = await req.json();

    if (!device_id) {
      return Response.json({ error: 'device_id required' }, { status: 400 });
    }

    // Verify device belongs to user's org
    const devices = await base44.entities.Device.filter({
      organization_id: user.organization_id,
      id: device_id
    });

    if (devices.length === 0) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    const correlation_id = crypto.randomUUID();

    // Create action_requested event
    await base44.asServiceRole.entities.DeviceEvent.create({
      organization_id: user.organization_id,
      device_id,
      event_type: 'action_requested',
      payload: {
        action: 'policy_refresh',
        requested_at: new Date().toISOString()
      },
      actor: 'user',
      actor_email: user.email,
      correlation_id,
      status: 'pending'
    });

    // Update device last_action fields
    await base44.asServiceRole.entities.Device.update(device_id, {
      last_action_at: new Date().toISOString(),
      last_action_status: 'pending'
    });

    return Response.json({
      success: true,
      correlation_id,
      message: 'Policy refresh queued for execution by agent'
    });
  } catch (error) {
    console.error('Policy refresh error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});