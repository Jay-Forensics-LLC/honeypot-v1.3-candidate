import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ANALYTICS: Geographic Distribution of Findings
 * Returns findings aggregated by country/region with confidence
 */
Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filters } = await req.json();
    const { dateFrom, dateTo, caseIds, severities } = filters || {};

    // Build query
    const query = { organization_id: user.organization_id };
    if (caseIds?.length) query.case_id = { $in: caseIds };

    // Fetch findings with geo context
    const findings = await base44.asServiceRole.entities.CompositeRiskFinding.filter(query);

    // Apply filters
    let filteredFindings = findings;
    if (dateFrom || dateTo) {
      filteredFindings = findings.filter(f => {
        const created = new Date(f.created_date);
        if (dateFrom && created < new Date(dateFrom)) return false;
        if (dateTo && created > new Date(dateTo)) return false;
        return true;
      });
    }
    if (severities?.length) {
      filteredFindings = filteredFindings.filter(f => severities.includes(f.severity));
    }

    // Extract IPs from evidence_refs and fetch geo data
    const ipSet = new Set();
    filteredFindings.forEach(f => {
      // Parse evidence refs for IP indicators
      f.evidence_refs?.artifact_ids?.forEach(aid => {
        // Attempt to extract IPs (this is heuristic - better to have explicit geo entity)
        const ipMatch = aid.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
        if (ipMatch) ipSet.add(ipMatch[0]);
      });
    });

    // Fetch network events for IP geo lookup
    const networkEvents = await base44.asServiceRole.entities.NormalizedEvent.filter({
      organization_id: user.organization_id,
      event_type: { $in: ['net_flow', 'http_meta'] }
    });

    // Build geo aggregation (simplified - assuming dst_ip has geo context)
    const geoAgg = {};
    filteredFindings.forEach(f => {
      // Placeholder: In production, correlate finding → evidence → IP → geo entity
      // For now, use "Unknown" as default
      const country = f.evidence_refs?.country || 'Unknown';
      
      if (!geoAgg[country]) {
        geoAgg[country] = {
          country,
          count: 0,
          severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          findingIds: [],
          avgConfidence: 0
        };
      }
      
      geoAgg[country].count++;
      geoAgg[country].severityBreakdown[f.severity]++;
      geoAgg[country].findingIds.push(f.id);
      geoAgg[country].avgConfidence += f.confidence || 0.5;
    });

    const geoData = Object.values(geoAgg)
      .map(g => ({
        ...g,
        avgConfidence: g.count > 0 ? g.avgConfidence / g.count : 0
      }))
      .sort((a, b) => b.count - a.count);

    const queryTimeMs = Date.now() - startTime;

    return Response.json({
      data: geoData,
      meta: {
        filterUsed: filters,
        generatedAt: new Date().toISOString(),
        countryCount: geoData.length,
        totalFindings: filteredFindings.length,
        queryTimeMs,
        note: 'Geo attribution requires GeoIP enrichment - currently showing Unknown for missing data'
      },
      provenance: {
        sourceEntities: ['CompositeRiskFinding', 'NormalizedEvent'],
        querySignature: await hashString(JSON.stringify({ filters, widget: 'geo_distribution', version: '1.0' }))
      }
    });

  } catch (error) {
    console.error('Analytics geo distribution error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}