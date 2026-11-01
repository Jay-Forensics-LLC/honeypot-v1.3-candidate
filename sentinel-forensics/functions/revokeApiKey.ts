import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { findApiKeyInOrganization } from './helpers/apiKeyScope.ts';

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

    const { apiKeyId } = await req.json();

    if (!apiKeyId) {
      return Response.json({ error: 'Missing apiKeyId' }, { status: 400 });
    }

    const apiKey = await findApiKeyInOrganization(base44, apiKeyId, user.organization_id);
    if (!apiKey) {
      return Response.json({ error: 'API key not found' }, { status: 404 });
    }

    const updated = await base44.asServiceRole.entities.ApiKey.update(apiKey.id, {
      status: 'revoked'
    });

    return Response.json({ 
      success: true, 
      apiKey: {
        id: updated.id,
        name: updated.name,
        status: updated.status
      }
    });

  } catch (error) {
    console.error('Revoke API key failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});