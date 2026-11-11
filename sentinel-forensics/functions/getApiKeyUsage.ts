import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const url = new URL(req.url);
    const apiKeyId = url.searchParams.get('apiKeyId');
    const statusCode = url.searchParams.get('statusCode');
    const rateLimitAction = url.searchParams.get('rateLimitAction');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const filter = {
      organization_id: user.organization_id
    };

    if (apiKeyId) {
      filter.api_key_id = apiKeyId;
    }

    if (statusCode) {
      filter.status_code = parseInt(statusCode);
    }

    if (rateLimitAction) {
      filter.rate_limit_action = rateLimitAction;
    }

    const logs = await base44.asServiceRole.entities.ApiKeyUsageLog.filter(filter);

    // Sort by created_date descending
    logs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    return Response.json({ 
      logs: logs.slice(0, limit),
      total: logs.length
    });

  } catch (error) {
    console.error('Get API key usage failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});