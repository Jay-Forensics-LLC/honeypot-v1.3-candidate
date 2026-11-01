import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { readApiKeyUsageFilters } from './helpers/apiKeyUsage.ts';

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

    const { apiKeyId, statusCode, rateLimitAction, limit } = await readApiKeyUsageFilters(req);

    const filter = {
      organization_id: user.organization_id
    };

    if (apiKeyId && typeof apiKeyId === 'string') {
      filter.api_key_id = apiKeyId;
    }

    if (statusCode) {
      filter.status_code = parseInt(statusCode, 10);
    }

    if (rateLimitAction) {
      filter.rate_limit_action = rateLimitAction;
    }

    const logs = await base44.asServiceRole.entities.ApiKeyUsageLog.filter(filter);

    // Sort by created_date descending
    logs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    return Response.json({ 
      logs: logs.slice(0, parseInt(limit, 10)),
      total: logs.length
    });

  } catch (error) {
    console.error('Get API key usage failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});