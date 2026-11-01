import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { device_id, operation, parameters } = await req.json();

    if (!device_id || !operation) {
      return Response.json({ error: 'Device ID and operation required' }, { status: 400 });
    }

    let result = {};

    switch (operation) {
      case 'list_processes':
        result = {
          processes: [
            { pid: 1234, name: 'explorer.exe', cpu: 2.5, memory: 45000, user: 'SYSTEM' },
            { pid: 5678, name: 'chrome.exe', cpu: 15.3, memory: 250000, user: 'Administrator' }
          ]
        };
        break;

      case 'terminate_process':
        if (!parameters?.pid) {
          return Response.json({ error: 'PID required' }, { status: 400 });
        }
        result = {
          success: true,
          pid: parameters.pid,
          message: `Process ${parameters.pid} terminated`
        };
        break;

      case 'list_files':
        result = {
          path: parameters?.path || 'C:\\',
          files: [
            { name: 'Windows', type: 'directory', size: 0, modified: new Date().toISOString() },
            { name: 'Program Files', type: 'directory', size: 0, modified: new Date().toISOString() }
          ]
        };
        break;

      case 'get_file':
        if (!parameters?.path) {
          return Response.json({ error: 'File path required' }, { status: 400 });
        }
        result = {
          path: parameters.path,
          size: 1024,
          hash: 'abc123def456',
          content_preview: 'File content...'
        };
        break;

      case 'run_command':
        if (!parameters?.command) {
          return Response.json({ error: 'Command required' }, { status: 400 });
        }
        result = {
          command: parameters.command,
          output: 'Command output...',
          exit_code: 0
        };
        break;

      case 'capture_memory':
        result = {
          success: true,
          dump_size: 8589934592,
          location: '/forensics/memory_dumps/device_' + device_id + '.dmp'
        };
        break;

      default:
        return Response.json({ error: 'Unknown operation' }, { status: 400 });
    }

    // Audit the investigation action
    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: `remote_investigation_${operation}`,
      resource_type: 'device',
      resource_id: device_id,
      timestamp: new Date().toISOString(),
      details: {
        operation,
        parameters,
        result
      }
    });

    return Response.json({
      success: true,
      operation,
      device_id,
      result
    });

  } catch (error) {
    console.error('Remote investigation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});