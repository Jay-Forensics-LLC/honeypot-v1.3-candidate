import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { requireOrgContext } from './helpers/orgContext.js';

/**
 * REMOTE EVIDENCE COLLECTION
 * Trigger memory capture, disk imaging, or file acquisition from remote endpoints
 * 
 * Security: Org-scoped, audit-logged, requires authenticated user
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
      collection_type, // 'memory', 'disk_image', 'files', 'triage'
      target_paths = [], // for file collection
      description = ''
    } = await req.json();

    // Validate inputs
    if (!device_id || !collection_type) {
      return Response.json({ 
        error: 'device_id and collection_type required' 
      }, { status: 400 });
    }

    const validTypes = ['memory', 'disk_image', 'files', 'triage'];
    if (!validTypes.includes(collection_type)) {
      return Response.json({ 
        error: `collection_type must be one of: ${validTypes.join(', ')}` 
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

    // Verify case access if provided
    if (case_id) {
      const cases = await base44.entities.Case.filter({ 
        id: case_id,
        organization_id: orgId 
      });

      if (!cases || cases.length === 0) {
        return Response.json({ 
          error: 'Case not found or access denied' 
        }, { status: 403 });
      }
    }

    // Build command payload based on collection type
    let commandPayload = { type: collection_type };
    
    if (collection_type === 'files' && target_paths.length > 0) {
      commandPayload.paths = target_paths;
    } else if (collection_type === 'triage') {
      // Predefined triage artifacts
      commandPayload.artifacts = [
        'system_logs',
        'registry_hives',
        'prefetch',
        'recent_files',
        'browser_history',
        'running_processes',
        'network_connections',
        'scheduled_tasks',
        'services'
      ];
    }

    // Create agent command
    const command = await base44.asServiceRole.entities.AgentCommand.create({
      organization_id: orgId,
      device_id,
      command_type: 'collect_evidence',
      command_payload: commandPayload,
      status: 'pending',
      requested_by: user.email,
      requested_at: new Date().toISOString(),
      case_id: case_id || null
    });

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: 'remote_collection_initiated',
      severity: 'info',
      description: `Remote ${collection_type} collection initiated on device ${device.hostname || device_id}`,
      resource_type: 'agent_command',
      resource_id: command.id,
      case_id,
      metadata: {
        device_id,
        collection_type,
        target_paths: collection_type === 'files' ? target_paths : undefined
      },
      success: true
    });

    // Create notification
    await base44.asServiceRole.entities.Notification.create({
      organization_id: orgId,
      user_email: user.email,
      type: 'case_status_changed',
      title: 'Evidence Collection Started',
      message: `Remote ${collection_type} collection initiated on ${device.hostname || 'endpoint'}`,
      severity: 'info',
      link: case_id ? `/CaseDetail/${case_id}` : `/Devices`,
      metadata: { command_id: command.id, device_id }
    });

    return Response.json({ 
      success: true,
      command_id: command.id,
      status: 'pending',
      message: `${collection_type} collection initiated. Agent will process the request.`,
      estimated_time: getEstimatedTime(collection_type)
    });

  } catch (error) {
    console.error('[RemoteEvidenceCollection] Error:', error);
    return Response.json({ 
      error: error.message || 'Collection failed' 
    }, { status: 500 });
  }
});

function getEstimatedTime(collectionType) {
  const estimates = {
    memory: '2-5 minutes',
    disk_image: '30-120 minutes (depends on disk size)',
    files: '1-10 minutes',
    triage: '5-15 minutes'
  };
  return estimates[collectionType] || 'Unknown';
}