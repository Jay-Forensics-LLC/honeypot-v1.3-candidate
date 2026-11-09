import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Execute remote command on endpoint agent
 * Supports: isolate_device, kill_process, update_agent, collect_logs, restart_service
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { agentId, commandType, params } = await req.json();

    if (!agentId || !commandType) {
      return Response.json({ 
        error: 'Missing required fields',
        required: ['agentId', 'commandType']
      }, { status: 400 });
    }

    // Verify agent exists
    const agents = await base44.asServiceRole.entities.EndpointAgent.filter({ agent_id: agentId });
    if (!agents || agents.length === 0) {
      return Response.json({ error: 'Agent not found' }, { status: 404 });
    }
    const agent = agents[0];

    // Permission check: only admin or owner can execute commands
    if (user.role !== 'admin' && agent.owner_email !== user.email) {
      return Response.json({ error: 'Unauthorized to control this agent' }, { status: 403 });
    }

    // Validate command type
    const allowedCommands = ['isolate_device', 'kill_process', 'update_agent', 'collect_logs', 'restart_service', 'run_health_check'];
    if (!allowedCommands.includes(commandType)) {
      return Response.json({ 
        error: 'Invalid command type',
        allowed: allowedCommands
      }, { status: 400 });
    }

    // Create command record
    const commandId = `CMD-${Date.now()}`;
    const command = await base44.asServiceRole.entities.AgentCommand.create({
      device_id: agent.id,
      command_kind: commandType,
      params: params || {},
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min expiry
      counter: Date.now(),
      server_signature: 'PLACEHOLDER',
      status: 'queued',
      issued_by: user.email
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'remote_command_issued',
      severity: commandType === 'isolate_device' ? 'warning' : 'info',
      description: `Remote command "${commandType}" issued to agent ${agent.hostname}`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        agent_id: agentId,
        command_type: commandType,
        command_id: commandId
      }
    });

    return Response.json({
      success: true,
      command_id: commandId,
      status: 'queued',
      message: `Command "${commandType}" queued for execution on ${agent.hostname}`
    });
  } catch (error) {
    console.error('Remote command error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});