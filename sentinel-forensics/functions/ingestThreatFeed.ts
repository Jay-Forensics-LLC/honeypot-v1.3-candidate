/**
 * PHASE 4: Threat Intel Feed Ingestion
 * 
 * Ingests IOCs from feeds with auto-detection, normalization, deduplication, and immutable snapshots.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { feed_id, iocs } = await req.json();
    
    if (!feed_id || !iocs || !Array.isArray(iocs)) {
      return Response.json({ error: 'Missing or invalid fields' }, { status: 400 });
    }
    
    const feed = await base44.entities.ThreatIntelFeed.get(feed_id);
    
    if (!feed) {
      return Response.json({ error: 'Feed not found' }, { status: 404 });
    }
    
    // Create input snapshot
    const inputSnapshot = {
      feed_data: iocs,
      ingest_timestamp: new Date().toISOString(),
      source: feed.feed_name
    };
    
    // Hash input
    const inputString = JSON.stringify(inputSnapshot, Object.keys(inputSnapshot).sort());
    const encoder = new TextEncoder();
    const data = encoder.encode(inputString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Create ingest run
    const ingestRun = await base44.asServiceRole.entities.IntelIngestRun.create({
      organization_id: user.organization_id || 'default',
      feed_id,
      status: 'running',
      input_snapshot: inputSnapshot,
      input_hash: inputHash,
      iocs_added: 0,
      iocs_updated: 0,
      iocs_deduplicated: 0
    });
    
    let added = 0, updated = 0, deduped = 0;
    
    // Process IOCs
    for (const ioc of iocs) {
      // Auto-detect type
      const iocType = detectIOCType(ioc.value);
      
      // Normalize value
      const normalizedValue = normalizeIOC(ioc.value, iocType);
      
      // Check for duplicates
      const existing = await base44.entities.Indicator.filter({
        value: normalizedValue,
        indicator_type: iocType
      });
      
      if (existing.length > 0) {
        deduped++;
        continue;
      }
      
      // Create new indicator
      await base44.asServiceRole.entities.Indicator.create({
        indicator_type: iocType,
        value: normalizedValue,
        source: feed.feed_name,
        confidence: ioc.confidence || 70,
        tags: ioc.tags || [],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        threat_level: ioc.threat_level || 'medium'
      });
      
      added++;
    }
    
    // Complete ingest run
    await base44.asServiceRole.entities.IntelIngestRun.update(ingestRun.id, {
      status: 'completed',
      iocs_added: added,
      iocs_updated: updated,
      iocs_deduplicated: deduped,
      completed_at: new Date().toISOString()
    });
    
    // Update feed metadata
    await base44.entities.ThreatIntelFeed.update(feed_id, {
      last_ingest_at: new Date().toISOString(),
      last_ingest_hash: inputHash,
      ioc_count: (feed.ioc_count || 0) + added
    });
    
    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id || 'default',
      event_type: 'threat_intel_ingested',
      severity: 'info',
      description: `Ingested ${added} IOCs from ${feed.feed_name}`,
      user_id: user.email,
      resource_type: 'ThreatIntelFeed',
      resource_id: feed_id,
      action_performed: 'ingest',
      metadata: {
        iocs_added: added,
        iocs_deduplicated: deduped,
        input_hash: inputHash
      },
      success: true,
      blockchain_hash: '',
      timestamp: new Date().toISOString()
    });
    
    return Response.json({ 
      success: true,
      added,
      updated,
      deduplicated: deduped,
      ingest_run_id: ingestRun.id
    });
    
  } catch (error) {
    console.error('Threat intel ingestion failed:', error);
    return Response.json({ 
      error: error.message || 'Failed to ingest threat intel' 
    }, { status: 500 });
  }
});

function detectIOCType(value) {
  if (/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(value)) return 'ip';
  if (/^[a-f0-9]{32}$/.test(value)) return 'md5';
  if (/^[a-f0-9]{64}$/.test(value)) return 'sha256';
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) return 'domain';
  if (/^https?:\/\//.test(value)) return 'url';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
  return 'unknown';
}

function normalizeIOC(value, type) {
  if (type === 'domain' || type === 'url') {
    return value.toLowerCase();
  }
  if (type === 'md5' || type === 'sha256') {
    return value.toLowerCase();
  }
  return value;
}