import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    if (!user.organization_id) {
      return Response.json({ error: 'Organization context required' }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const caseId = url.searchParams.get('caseId');

    const filter = {
      organization_id: user.organization_id
    };

    if (status) {
      filter.status = status;
    }

    if (caseId) {
      filter.case_id = caseId;
    }

    const keys = await base44.asServiceRole.entities.ApiKey.filter(filter);

    // NEVER return key_hash_sha256 or any secret
    const safeKeys = keys.map(key => ({
      id: key.id,
      name: key.name,
      key_prefix: key.key_prefix,
      status: key.status,
      scopes: key.scopes,
      rate_limit: key.rate_limit,
      ip_allowlist: key.ip_allowlist,
      expires_at: key.expires_at,
      last_used_at: key.last_used_at,
      created_by_user_id: key.created_by_user_id,
      created_date: key.created_date,
      notes: key.notes
    }));

    return Response.json({ keys: safeKeys });

  } catch (error) {
    console.error('List API keys failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});