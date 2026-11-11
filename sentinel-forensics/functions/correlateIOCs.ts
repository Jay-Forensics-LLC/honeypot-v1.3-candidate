/**
 * PHASE 4: IOC Correlation Engine
 * 
 * Correlates case observables (IPs/domains/hashes) against IOC library.
 * Stores match records with provenance for audit trail.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { case_id } = await req.json();
    
    if (!case_id) {
      return Response.json({ error: 'Missing case_id' }, { status: 400 });
    }
    
    // Fetch case evidence
    const evidence = await base44.entities.EvidenceV2.filter({ case_id });
    
    // Extract observables from evidence
    const observables = extractObservables(evidence);
    
    const matches = [];
    
    // Correlate each observable against IOC library
    for (const observable of observables) {
      const iocs = await base44.entities.Indicator.filter({
        indicator_type: observable.type,
        value: observable.value
      });
      
      for (const ioc of iocs) {
        // Create correlation record
        const correlation = await base44.asServiceRole.entities.CorrelationGraph.create({
          source_type: 'evidence',
          source_id: observable.evidence_id,
          target_type: 'ioc',
          target_id: ioc.id,
          correlation_type: 'exact_match',
          confidence: ioc.confidence || 70,
          metadata: {
            observable_type: observable.type,
            observable_value: observable.value,
            ioc_source: ioc.source,
            matched_at: new Date().toISOString(),
            case_id: case_id
          }
        });
        
        // PHASE A: Trigger risk scoring immediately
        await base44.asServiceRole.functions.invoke('scoreCorrelationRisk', {
          correlation_id: correlation.id
        });
        
        matches.push({
          evidence_id: observable.evidence_id,
          ioc: ioc,
          correlation_id: correlation.id
        });
      }
    }
    
    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id || 'default',
      event_type: 'ioc_correlation_completed',
      severity: matches.length > 0 ? 'warning' : 'info',
      description: `IOC correlation found ${matches.length} matches for case`,
      user_id: user.email,
      resource_type: 'Case',
      resource_id: case_id,
      case_id,
      action_performed: 'correlate',
      metadata: {
        observables_checked: observables.length,
        matches_found: matches.length
      },
      success: true,
      blockchain_hash: '',
      timestamp: new Date().toISOString()
    });
    
    return Response.json({ 
      success: true,
      observables_checked: observables.length,
      matches: matches.length,
      details: matches
    });
    
  } catch (error) {
    console.error('IOC correlation failed:', error);
    return Response.json({ 
      error: error.message || 'Failed to correlate IOCs' 
    }, { status: 500 });
  }
});

function extractObservables(evidence) {
  const observables = [];
  
  for (const item of evidence) {
    // Extract IPs
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const ips = (item.description || '').match(ipRegex) || [];
    ips.forEach(ip => observables.push({ 
      type: 'ip', 
      value: ip, 
      evidence_id: item.id 
    }));
    
    // Extract domains
    const domainRegex = /\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    const domains = (item.description || '').match(domainRegex) || [];
    domains.forEach(domain => observables.push({ 
      type: 'domain', 
      value: domain.toLowerCase(), 
      evidence_id: item.id 
    }));
    
    // Extract hashes from metadata
    if (item.file_hash) {
      const hashType = item.file_hash.length === 32 ? 'md5' : 
                       item.file_hash.length === 64 ? 'sha256' : 'unknown';
      if (hashType !== 'unknown') {
        observables.push({ 
          type: hashType, 
          value: item.file_hash.toLowerCase(), 
          evidence_id: item.id 
        });
      }
    }
  }
  
  return observables;
}