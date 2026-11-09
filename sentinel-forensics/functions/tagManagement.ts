import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case 'create': {
        const { scope, caseId, name, displayName, color } = params;
        
        // Validate input
        if (!name || name.length < 2 || name.length > 32) {
          return Response.json({ error: 'Tag name must be 2-32 characters' }, { status: 400 });
        }

        // Normalize name
        const normalizedName = name.trim().toLowerCase().replace(/[^a-z0-9-_\s]/g, '');
        if (!normalizedName) {
          return Response.json({ error: 'Invalid tag name' }, { status: 400 });
        }

        // Check for duplicates
        const existing = await base44.entities.Tag.filter({
          organization_id: user.organization_id,
          scope,
          case_id: caseId || null,
          name: normalizedName,
          is_deleted: false
        });

        if (existing.length > 0) {
          return Response.json({ error: 'Tag already exists' }, { status: 409 });
        }

        // Create tag
        const tag = await base44.asServiceRole.entities.Tag.create({
          organization_id: user.organization_id,
          name: normalizedName,
          display_name: displayName || name,
          color: color || '#3B82F6',
          scope: scope || 'ORG',
          case_id: caseId || null,
          created_by: user.email,
          usage_count: 0,
          is_deleted: false
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'TAG_CREATED',
          severity: 'info',
          description: `Tag created: ${tag.display_name}`,
          user_id: user.email,
          success: true,
          metadata: { tag_id: tag.id, scope, case_id: caseId }
        });

        return Response.json({ tag });
      }

      case 'list': {
        const { scope, caseId } = params;
        const filter = {
          organization_id: user.organization_id,
          is_deleted: false
        };

        if (scope) filter.scope = scope;
        if (caseId) filter.case_id = caseId;

        const tags = await base44.entities.Tag.filter(filter);
        return Response.json({ tags });
      }

      case 'update': {
        const { tagId, displayName, color } = params;
        
        const updates = {};
        if (displayName) updates.display_name = displayName;
        if (color) updates.color = color;

        const tag = await base44.asServiceRole.entities.Tag.update(tagId, updates);

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'TAG_UPDATED',
          severity: 'info',
          description: `Tag updated: ${tag.display_name}`,
          user_id: user.email,
          success: true,
          metadata: { tag_id: tagId, updates }
        });

        return Response.json({ tag });
      }

      case 'delete': {
        const { tagId } = params;
        
        // Soft delete
        const tag = await base44.asServiceRole.entities.Tag.update(tagId, {
          is_deleted: true
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'TAG_DELETED',
          severity: 'warning',
          description: `Tag deleted: ${tag.display_name}`,
          user_id: user.email,
          success: true,
          metadata: { tag_id: tagId }
        });

        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Tag management error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});