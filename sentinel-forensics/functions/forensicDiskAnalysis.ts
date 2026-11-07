import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evidence_id } = await req.json();
    
    if (!evidence_id) {
      return Response.json({ error: 'evidence_id is required' }, { status: 400 });
    }

    // Fetch evidence
    const evidence = await base44.entities.EvidenceV2.filter({ id: evidence_id });
    if (!evidence || evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidenceItem = evidence[0];

    // Simulate forensic disk analysis
    const analysis = {
      file_system_type: detectFileSystem(evidenceItem.file_url),
      partitions: [
        {
          partition_number: 1,
          type: 'NTFS',
          size_bytes: 536870912000,
          status: 'healthy',
          boot_sector_hash: generateHash('boot_sector')
        }
      ],
      deleted_files_recovered: Math.floor(Math.random() * 50),
      hidden_files_found: Math.floor(Math.random() * 20),
      suspicious_artifacts: [
        { type: 'registry_modification', path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', risk: 'medium' },
        { type: 'browser_history_deletion', timestamp: new Date(Date.now() - 86400000).toISOString(), risk: 'low' }
      ],
      timeline_events: generateTimeline(),
      encryption_detected: Math.random() > 0.7,
      mbr_analysis: {
        status: 'clean',
        boot_code_hash: generateHash('mbr'),
        suspicious_modifications: false
      },
      slack_space_analysis: {
        data_found: Math.random() > 0.5,
        fragments_recovered: Math.floor(Math.random() * 100)
      }
    };

    // Update evidence with analysis results
    await base44.asServiceRole.entities.EvidenceV2.update(evidence_id, {
      analysis_results: {
        ...evidenceItem.analysis_results,
        disk_analysis: analysis
      }
    });

    return Response.json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('Forensic disk analysis error:', error);
    return Response.json({ 
      error: error.message || 'Analysis failed' 
    }, { status: 500 });
  }
});

function detectFileSystem(fileUrl) {
  const extensions = ['ntfs', 'ext4', 'apfs', 'fat32', 'exfat'];
  return extensions[Math.floor(Math.random() * extensions.length)].toUpperCase();
}

function generateHash(prefix) {
  return `${prefix}_${Array.from({ length: 64 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('')}`;
}

function generateTimeline() {
  const events = [];
  const now = Date.now();
  
  for (let i = 0; i < 10; i++) {
    events.push({
      timestamp: new Date(now - Math.random() * 86400000 * 30).toISOString(),
      event_type: ['file_created', 'file_modified', 'file_deleted', 'file_accessed'][Math.floor(Math.random() * 4)],
      path: `/Users/suspect/Documents/file_${i}.txt`,
      user: 'suspect_user'
    });
  }
  
  return events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}