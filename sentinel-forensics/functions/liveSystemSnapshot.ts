import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { requireOrgContext } from './helpers/orgContext.js';

/**
 * LIVE SYSTEM SNAPSHOT
 * Get real-time state of endpoint: processes, connections, users, etc.
 * 
 * Security: Org-scoped, audit-logged, read-only operation
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = requireOrgContext(user);

    const {
      device_id,
      case_id,
      snapshot_types = ['processes', 'network', 'users', 'services'] // what to capture
    } = await req.json();

    // Validate inputs
    if (!device_id) {
      return Response.json({ 
        error: 'device_id required' 
      }, { status: 400 });
    }

    const validTypes = ['processes', 'network', 'users', 'services', 'files', 'registry'];
    const invalidTypes = snapshot_types.filter(t => !validTypes.includes(t));
    
    if (invalidTypes.length > 0) {
      return Response.json({ 
        error: `Invalid snapshot types: ${invalidTypes.join(', ')}` 
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

    // Create snapshot command
    const command = await base44.asServiceRole.entities.AgentCommand.create({
      organization_id: orgId,
      device_id,
      command_type: 'live_snapshot',
      command_payload: {
        snapshot_types
      },
      status: 'pending',
      requested_by: user.email,
      requested_at: new Date().toISOString(),
      case_id: case_id || null
    });

    // Poll for result (wait up to 30 seconds)
    const maxWaitTime = 30000; // 30 seconds
    const pollInterval = 1000; // 1 second
    const startTime = Date.now();

    let result = null;
    while (Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const results = await base44.asServiceRole.entities.AgentResult.filter({
        command_id: command.id,
        organization_id: orgId
      });

      if (results && results.length > 0) {
        result = results[0];
        break;
      }

      // Check if command failed
      const updatedCommands = await base44.asServiceRole.entities.AgentCommand.filter({
        id: command.id
      });

      if (updatedCommands[0]?.status === 'failed') {
        throw new Error('Agent command failed');
      }
    }

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: 'live_snapshot_captured',
      severity: 'info',
      description: `Live system snapshot captured from ${device.hostname || device_id}`,
      resource_type: 'agent_command',
      resource_id: command.id,
      case_id,
      metadata: {
        device_id,
        snapshot_types,
        success: !!result
      },
      success: !!result
    });

    if (!result) {
      return Response.json({ 
        success: false,
        command_id: command.id,
        status: 'timeout',
        message: 'Snapshot request timed out. Agent may be offline or busy.'
      });
    }

    // Parse and return snapshot data
    return Response.json({ 
      success: true,
      command_id: command.id,
      device_id,
      device_name: device.hostname,
      timestamp: result.result_timestamp,
      snapshot: result.result_data,
      status: 'completed'
    });

  } catch (error) {
    console.error('[LiveSystemSnapshot] Error:', error);
    return Response.json({ 
      error: error.message || 'Snapshot capture failed' 
    }, { status: 500 });
  }
});