import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { run_id, filters } = await req.json();
    const { severity, category, suppressed, search, limit = 100, skip = 0 } = filters || {};

    const query = {
      organization_id: user.organization_id,
      run_id
    };
    
    if (severity) query.severity = severity;
    if (category) query.category = category;
    if (suppressed !== undefined) query.suppressed = suppressed;

    let findings = await base44.entities.CodebaseAuditFinding.filter(query);

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      findings = findings.filter(f => 
        f.title?.toLowerCase().includes(searchLower) ||
        f.file_path?.toLowerCase().includes(searchLower) ||
        f.description?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by severity
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const paginated = findings.slice(skip, skip + limit);

    return Response.json({
      data: paginated,
      meta: {
        total: findings.length,
        limit,
        skip
      }
    });

  } catch (error) {
    console.error('Get findings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});