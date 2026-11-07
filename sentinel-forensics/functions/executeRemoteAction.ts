import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Remote Action Executor
 * Handles remote device actions: agent update, reboot, etc.
 * Follows Enqueue → Execute → Report pattern
 */

const ACTION_TYPES = {
  agent_update: 'Agent Update',
  reboot: 'Reboot Device',
  policy_refresh: 'Policy Refresh'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_id, action_type, parameters = {} } = await req.json();

    if (!device_id || !action_type) {
      return Response.json({ 
        error: 'device_id and action_type required' 
      }, { status: 400 });
    }

    if (!ACTION_TYPES[action_type]) {
      return Response.json({ 
        error: `Invalid action_type. Valid types: ${Object.keys(ACTION_TYPES).join(', ')}` 
      }, { status: 400 });
    }

    // Fetch device
    const devices = await base44.entities.Device.filter({
      organization_id: user.organization_id,
      id: device_id
    });

    if (devices.length === 0) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    const device = devices[0];
    const correlationId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // STEP 1: ENQUEUE - Create action_requested event
    await base44.asServiceRole.entities.DeviceEvent.create({
      organization_id: user.organization_id,
      device_id,
      event_type: 'action_requested',
      payload: {
        action_type,
        action_name: ACTION_TYPES[action_type],
        parameters,
        requested_by: user.email,
        requested_at: new Date().toISOString(),
        device_info: {
          hostname: device.hostname,
          os: `${device.os_family} ${device.os_version}`,
          agent_version: device.agent_version
        }
      },
      actor: 'user',
      actor_email: user.email,
      correlation_id: correlationId,
      status: 'pending'
    });

    // STEP 2: EXECUTE - Simulate action execution
    // In production, this would:
    // - Call device API/agent endpoint
    // - Wait for acknowledgment
    // - Handle timeout/retry logic
    
    let executionSuccess = true;
    let executionError = null;
    let executionResult = {};

    try {
      // Check device online status
      if (device.agent_status === 'offline') {
        throw new Error('Device is offline - cannot execute remote action');
      }

      // Simulate execution based on action type
      switch (action_type) {
        case 'agent_update':
          // Simulate agent update
          const currentVersion = device.agent_version || '1.0.0';
          const newVersion = parameters.target_version || '2.0.0';
          
          if (currentVersion >= newVersion) {
            throw new Error(`Device already at version ${currentVersion} or higher`);
          }

          executionResult = {
            previous_version: currentVersion,
            new_version: newVersion,
            update_duration_ms: 5000,
            restart_required: true
          };
          
          // Update device agent version
          await base44.asServiceRole.entities.Device.update(device_id, {
            agent_version: newVersion,
            last_action_at: new Date().toISOString(),
            last_action_status: 'success'
          });
          break;

        case 'reboot':
          // Simulate reboot
          executionResult = {
            reboot_type: parameters.force ? 'force' : 'graceful',
            scheduled_time: new Date().toISOString(),
            expected_downtime_seconds: 120
          };
          
          await base44.asServiceRole.entities.Device.update(device_id, {
            agent_status: 'offline',
            last_action_at: new Date().toISOString(),
            last_action_status: 'success'
          });
          break;

        case 'policy_refresh':
          // Simulate policy refresh
          executionResult = {
            policies_updated: ['compliance', 'security', 'monitoring'],
            refresh_duration_ms: 1000
          };
          
          await base44.asServiceRole.entities.Device.update(device_id, {
            last_action_at: new Date().toISOString(),
            last_action_status: 'success'
          });
          break;

        default:
          throw new Error(`Unhandled action type: ${action_type}`);
      }

    } catch (error) {
      executionSuccess = false;
      executionError = error.message;
      
      // Update device with failure status
      await base44.asServiceRole.entities.Device.update(device_id, {
        last_action_at: new Date().toISOString(),
        last_action_status: 'failure'
      });
    }

    // STEP 3: REPORT - Create action_result event
    await base44.asServiceRole.entities.DeviceEvent.create({
      organization_id: user.organization_id,
      device_id,
      event_type: 'action_result',
      payload: {
        action_type,
        action_name: ACTION_TYPES[action_type],
        executed_at: new Date().toISOString(),
        execution_duration_ms: 2000,
        result: executionSuccess ? executionResult : null,
        error_details: executionError
      },
      actor: 'system',
      correlation_id: correlationId,
      status: executionSuccess ? 'success' : 'failure',
      error_message: executionError
    });

    return Response.json({
      success: executionSuccess,
      device_id,
      action_type,
      action_name: ACTION_TYPES[action_type],
      correlation_id: correlationId,
      result: executionSuccess ? executionResult : null,
      error: executionError,
      message: executionSuccess 
        ? `${ACTION_TYPES[action_type]} executed successfully`
        : `${ACTION_TYPES[action_type]} failed: ${executionError}`
    });

  } catch (error) {
    console.error('Remote action execution error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});