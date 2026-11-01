import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseApiKeyUsageFilters } from './helpers/apiKeyUsageFilters.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    let body: Record<string, unknown> = {};
    if (req.method !== 'GET') {
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
      }
    }

    const url = new URL(req.url);
    const filters = parseApiKeyUsageFilters(url.searchParams, body);
    if (!filters) {
      return Response.json({ error: 'Invalid usage filter' }, { status: 400 });
    }
    const { apiKeyId, statusCode, rateLimitAction, limit } = filters;

    const filter = {
      organization_id: user.organization_id
    };

    if (apiKeyId) {
      filter.api_key_id = apiKeyId;
    }

    if (statusCode !== null && statusCode !== undefined && statusCode !== '') {
      filter.status_code = parseInt(String(statusCode), 10);
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