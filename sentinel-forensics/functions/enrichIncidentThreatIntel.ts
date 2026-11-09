import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { incidentId } = await req.json();

    // Get incident details
    const incident = await base44.asServiceRole.entities.IncidentResponse.filter({ incident_id: incidentId });
    if (!incident || incident.length === 0) {
      return Response.json({ error: 'Incident not found' }, { status: 404 });
    }

    const inc = incident[0];
    
    // Extract IOCs from related evidence and alerts
    const iocList = [];
    
    // Get related alerts
    if (inc.related_alert_ids && inc.related_alert_ids.length > 0) {
      const alerts = await base44.asServiceRole.entities.Alert.filter({
        id: { $in: inc.related_alert_ids }
      });
      
      for (const alert of alerts) {
        if (alert.source) iocList.push({ type: 'source', value: alert.source });
      }
    }

    // Get related evidence IOCs
    if (inc.related_evidence_ids && inc.related_evidence_ids.length > 0) {
      const iocs = await base44.asServiceRole.entities.IOCIndicator.filter({
        evidence_id: { $in: inc.related_evidence_ids }
      });
      
      for (const ioc of iocs) {
        iocList.push({
          type: ioc.indicator_type,
          value: ioc.value,
          confidence: ioc.confidence,
          threat_score: ioc.aggregated_threat_score
        });
      }
    }

    // Get APT groups with matching TTPs
    const aptGroups = await base44.asServiceRole.entities.APTGroup.filter({});
    const matchingAPTs = [];

    for (const apt of aptGroups) {
      let matchScore = 0;
      const matchingTTPs = [];

      // Check if incident type matches APT motivation
      if (inc.incident_type === 'data_breach' && apt.motivation === 'cyber_espionage') matchScore += 20;
      if (inc.incident_type === 'ransomware' && apt.motivation === 'financial_gain') matchScore += 20;
      if (inc.incident_type === 'apt_attack') matchScore += 30;

      // Check IOC matches
      for (const ioc of iocList) {
        if (apt.infrastructure?.known_ips?.includes(ioc.value)) {
          matchScore += 25;
          matchingTTPs.push('Infrastructure match');
        }
        if (apt.infrastructure?.known_domains?.includes(ioc.value)) {
          matchScore += 25;
          matchingTTPs.push('Domain match');
        }
      }

      if (matchScore > 30) {
        matchingAPTs.push({
          group_name: apt.group_name,
          confidence: matchScore,
          matching_ttps: matchingTTPs,
          campaign: apt.recent_campaigns?.[0]?.campaign_name || 'Unknown'
        });
      }
    }

    // Match threat intel feeds
    const matchedIOCs = [];
    for (const ioc of iocList.slice(0, 10)) { // Limit to first 10 IOCs
      const enrichments = await base44.asServiceRole.entities.EnrichmentResult.filter({
        indicator_id: ioc.value,
        status: 'success'
      });

      for (const enrich of enrichments) {
        if (enrich.summary?.threat_score > 50) {
          matchedIOCs.push({
            ioc_type: ioc.type,
            ioc_value: ioc.value,
            threat_score: enrich.summary.threat_score,
            source_feed: enrich.provider
          });
        }
      }
    }

    // Identify malware families
    const malwareFamilies = [];
    const malwareSigs = await base44.asServiceRole.entities.MalwareSignature.filter({});
    
    for (const sig of malwareSigs) {
      if (inc.description?.toLowerCase().includes(sig.malware_family?.toLowerCase())) {
        if (!malwareFamilies.includes(sig.malware_family)) {
          malwareFamilies.push(sig.malware_family);
        }
      }
    }

    // Extract MITRE techniques from descriptions
    const mitrePattern = /T\d{4}(\.\d{3})?/g;
    const mitreMatches = inc.description?.match(mitrePattern) || [];
    
    // Build enrichment object
    const enrichment = {
      apt_groups: matchingAPTs.sort((a, b) => b.confidence - a.confidence).slice(0, 3),
      matched_iocs: matchedIOCs.slice(0, 10),
      malware_families: malwareFamilies,
      attack_vectors: identifyAttackVectors(inc),
      mitre_techniques: [...new Set(mitreMatches)],
      enrichment_timestamp: new Date().toISOString(),
      enrichment_sources: ['APTGroup', 'IOCIndicator', 'ThreatIntelligenceFeed', 'MalwareSignature']
    };

    // Update incident with enrichment
    await base44.asServiceRole.entities.IncidentResponse.update(inc.id, {
      threat_intel_enrichment: enrichment
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'incident_enriched',
      severity: 'info',
      description: `Incident ${inc.incident_number} enriched with threat intelligence`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        incident_id: incidentId,
        apt_matches: matchingAPTs.length,
        ioc_matches: matchedIOCs.length
      }
    });

    return Response.json({ 
      success: true,
      enrichment,
      summary: {
        apt_matches: matchingAPTs.length,
        ioc_matches: matchedIOCs.length,
        malware_families: malwareFamilies.length
      }
    });
  } catch (error) {
    console.error('Enrichment error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});

function identifyAttackVectors(incident) {
  const vectors = [];
  const desc = incident.description?.toLowerCase() || '';
  
  if (desc.includes('phishing') || desc.includes('email')) vectors.push('phishing');
  if (desc.includes('exploit') || desc.includes('vulnerability')) vectors.push('exploitation');
  if (desc.includes('credential') || desc.includes('password')) vectors.push('credential_theft');
  if (desc.includes('network') || desc.includes('lateral')) vectors.push('lateral_movement');
  if (desc.includes('malware') || desc.includes('trojan')) vectors.push('malware_delivery');
  if (desc.includes('social') || desc.includes('pretexting')) vectors.push('social_engineering');
  
  return vectors;
}