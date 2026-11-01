import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import {
  getOrganizationApiKeyFilter,
  getToggleApiKeyStatus,
  transitionApiKeyStatus
} from './helpers/apiKeyStatus.ts';

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

    const { apiKeyId, enable } = await req.json();

    if (!apiKeyId || typeof enable !== 'boolean') {
      return Response.json({ error: 'Missing apiKeyId or enable flag' }, { status: 400 });
    }

    const keyFilter = getOrganizationApiKeyFilter(user, apiKeyId);
    if (!keyFilter) {
      return Response.json({ error: 'Organization context required' }, { status: 403 });
    }

    const keys = await base44.asServiceRole.entities.ApiKey.filter(keyFilter);
    if (!keys.length) {
      return Response.json({ error: 'API key not found' }, { status: 404 });
    }

    const status = getToggleApiKeyStatus(keys[0].status, enable);
    if (!status) {
      return Response.json({ error: 'Only active or disabled API keys can be toggled' }, { status: 409 });
    }

    const transitioned = await transitionApiKeyStatus(
      base44.asServiceRole.entities.ApiKey,
      keyFilter,
      keys[0].status,
      status
    );
    if (!transitioned) {
      return Response.json({ error: 'API key status changed; reload and try again' }, { status: 409 });
    }

    const updatedKeys = await base44.asServiceRole.entities.ApiKey.filter(keyFilter);
    if (!updatedKeys.length) {
      return Response.json({ error: 'API key not found' }, { status: 404 });
    }
    const updated = updatedKeys[0];

    return Response.json({ 
      success: true, 
      apiKey: {
        id: updated.id,
        name: updated.name,
        status: updated.status
      }
    });

  } catch (error) {
    console.error('Toggle API key failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});