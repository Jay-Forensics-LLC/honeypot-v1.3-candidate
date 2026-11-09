import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ANALYTICS: Agent Metric Drilldown
 * Returns paginated raw telemetry events for evidence-grade traceability
 */
Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { agentId, metric, filters, page = 1, pageSize = 100 } = await req.json();

    if (!agentId) {
      return Response.json({ error: 'agentId required' }, { status: 400 });
    }

    const { dateFrom, dateTo } = filters || {};

    // Build query
    const query = { 
      organization_id: user.organization_id,
      agent_id: agentId
    };

    const events = await base44.asServiceRole.entities.AgentTelemetryEvent.filter(query);

    // Apply date filter
    let filteredEvents = events;
    if (dateFrom || dateTo) {
      const startUtc = dateFrom ? new Date(dateFrom) : null;
      const endUtc = dateTo ? new Date(dateTo) : null;
      
      filteredEvents = events.filter(e => {
        const ts = new Date(e.ts_utc);
        if (startUtc && ts < startUtc) return false;
        if (endUtc && ts > endUtc) return false;
        return true;
      });
    }

    // Filter by metric (only include events with that metric populated)
    if (metric === 'cpu') {
      filteredEvents = filteredEvents.filter(e => e.cpu_pct !== null && e.cpu_pct !== undefined);
    } else if (metric === 'memory') {
      filteredEvents = filteredEvents.filter(e => e.mem_mb !== null && e.mem_mb !== undefined);
    } else if (metric === 'errors') {
      filteredEvents = filteredEvents.filter(e => e.error_count_delta !== null && e.error_count_delta !== undefined && e.error_count_delta > 0);
    } else if (metric === 'queue') {
      filteredEvents = filteredEvents.filter(e => e.queue_depth !== null && e.queue_depth !== undefined);
    }

    // Sort by timestamp desc
    filteredEvents.sort((a, b) => new Date(b.ts_utc) - new Date(a.ts_utc));

    // Paginate
    const total = filteredEvents.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedEvents = filteredEvents.slice(start, end);

    const queryTimeMs = Date.now() - startTime;

    return Response.json({
      data: paginatedEvents,
      meta: {
        generatedAt: new Date().toISOString(),
        page,
        pageSize,
        totalResults: total,
        totalPages: Math.ceil(total / pageSize),
        metric,
        agentId,
        queryTimeMs
      },
      provenance: {
        sourceEntities: ['AgentTelemetryEvent'],
        drilldownType: 'agent_metric_raw_events',
        filters
      }
    });

  } catch (error) {
    console.error('Analytics agent metric drilldown error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});