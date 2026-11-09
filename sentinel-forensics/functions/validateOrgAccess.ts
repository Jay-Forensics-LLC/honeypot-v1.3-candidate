import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * PHASE 7: Organization Access Validator
 * 
 * Validates that a user has access to a specific resource
 * based on organization_id ownership.
 * 
 * USE THIS in backend functions before performing sensitive operations.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entity_name, resource_id } = await req.json();

    if (!entity_name || !resource_id) {
      return Response.json({ 
        error: 'entity_name and resource_id required' 
      }, { status: 400 });
    }

    // Fetch resource with service role (bypass RLS temporarily)
    const resources = await base44.asServiceRole.entities[entity_name].filter({
      id: resource_id
    });

    if (!resources || resources.length === 0) {
      return Response.json({ 
        error: 'Resource not found',
        has_access: false 
      }, { status: 404 });
    }

    const resource = resources[0];

    // PHASE 7: Validate organization ownership
    if (resource.organization_id !== user.organization_id) {
      // Log unauthorized access attempt
      await base44.asServiceRole.entities.SentinelAuditLog.create({
        organization_id: user.organization_id,
        user_email: user.email,
        action: 'unauthorized_access_attempt',
        resource_type: entity_name,
        resource_id,
        timestamp: new Date().toISOString(),
        hmac_signature: 'n/a',
        verified: true,
        severity: 'critical',
        details: {
          attempted_org: resource.organization_id,
          user_org: user.organization_id
        }
      });

      return Response.json({ 
        error: 'Forbidden: Resource belongs to different organization',
        has_access: false 
      }, { status: 403 });
    }

    return Response.json({
      has_access: true,
      resource
    });

  } catch (error) {
    console.error('Org access validation error:', error);
    return Response.json({
      error: error.message,
      has_access: false
    }, { status: 500 });
  }
});