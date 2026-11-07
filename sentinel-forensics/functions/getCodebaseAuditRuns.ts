import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filters } = await req.json();
    const { status, trigger, profile, limit = 50, skip = 0 } = filters || {};

    const query = { organization_id: user.organization_id };
    if (status) query.status = status;
    if (trigger) query.trigger = trigger;
    if (profile) query.audit_profile = profile;

    const runs = await base44.entities.CodebaseAuditRun.filter(query);

    const sorted = runs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    const paginated = sorted.slice(skip, skip + limit);

    return Response.json({
      data: paginated,
      meta: {
        total: runs.length,
        limit,
        skip
      }
    });

  } catch (error) {
    console.error('Get audit runs error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});