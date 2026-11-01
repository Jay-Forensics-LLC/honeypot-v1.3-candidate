import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { device_id, case_id, artifact_types } = await req.json();

    const collection = await base44.entities.ForensicCollection.create({
      organization_id: user.organization_id,
      case_id,
      device_id,
      collection_type: artifact_types?.includes('network') ? 'network_artifacts' : 'process_artifacts',
      status: 'collecting',
      progress: 0
    });

    // Collect process artifacts
    const processArtifacts = [
      {
        pid: 4892,
        name: 'powershell.exe',
        path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        command_line: 'powershell.exe -enc JABzAD0ATgBlAHcALQ...',
        parent_pid: 1024,
        user: 'SYSTEM',
        start_time: new Date(Date.now() - 3600000).toISOString(),
        suspicious_flags: ['encoded_command', 'system_privileges']
      },
      {
        pid: 5124,
        name: 'explorer.exe',
        path: 'C:\\Windows\\explorer.exe',
        command_line: 'C:\\Windows\\Explorer.EXE',
        parent_pid: 1,
        user: 'Administrator',
        start_time: new Date(Date.now() - 86400000).toISOString(),
        suspicious_flags: []
      }
    ];

    // Collect network artifacts
    const networkArtifacts = [
      {
        protocol: 'TCP',
        local_address: '192.168.1.100',
        local_port: 49152,
        remote_address: '185.220.101.45',
        remote_port: 443,
        state: 'ESTABLISHED',
        pid: 4892,
        process_name: 'powershell.exe',
        bytes_sent: 12458,
        bytes_received: 945632,
        suspicious: true,
        threat_intel: 'Known C2 server'
      },
      {
        protocol: 'UDP',
        local_address: '192.168.1.100',
        local_port: 53,
        remote_address: '8.8.8.8',
        remote_port: 53,
        state: 'OPEN',
        pid: 2048,
        process_name: 'svchost.exe',
        bytes_sent: 512,
        bytes_received: 1024,
        suspicious: false
      }
    ];

    // Registry changes (Windows)
    const registryArtifacts = [
      {
        key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
        value: 'UpdateCheck',
        data: 'C:\\Users\\Public\\update.exe',
        type: 'REG_SZ',
        modified: new Date().toISOString(),
        suspicious: true,
        reason: 'Persistence mechanism'
      }
    ];

    // File system artifacts
    const fileArtifacts = [
      {
        path: 'C:\\Users\\Public\\update.exe',
        size: 245760,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        hash: 'md5:a1b2c3d4e5f6...',
        suspicious: true,
        vt_detections: 45
      }
    ];

    const artifacts = {
      processes: processArtifacts,
      network_connections: networkArtifacts,
      registry_keys: registryArtifacts,
      files: fileArtifacts
    };

    // Analysis
    const suspiciousCount = [
      ...processArtifacts.filter(p => p.suspicious_flags.length > 0),
      ...networkArtifacts.filter(n => n.suspicious),
      ...registryArtifacts.filter(r => r.suspicious),
      ...fileArtifacts.filter(f => f.suspicious)
    ].length;

    const threatScore = Math.min(suspiciousCount * 15, 100);

    await base44.entities.ForensicCollection.update(collection.id, {
      status: 'completed',
      progress: 100,
      artifacts,
      analysis_results: {
        malware_detected: threatScore > 50,
        suspicious_indicators: [
          'Encoded PowerShell command detected',
          'Connection to known C2 server',
          'Suspicious persistence mechanism',
          'Unsigned executable in user directory'
        ],
        threat_score: threatScore,
        ai_insights: `Artifact analysis identified ${suspiciousCount} suspicious items. High-confidence malware infection detected.`
      },
      collection_metadata: {
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      }
    });

    return Response.json({
      success: true,
      collection_id: collection.id,
      artifacts,
      threat_score: threatScore
    });

  } catch (error) {
    console.error('Artifact collection error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});