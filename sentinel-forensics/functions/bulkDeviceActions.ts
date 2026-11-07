import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { device_ids, action, parameters } = await req.json();

    if (!device_ids || !Array.isArray(device_ids) || device_ids.length === 0) {
      return Response.json({ error: 'Device IDs required' }, { status: 400 });
    }

    const results = [];

    for (const device_id of device_ids) {
      try {
        switch (action) {
          case 'isolate':
            await base44.entities.Device.update(device_id, {
              status: 'isolated',
              isolated_by: user.email,
              isolated_at: new Date().toISOString()
            });
            results.push({ device_id, success: true, action: 'isolated' });
            break;

          case 'unisolate':
            await base44.entities.Device.update(device_id, {
              status: 'active',
              isolated_by: null,
              isolated_at: null
            });
            results.push({ device_id, success: true, action: 'unisolated' });
            break;

          case 'update_agent':
            results.push({ device_id, success: true, action: 'agent_update_queued' });
            break;

          case 'scan':
            await base44.functions.invoke('analyzeEndpointBehavior', { device_id });
            results.push({ device_id, success: true, action: 'scan_started' });
            break;

          case 'tag':
            const device = await base44.entities.Device.filter({ id: device_id });
            if (device[0]) {
              const tags = device[0].tags || [];
              await base44.entities.Device.update(device_id, {
                tags: [...new Set([...tags, ...(parameters?.tags || [])])]
              });
            }
            results.push({ device_id, success: true, action: 'tagged' });
            break;

          default:
            results.push({ device_id, success: false, error: 'Unknown action' });
        }
      } catch (error) {
        results.push({ device_id, success: false, error: error.message });
      }
    }

    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: `bulk_device_${action}`,
      resource_type: 'device',
      timestamp: new Date().toISOString(),
      details: { device_count: device_ids.length, results }
    });

    return Response.json({
      success: true,
      total: device_ids.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });

  } catch (error) {
    console.error('Bulk action error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});