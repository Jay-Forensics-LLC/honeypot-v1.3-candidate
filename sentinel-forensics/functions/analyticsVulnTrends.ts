import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ANALYTICS: Vulnerability Trends Over Time
 * Returns time-bucketed vulnerability discovery/remediation data
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

    // Build query for alerts WITH CVE IDs (real vulnerabilities)
    const query = { 
      organization_id: user.organization_id,
      cve_id: { $ne: null, $exists: true } // ONLY CVE-verified
    };
    if (caseIds?.length) query.assigned_case_id = { $in: caseIds };
    if (severities?.length) query.severity = { $in: severities };

    const vulnerabilities = await base44.asServiceRole.entities.Alert.filter(query);

    // Apply date filter
    let filteredVulns = vulnerabilities;
    if (dateFrom || dateTo) {
      filteredVulns = vulnerabilities.filter(v => {
        const detected = new Date(v.detection_timestamp || v.created_date);
        if (dateFrom && detected < new Date(dateFrom)) return false;
        if (dateTo && detected > new Date(dateTo)) return false;
        return true;
      });
    }

    // Determine bucket size
    const range = dateTo && dateFrom 
      ? new Date(dateTo) - new Date(dateFrom)
      : 30 * 24 * 60 * 60 * 1000;
    
    const bucketMs = range > 90 * 24 * 60 * 60 * 1000 ? 7 * 24 * 60 * 60 * 1000 : // >90d → weekly
                     range > 30 * 24 * 60 * 60 * 1000 ? 24 * 60 * 60 * 1000 :     // >30d → daily
                     60 * 60 * 1000;                                               // ≤30d → hourly

    // Bucket vulnerabilities
    const buckets = {};
    filteredVulns.forEach(v => {
      const timestamp = new Date(v.detection_timestamp || v.created_date).getTime();
      const bucketKey = Math.floor(timestamp / bucketMs) * bucketMs;
      
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          timestamp: new Date(bucketKey).toISOString(),
          discovered: 0,
          open: 0,
          closed: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          vulnIds: []
        };
      }
      
      buckets[bucketKey].discovered++;
      if (v.status === 'resolved' || v.resolved === true) {
        buckets[bucketKey].closed++;
      } else {
        buckets[bucketKey].open++;
      }
      buckets[bucketKey].bySeverity[v.severity] = (buckets[bucketKey].bySeverity[v.severity] || 0) + 1;
      buckets[bucketKey].vulnIds.push(v.id);
    });

    const timeseries = Object.values(buckets)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Calculate net new (cumulative)
    let cumulativeOpen = 0;
    timeseries.forEach(bucket => {
      cumulativeOpen += (bucket.discovered - bucket.closed);
      bucket.cumulativeOpen = cumulativeOpen;
    });

    const queryTimeMs = Date.now() - startTime;

    return Response.json({
      data: timeseries,
      meta: {
        filterUsed: filters,
        generatedAt: new Date().toISOString(),
        bucketSize: bucketMs,
        bucketCount: timeseries.length,
        totalVulnerabilities: filteredVulns.length,
        queryTimeMs
      },
      provenance: {
        sourceEntities: ['Alert (CVE-verified only)'],
        querySignature: await hashString(JSON.stringify({ filters, widget: 'vuln_trends', version: '1.0' }))
      }
    });

  } catch (error) {
    console.error('Analytics vuln trends error:', error);
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