import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ANALYTICS: Drilldown - Underlying Findings/Events
 * Returns paginated details for a selected aggregate
 */
Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { drilldownType, ids, page = 1, pageSize = 50 } = await req.json();

    if (!drilldownType || !ids || !ids.length) {
      return Response.json({ error: 'drilldownType and ids required' }, { status: 400 });
    }

    let results = [];
    let sourceEntity = '';

    if (drilldownType === 'findings') {
      sourceEntity = 'CompositeRiskFinding';
      results = await base44.asServiceRole.entities.CompositeRiskFinding.filter({
        id: { $in: ids },
        organization_id: user.organization_id
      });
    } else if (drilldownType === 'events') {
      sourceEntity = 'NormalizedEvent';
      results = await base44.asServiceRole.entities.NormalizedEvent.filter({
        id: { $in: ids },
        organization_id: user.organization_id
      });
    } else if (drilldownType === 'vulnerabilities') {
      sourceEntity = 'Alert';
      results = await base44.asServiceRole.entities.Alert.filter({
        id: { $in: ids },
        organization_id: user.organization_id,
        cve_id: { $ne: null }
      });
    } else {
      return Response.json({ error: 'Invalid drilldownType' }, { status: 400 });
    }

    // Paginate
    const total = results.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedResults = results.slice(start, end);

    const queryTimeMs = Date.now() - startTime;

    return Response.json({
      data: paginatedResults,
      meta: {
        generatedAt: new Date().toISOString(),
        page,
        pageSize,
        totalResults: total,
        totalPages: Math.ceil(total / pageSize),
        queryTimeMs
      },
      provenance: {
        sourceEntities: [sourceEntity],
        drilldownType,
        requestedIds: ids.slice(0, 10) // Sample for audit
      }
    });

  } catch (error) {
    console.error('Analytics drilldown error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});