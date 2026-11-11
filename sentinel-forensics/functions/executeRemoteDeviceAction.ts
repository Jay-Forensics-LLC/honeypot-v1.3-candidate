import { errorJson } from './helpers/http.ts';
import { z } from 'npm:zod@3.24.1';
import { getRequestId, logError, addRequestIdHeader } from './helpers/telemetry.ts';
import { readJsonLimited } from './helpers/body.ts';
import { requireRecentMfa } from './helpers/stepUp.ts';
import { requireUser, requireOrgContext, requirePermission } from './helpers/auth.ts';

// Allowlist derived from existing switch statement actions
const ALLOWED_ACTIONS = ['reboot', 'security_scan', 'update_agent'] as const;

const RemoteActionSchema = z.object({
  device_id: z.string().min(1, 'device_id required'),
  action: z.enum(ALLOWED_ACTIONS)
});

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  
  try {
    const { base44, user } = await requireUser(req);
    requireOrgContext(user);
    
    // RBAC: Require device:action permission
    requirePermission(user, 'device:action');

    // Parse JSON with size limits (2KB max for device actions)
    const body = await readJsonLimited(req, 2_000);
    
    // Strict input validation
    const validation = RemoteActionSchema.safeParse(body);
    if (!validation.success) {
      return Response.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { device_id, action } = validation.data;
    
    // Step-up auth: reboot is destructive (15 min MFA freshness)
    if (action === 'reboot') {
      const mfaCheck = await requireRecentMfa(base44, user, 15);
      if (mfaCheck) return addRequestIdHeader(mfaCheck, requestId);
    }

    // Validate device belongs to org
    const devices = await base44.asServiceRole.entities.Device.filter({
      organization_id: user.organization_id!,
      device_id: device_id
    });

    if (devices.length === 0) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    const device = devices[0];

    if (device.status !== 'enrolled') {
      return Response.json({ error: 'Device not enrolled' }, { status: 400 });
    }

    // Execute action
    let result;
    switch (action) {
      case 'reboot':
        result = await executeReboot(base44, device);
        break;
      case 'security_scan':
        result = await executeSecurityScan(base44, device);
        break;
      case 'update_agent':
        result = await executeAgentUpdate(base44, device);
        break;
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Audit log
    await base44.asServiceRole.entities.SentinelAuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: `remote_action_${action}`,
      resource_type: 'Device',
      resource_id: device.id,
      timestamp: new Date().toISOString(),
      hmac_signature: 'placeholder',
      severity: 'info',
      details: {
        device_id: device_id,
        action: action,
        result: result
      }
    });

    return addRequestIdHeader(
      Response.json({
        success: true,
        message: result.message,
        device_id: device_id,
        action: action
      }),
      requestId
    );

  } catch (error) {
    logError({ 
      requestId, 
      route: 'executeRemoteDeviceAction', 
      userId: user?.email,
      orgId: user?.organization_id 
    }, error);
    return addRequestIdHeader(errorJson(500, 'Remote action failed'), requestId);
  }
});

async function executeReboot(base44, device) {
  // Send reboot command to agent
  await base44.asServiceRole.entities.AgentCommand.create({
    organization_id: device.organization_id,
    device_id: device.device_id,
    command_type: 'reboot',
    status: 'pending',
    issued_at: new Date().toISOString()
  });

  return {
    message: 'Reboot command sent to device',
    status: 'pending'
  };
}

async function executeSecurityScan(base44, device) {
  // Trigger security scan
  await base44.asServiceRole.entities.AgentCommand.create({
    organization_id: device.organization_id,
    device_id: device.device_id,
    command_type: 'security_scan',
    parameters: {
      scan_type: 'full',
      include_malware: true,
      include_vulnerabilities: true
    },
    status: 'pending',
    issued_at: new Date().toISOString()
  });

  return {
    message: 'Security scan initiated on device',
    status: 'scanning'
  };
}

async function executeAgentUpdate(base44, device) {
  // Trigger agent update
  await base44.asServiceRole.entities.AgentCommand.create({
    organization_id: device.organization_id,
    device_id: device.device_id,
    command_type: 'update_agent',
    parameters: {
      target_version: 'latest'
    },
    status: 'pending',
    issued_at: new Date().toISOString()
  });

  return {
    message: 'Agent update initiated',
    status: 'updating'
  };
}