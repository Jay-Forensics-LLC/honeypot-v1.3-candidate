import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ANALYTICS: Top Threats with Threat Intel Correlation
 * Returns aggregated findings with IOC matching and confidence scoring
 * 
 * THREAT INTEL CORRELATION:
 * - Loads active threat indicators from ThreatIntelIndicator entity
 * - Matches findings against IP/domain/hash indicators
 * - Applies match strength factors to feed confidence
 * - Tags matched findings as "Threat Intel Match"
 */

// Match strength factors
const MATCH_STRENGTH_FACTORS = Object.freeze({
  hash_exact: 1.0,
  ip_exact: 0.9,
  domain_exact: 0.85,
  domain_subdomain: 0.75
});

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filters } = await req.json();
    const { dateFrom, dateTo, caseIds, severities, categories, statuses, iocMatched, limit = 20 } = filters || {};

    // Load active threat intel indicators
    const threatIndicators = await base44.asServiceRole.entities.ThreatIntelIndicator.filter({
      organization_id: user.organization_id,
      active: true
    });

    // Build lookup maps
    const ipSet = new Set(threatIndicators.filter(i => i.indicator_type === 'IP').map(i => i.value.toLowerCase()));
    const domainMap = new Map(threatIndicators.filter(i => i.indicator_type === 'domain').map(i => [i.value.toLowerCase(), i]));
    const hashSet = new Set(threatIndicators.filter(i => i.indicator_type === 'hash').map(i => i.value.toLowerCase()));

    // Build findings query
    const query = { organization_id: user.organization_id };
    if (caseIds?.length) query.case_id = { $in: caseIds };
    if (severities?.length) query.severity = { $in: severities };
    if (categories?.length) query.finding_type = { $in: categories };
    if (statuses?.length) query.reviewed_status = { $in: statuses };

    const findings = await base44.asServiceRole.entities.CompositeRiskFinding.filter(query);

    // Apply date filter
    let filteredFindings = findings;
    if (dateFrom || dateTo) {
      filteredFindings = findings.filter(f => {
        const created = new Date(f.created_date);
        if (dateFrom && created < new Date(dateFrom)) return false;
        if (dateTo && created > new Date(dateTo)) return false;
        return true;
      });
    }

    // Correlate with threat intel
    const enrichedFindings = filteredFindings.map(finding => {
      let iocMatch = null;
      let iocValue = null;
      let threatIntelConfidence = null;
      let threatIntelSource = null;

      // Extract potential IOCs from finding (heuristic extraction)
      const extractedIOCs = extractIOCsFromFinding(finding);

      // Match priority: hash > IP > domain
      for (const hash of extractedIOCs.hashes) {
        if (hashSet.has(hash.toLowerCase())) {
          const indicator = threatIndicators.find(i => i.indicator_type === 'hash' && i.value.toLowerCase() === hash.toLowerCase());
          iocMatch = 'hash';
          iocValue = hash;
          threatIntelConfidence = Math.round(indicator.confidence * MATCH_STRENGTH_FACTORS.hash_exact * 100);
          threatIntelSource = indicator.source;
          break;
        }
      }

      if (!iocMatch) {
        for (const ip of extractedIOCs.ips) {
          if (ipSet.has(ip.toLowerCase())) {
            const indicator = threatIndicators.find(i => i.indicator_type === 'IP' && i.value.toLowerCase() === ip.toLowerCase());
            iocMatch = 'IP';
            iocValue = ip;
            threatIntelConfidence = Math.round(indicator.confidence * MATCH_STRENGTH_FACTORS.ip_exact * 100);
            threatIntelSource = indicator.source;
            break;
          }
        }
      }

      if (!iocMatch) {
        for (const domain of extractedIOCs.domains) {
          const domainLower = domain.toLowerCase();
          
          // Exact match
          if (domainMap.has(domainLower)) {
            const indicator = domainMap.get(domainLower);
            iocMatch = 'domain';
            iocValue = domain;
            threatIntelConfidence = Math.round(indicator.confidence * MATCH_STRENGTH_FACTORS.domain_exact * 100);
            threatIntelSource = indicator.source;
            break;
          }

          // Subdomain match
          for (const [feedDomain, indicator] of domainMap.entries()) {
            if (domainLower.endsWith('.' + feedDomain)) {
              iocMatch = 'domain';
              iocValue = domain;
              threatIntelConfidence = Math.round(indicator.confidence * MATCH_STRENGTH_FACTORS.domain_subdomain * 100);
              threatIntelSource = indicator.source;
              break;
            }
          }
          if (iocMatch) break;
        }
      }

      return {
        ...finding,
        ioc_matched: iocMatch,
        ioc_value: iocValue,
        threat_intel_confidence: threatIntelConfidence,
        threat_intel_source: threatIntelSource,
        is_threat_intel_match: iocMatch !== null
      };
    });

    // Apply IOC filter
    let finalFindings = enrichedFindings;
    if (iocMatched) {
      if (iocMatched === 'matched') {
        finalFindings = enrichedFindings.filter(f => f.is_threat_intel_match);
      } else if (iocMatched !== 'all') {
        finalFindings = enrichedFindings.filter(f => f.ioc_matched === iocMatched);
      }
    }

    // Aggregate by finding type/title
    const aggregates = {};
    finalFindings.forEach(f => {
      const key = f.title || f.finding_type || 'Unknown';
      if (!aggregates[key]) {
        aggregates[key] = {
          type: key,
          total: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          avgConfidence: 0,
          threatIntelMatches: 0,
          avgThreatIntelConfidence: 0,
          findingIds: []
        };
      }
      aggregates[key].total++;
      aggregates[key].bySeverity[f.severity] = (aggregates[key].bySeverity[f.severity] || 0) + 1;
      aggregates[key].avgConfidence += f.confidence || 0;
      aggregates[key].findingIds.push(f.id);

      if (f.is_threat_intel_match) {
        aggregates[key].threatIntelMatches++;
        aggregates[key].avgThreatIntelConfidence += f.threat_intel_confidence || 0;
      }
    });

    // Compute final averages and sort
    const topThreats = Object.values(aggregates)
      .map(a => ({
        ...a,
        avgConfidence: a.total > 0 ? Math.round(a.avgConfidence / a.total * 100) / 100 : 0,
        avgThreatIntelConfidence: a.threatIntelMatches > 0 
          ? Math.round(a.avgThreatIntelConfidence / a.threatIntelMatches) 
          : null,
        threatIntelMatchPct: a.total > 0 ? Math.round((a.threatIntelMatches / a.total) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    const queryTimeMs = Date.now() - startTime;

    return Response.json({
      data: topThreats,
      meta: {
        filterUsed: filters,
        generatedAt: new Date().toISOString(),
        rowCount: topThreats.length,
        totalFindings: finalFindings.length,
        threatIntelIndicatorsLoaded: threatIndicators.length,
        queryTimeMs
      },
      provenance: {
        sourceEntities: ['CompositeRiskFinding', 'ThreatIntelIndicator'],
        querySignature: await hashString(JSON.stringify({ filters, widget: 'top_threats_v2', version: '2.0' }))
      }
    });

  } catch (error) {
    console.error('Analytics top threats error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Extract potential IOCs from finding metadata (heuristic)
 */
function extractIOCsFromFinding(finding) {
  const ips = [];
  const domains = [];
  const hashes = [];

  const textContent = JSON.stringify(finding).toLowerCase();

  // Extract IPs
  const ipMatches = textContent.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  if (ipMatches) ips.push(...ipMatches);

  // Extract domains
  const domainMatches = textContent.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/g);
  if (domainMatches) domains.push(...domainMatches);

  // Extract hashes (SHA256 pattern)
  const hashMatches = textContent.match(/\b[a-f0-9]{64}\b/g);
  if (hashMatches) hashes.push(...hashMatches);

  return { ips, domains, hashes };
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}