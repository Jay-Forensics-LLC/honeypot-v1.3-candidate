import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ANALYTICS: Network Traffic Timeseries
 * Returns time-bucketed network metrics
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
    const { dateFrom, dateTo, caseIds, hostIds } = filters || {};

    // Build query
    const query = { organization_id: user.organization_id };
    if (caseIds?.length) query.case_id = { $in: caseIds };

    // Fetch events
    const events = await base44.asServiceRole.entities.NormalizedEvent.filter({
      ...query,
      event_type: { $in: ['net_flow', 'dns_query', 'tls_handshake', 'http_meta'] }
    });

    // Apply date filter
    let filteredEvents = events;
    if (dateFrom || dateTo) {
      filteredEvents = events.filter(e => {
        const eventTime = new Date(e.event_time);
        if (dateFrom && eventTime < new Date(dateFrom)) return false;
        if (dateTo && eventTime > new Date(dateTo)) return false;
        return true;
      });
    }

    // Apply host filter
    if (hostIds?.length) {
      filteredEvents = filteredEvents.filter(e => hostIds.includes(e.host_id));
    }

    // Determine bucket size based on date range
    const range = dateTo && dateFrom 
      ? new Date(dateTo) - new Date(dateFrom)
      : 7 * 24 * 60 * 60 * 1000; // default 7 days
    
    const bucketMs = range > 30 * 24 * 60 * 60 * 1000 ? 24 * 60 * 60 * 1000 : // >30d → daily
                     range > 7 * 24 * 60 * 60 * 1000 ? 60 * 60 * 1000 :       // >7d → hourly
                     5 * 60 * 1000;                                           // ≤7d → 5min

    // Bucket events
    const buckets = {};
    filteredEvents.forEach(e => {
      const timestamp = new Date(e.event_time).getTime();
      const bucketKey = Math.floor(timestamp / bucketMs) * bucketMs;
      
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          timestamp: new Date(bucketKey).toISOString(),
          totalConnections: 0,
          uniqueRemoteIPs: new Set(),
          uniqueDomains: new Set(),
          bytesOut: 0,
          bytesIn: 0,
          eventIds: []
        };
      }
      
      buckets[bucketKey].totalConnections++;
      if (e.dst_ip) buckets[bucketKey].uniqueRemoteIPs.add(e.dst_ip);
      if (e.domain) buckets[bucketKey].uniqueDomains.add(e.domain);
      buckets[bucketKey].bytesOut += e.attributes_json?.bytes_sent || 0;
      buckets[bucketKey].bytesIn += e.attributes_json?.bytes_received || 0;
      buckets[bucketKey].eventIds.push(e.id);
    });

    // Convert to array and serialize Sets
    const timeseries = Object.values(buckets)
      .map(b => ({
        ...b,
        uniqueRemoteIPs: b.uniqueRemoteIPs.size,
        uniqueDomains: b.uniqueDomains.size,
        eventIds: b.eventIds.slice(0, 100) // Limit for performance
      }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const queryTimeMs = Date.now() - startTime;

    return Response.json({
      data: timeseries,
      meta: {
        filterUsed: filters,
        generatedAt: new Date().toISOString(),
        bucketSize: bucketMs,
        bucketCount: timeseries.length,
        totalEvents: filteredEvents.length,
        queryTimeMs
      },
      provenance: {
        sourceEntities: ['NormalizedEvent'],
        querySignature: await hashString(JSON.stringify({ filters, widget: 'network_timeseries', version: '1.0' }))
      }
    });

  } catch (error) {
    console.error('Analytics network timeseries error:', error);
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