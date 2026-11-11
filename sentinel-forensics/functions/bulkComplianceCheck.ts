import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Bulk Compliance Check
 * Triggers compliance evaluation for multiple devices
 * Used for scheduled checks or manual bulk operations
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_ids, filter_all } = await req.json();

    let devicesToCheck = [];

    if (filter_all) {
      // Check all devices in organization
      devicesToCheck = await base44.entities.Device.filter({
        organization_id: user.organization_id
      }, '-agent_last_seen_at', 1000);
    } else if (device_ids && Array.isArray(device_ids)) {
      // Check specific devices
      const devices = await Promise.all(
        device_ids.map(id => 
          base44.entities.Device.filter({
            organization_id: user.organization_id,
            id
          })
        )
      );
      devicesToCheck = devices.flat();
    } else {
      return Response.json({ error: 'device_ids or filter_all required' }, { status: 400 });
    }

    // Trigger compliance checks (non-blocking)
    const results = {
      total: devicesToCheck.length,
      initiated: 0,
      failed: 0,
      errors: []
    };

    for (const device of devicesToCheck) {
      try {
        // Call evaluateDeviceCompliance function
        const response = await fetch(`${Deno.env.get('WS_URL')}/functions/evaluateDeviceCompliance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.get('Authorization') || ''
          },
          body: JSON.stringify({ device_id: device.id })
        });

        if (response.ok) {
          results.initiated++;
        } else {
          results.failed++;
          results.errors.push({
            device_id: device.id,
            error: await response.text()
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          device_id: device.id,
          error: error.message
        });
      }
    }

    return Response.json({
      success: true,
      results,
      message: `Compliance checks initiated for ${results.initiated}/${results.total} devices`
    });

  } catch (error) {
    console.error('Bulk compliance check error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});