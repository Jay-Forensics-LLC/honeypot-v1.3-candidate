import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Cross-Case Evidence Correlation Engine
 * Detects recurring artifacts across cases
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evidenceId, correlationTypes } = await req.json();

    // Get source evidence
    const sourceEvidence = await base44.entities.EvidenceV2.filter({ id: evidenceId });
    if (!sourceEvidence || sourceEvidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }
    const evidence = sourceEvidence[0];

    // Get all evidence in organization (permission-aware via RLS)
    const allEvidence = await base44.entities.EvidenceV2.filter({});

    const correlations = [];
    const typesToCheck = correlationTypes || ['hash_match', 'mac_match', 'uuid_match', 'ip_match', 'domain_match', 'device_id_match'];

    // Hash matching
    if (typesToCheck.includes('hash_match') && evidence.sha256_hash) {
      const hashMatches = allEvidence.filter(
        e => e.sha256_hash === evidence.sha256_hash && 
             e.id !== evidenceId && 
             e.case_id !== evidence.case_id
      );

      for (const match of hashMatches) {
        correlations.push({
          correlation_type: 'hash_match',
          matched_evidence_id: match.id,
          matched_case_id: match.case_id,
          match_value: evidence.sha256_hash,
          confidence_score: 1.0, // Exact hash = 100% confidence
          first_seen: getEarliestDate(evidence, match),
          last_seen: getLatestDate(evidence, match),
          detection_metadata: {
            source_title: evidence.title,
            matched_title: match.title
          }
        });
      }
    }

    // MAC address matching
    if (typesToCheck.includes('mac_match')) {
      const sourceMacs = extractMACs(evidence);
      if (sourceMacs.length > 0) {
        for (const otherEvidence of allEvidence) {
          if (otherEvidence.id === evidenceId || otherEvidence.case_id === evidence.case_id) continue;
          
          const otherMacs = extractMACs(otherEvidence);
          const commonMacs = sourceMacs.filter(mac => otherMacs.includes(mac));
          
          if (commonMacs.length > 0) {
            correlations.push({
              correlation_type: 'mac_match',
              matched_evidence_id: otherEvidence.id,
              matched_case_id: otherEvidence.case_id,
              match_value: commonMacs.join(', '),
              confidence_score: 0.9,
              first_seen: getEarliestDate(evidence, otherEvidence),
              last_seen: getLatestDate(evidence, otherEvidence),
              detection_metadata: {
                mac_count: commonMacs.length,
                source_title: evidence.title,
                matched_title: otherEvidence.title
              }
            });
          }
        }
      }
    }

    // IP address matching
    if (typesToCheck.includes('ip_match')) {
      const sourceIPs = extractIPs(evidence);
      if (sourceIPs.length > 0) {
        for (const otherEvidence of allEvidence) {
          if (otherEvidence.id === evidenceId || otherEvidence.case_id === evidence.case_id) continue;
          
          const otherIPs = extractIPs(otherEvidence);
          const commonIPs = sourceIPs.filter(ip => otherIPs.includes(ip));
          
          if (commonIPs.length > 0) {
            correlations.push({
              correlation_type: 'ip_match',
              matched_evidence_id: otherEvidence.id,
              matched_case_id: otherEvidence.case_id,
              match_value: commonIPs.join(', '),
              confidence_score: 0.85,
              first_seen: getEarliestDate(evidence, otherEvidence),
              last_seen: getLatestDate(evidence, otherEvidence),
              detection_metadata: {
                ip_count: commonIPs.length,
                source_title: evidence.title,
                matched_title: otherEvidence.title
              }
            });
          }
        }
      }
    }

    // UUID matching
    if (typesToCheck.includes('uuid_match')) {
      const sourceUUIDs = extractUUIDs(evidence);
      if (sourceUUIDs.length > 0) {
        for (const otherEvidence of allEvidence) {
          if (otherEvidence.id === evidenceId || otherEvidence.case_id === evidence.case_id) continue;
          
          const otherUUIDs = extractUUIDs(otherEvidence);
          const commonUUIDs = sourceUUIDs.filter(uuid => otherUUIDs.includes(uuid));
          
          if (commonUUIDs.length > 0) {
            correlations.push({
              correlation_type: 'uuid_match',
              matched_evidence_id: otherEvidence.id,
              matched_case_id: otherEvidence.case_id,
              match_value: commonUUIDs.join(', '),
              confidence_score: 0.95,
              first_seen: getEarliestDate(evidence, otherEvidence),
              last_seen: getLatestDate(evidence, otherEvidence),
              detection_metadata: {
                uuid_count: commonUUIDs.length,
                source_title: evidence.title,
                matched_title: otherEvidence.title
              }
            });
          }
        }
      }
    }

    // Domain matching
    if (typesToCheck.includes('domain_match')) {
      const sourceDomains = extractDomains(evidence);
      if (sourceDomains.length > 0) {
        for (const otherEvidence of allEvidence) {
          if (otherEvidence.id === evidenceId || otherEvidence.case_id === evidence.case_id) continue;
          
          const otherDomains = extractDomains(otherEvidence);
          const commonDomains = sourceDomains.filter(domain => otherDomains.includes(domain));
          
          if (commonDomains.length > 0) {
            correlations.push({
              correlation_type: 'domain_match',
              matched_evidence_id: otherEvidence.id,
              matched_case_id: otherEvidence.case_id,
              match_value: commonDomains.join(', '),
              confidence_score: 0.8,
              first_seen: getEarliestDate(evidence, otherEvidence),
              last_seen: getLatestDate(evidence, otherEvidence),
              detection_metadata: {
                domain_count: commonDomains.length,
                source_title: evidence.title,
                matched_title: otherEvidence.title
              }
            });
          }
        }
      }
    }

    // Device ID matching
    if (typesToCheck.includes('device_id_match')) {
      const sourceDeviceIds = extractDeviceIds(evidence);
      if (sourceDeviceIds.length > 0) {
        for (const otherEvidence of allEvidence) {
          if (otherEvidence.id === evidenceId || otherEvidence.case_id === evidence.case_id) continue;
          
          const otherDeviceIds = extractDeviceIds(otherEvidence);
          const commonDeviceIds = sourceDeviceIds.filter(id => otherDeviceIds.includes(id));
          
          if (commonDeviceIds.length > 0) {
            correlations.push({
              correlation_type: 'device_id_match',
              matched_evidence_id: otherEvidence.id,
              matched_case_id: otherEvidence.case_id,
              match_value: commonDeviceIds.join(', '),
              confidence_score: 0.9,
              first_seen: getEarliestDate(evidence, otherEvidence),
              last_seen: getLatestDate(evidence, otherEvidence),
              detection_metadata: {
                device_id_count: commonDeviceIds.length,
                source_title: evidence.title,
                matched_title: otherEvidence.title
              }
            });
          }
        }
      }
    }

    // Calculate frequency counts
    const frequencyMap = {};
    correlations.forEach(corr => {
      const key = `${corr.correlation_type}:${corr.match_value}`;
      frequencyMap[key] = (frequencyMap[key] || 0) + 1;
    });

    // Store correlations
    const storedCorrelations = [];
    for (const corr of correlations) {
      const key = `${corr.correlation_type}:${corr.match_value}`;
      const existing = await base44.entities.EvidenceCorrelation.filter({
        evidence_id: evidenceId,
        matched_evidence_id: corr.matched_evidence_id,
        correlation_type: corr.correlation_type
      });

      if (existing.length === 0) {
        const stored = await base44.asServiceRole.entities.EvidenceCorrelation.create({
          organization_id: user.organization_id,
          evidence_id: evidenceId,
          ...corr,
          frequency_count: frequencyMap[key],
          detected_at: new Date().toISOString(),
          detected_by: 'system'
        });
        storedCorrelations.push(stored);
      }
    }

    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'EVIDENCE_CORRELATION_RUN',
      severity: 'info',
      description: `Correlation analysis for evidence ${evidence.title}: ${correlations.length} matches found`,
      user_id: user.email,
      success: true,
      metadata: {
        evidence_id: evidenceId,
        correlation_count: correlations.length,
        types: [...new Set(correlations.map(c => c.correlation_type))]
      }
    });

    return Response.json({
      success: true,
      correlations: correlations,
      total_matches: correlations.length,
      match_types: [...new Set(correlations.map(c => c.correlation_type))]
    });

  } catch (error) {
    console.error('Correlation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Helper functions
function extractMACs(evidence) {
  const macs = [];
  const macRegex = /([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/g;
  
  const searchText = JSON.stringify(evidence.metadata || {}) + ' ' + (evidence.description || '');
  const matches = searchText.match(macRegex);
  
  if (matches) {
    macs.push(...matches.map(m => m.toLowerCase()));
  }
  
  return [...new Set(macs)];
}

function extractIPs(evidence) {
  const ips = [];
  const ipRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  
  const searchText = JSON.stringify(evidence.metadata || {}) + ' ' + (evidence.description || '');
  const matches = searchText.match(ipRegex);
  
  if (matches) {
    ips.push(...matches);
  }
  
  return [...new Set(ips)];
}

function extractUUIDs(evidence) {
  const uuids = [];
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  
  const searchText = JSON.stringify(evidence.metadata || {}) + ' ' + (evidence.description || '') + ' ' + (evidence.title || '');
  const matches = searchText.match(uuidRegex);
  
  if (matches) {
    uuids.push(...matches.map(u => u.toLowerCase()));
  }
  
  return [...new Set(uuids)];
}

function extractDomains(evidence) {
  const domains = [];
  const domainRegex = /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/gi;
  
  const searchText = JSON.stringify(evidence.metadata || {}) + ' ' + (evidence.description || '');
  const matches = searchText.match(domainRegex);
  
  if (matches) {
    domains.push(...matches.map(d => d.toLowerCase()).filter(d => 
      !d.includes('example.') && 
      !d.includes('localhost') &&
      d.includes('.')
    ));
  }
  
  return [...new Set(domains)];
}

function extractDeviceIds(evidence) {
  const ids = [];
  
  if (evidence.metadata) {
    ['device_id', 'hostname', 'serial', 'asset_tag', 'computer_name'].forEach(field => {
      if (evidence.metadata[field]) {
        ids.push(String(evidence.metadata[field]).toLowerCase());
      }
    });
  }
  
  return [...new Set(ids)];
}

function getEarliestDate(e1, e2) {
  const d1 = new Date(e1.collection_timestamp || e1.created_date);
  const d2 = new Date(e2.collection_timestamp || e2.created_date);
  return d1 < d2 ? d1.toISOString() : d2.toISOString();
}

function getLatestDate(e1, e2) {
  const d1 = new Date(e1.collection_timestamp || e1.created_date);
  const d2 = new Date(e2.collection_timestamp || e2.created_date);
  return d1 > d2 ? d1.toISOString() : d2.toISOString();
}