/**
 * Execute Device Action
 * Performs remote actions on devices (requires appropriate permissions)
 * 
 * SECURITY: Actions must be role-checked and audited
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireOrg, sanitizeError } from './helpers/security.js';
import { validateInput, DeviceActionSchema } from './helpers/zodSchemas.ts';
import { secureJsonResponse } from './helpers/securityHeaders.ts';

const HIGH_RISK_ACTIONS = ['wipe', 'isolate'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const orgId = requireOrg(user);
    
    const body = await req.json();
    const validation = validateInput(DeviceActionSchema, body);
    
    if (!validation.success) {
      return secureJsonResponse({ error: 'Invalid input', details: validation.errors }, 400);
    }
    
    const { device_id, action, parameters, reason } = validation.data;
    
    // High-risk actions require admin role
    if (HIGH_RISK_ACTIONS.includes(action) && user.role !== 'admin') {
      await base44.asServiceRole.entities.SecurityAuditLog.create({
        organization_id: orgId,
        event_type: 'unauthorized_device_action_attempt',
        severity: 'warning',
        description: `Non-admin attempted high-risk action: ${action}`,
        actor_email: user.email,
        success: false,
        metadata: { device_id, action },
        timestamp_utc: new Date().toISOString()
      });
      
      return secureJsonResponse({ error: 'Admin role required for this action' }, 403);
    }
    
    // Verify device belongs to organization
    const devices = await base44.asServiceRole.entities.Device.filter({
      organization_id: orgId,
      id: device_id
    });
    
    if (devices.length === 0) {
      return secureJsonResponse({ error: 'Device not found' }, 404);
    }
    
    // Create action command
    const command = await base44.asServiceRole.entities.AgentCommand.create({
      organization_id: orgId,
      device_id,
      command_type: action,
      parameters: parameters || {},
      status: 'pending',
      initiated_by: user.email,
      reason: reason || `User-initiated ${action}`
    });
    
    // Audit log
    await base44.asServiceRole.entities.SecurityAuditLog.create({
      organization_id: orgId,
      event_type: 'device_action_executed',
      severity: HIGH_RISK_ACTIONS.includes(action) ? 'critical' : 'info',
      description: `Device action: ${action}`,
      actor_email: user.email,
      success: true,
      metadata: { device_id, action, command_id: command.id, reason },
      timestamp_utc: new Date().toISOString()
    });
    
    return secureJsonResponse({
      success: true,
      command_id: command.id,
      message: `Action ${action} queued for device`
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[DEVICE-ACTION] Error:', error);
    return secureJsonResponse(sanitizeError(error), 500);
  }
});