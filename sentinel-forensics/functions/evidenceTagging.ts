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
      case 'apply': {
        const { evidenceId, tagIds } = params;

        if (!Array.isArray(tagIds) || tagIds.length === 0) {
          return Response.json({ error: 'Invalid tagIds' }, { status: 400 });
        }

        const results = [];
        const now = new Date().toISOString();

        for (const tagId of tagIds) {
          // Check if already applied
          const existing = await base44.entities.EvidenceTag.filter({
            organization_id: user.organization_id,
            evidence_id: evidenceId,
            tag_id: tagId,
            is_active: true
          });

          if (existing.length > 0) {
            continue; // Skip if already applied
          }

          // Apply tag
          const evidenceTag = await base44.asServiceRole.entities.EvidenceTag.create({
            organization_id: user.organization_id,
            evidence_id: evidenceId,
            tag_id: tagId,
            applied_by: user.email,
            applied_at: now,
            is_active: true
          });

          // Increment usage count
          const tag = await base44.entities.Tag.filter({ id: tagId });
          if (tag[0]) {
            await base44.asServiceRole.entities.Tag.update(tagId, {
              usage_count: (tag[0].usage_count || 0) + 1
            });
          }

          results.push(evidenceTag);

          // Audit log
          await base44.asServiceRole.entities.AuditLog.create({
            organization_id: user.organization_id,
            event_type: 'TAG_APPLIED',
            severity: 'info',
            description: `Tag applied to evidence`,
            user_id: user.email,
            success: true,
            metadata: { evidence_id: evidenceId, tag_id: tagId }
          });
        }

        return Response.json({ applied: results.length });
      }

      case 'remove': {
        const { evidenceId, tagIds } = params;

        if (!Array.isArray(tagIds) || tagIds.length === 0) {
          return Response.json({ error: 'Invalid tagIds' }, { status: 400 });
        }

        const now = new Date().toISOString();
        let removed = 0;

        for (const tagId of tagIds) {
          // Find active evidence tags
          const evidenceTags = await base44.entities.EvidenceTag.filter({
            organization_id: user.organization_id,
            evidence_id: evidenceId,
            tag_id: tagId,
            is_active: true
          });

          for (const et of evidenceTags) {
            await base44.asServiceRole.entities.EvidenceTag.update(et.id, {
              is_active: false,
              removed_at: now,
              removed_by: user.email
            });

            // Decrement usage count
            const tag = await base44.entities.Tag.filter({ id: tagId });
            if (tag[0] && tag[0].usage_count > 0) {
              await base44.asServiceRole.entities.Tag.update(tagId, {
                usage_count: tag[0].usage_count - 1
              });
            }

            removed++;

            // Audit log
            await base44.asServiceRole.entities.AuditLog.create({
              organization_id: user.organization_id,
              event_type: 'TAG_REMOVED',
              severity: 'info',
              description: `Tag removed from evidence`,
              user_id: user.email,
              success: true,
              metadata: { evidence_id: evidenceId, tag_id: tagId }
            });
          }
        }

        return Response.json({ removed });
      }

      case 'get': {
        const { evidenceId } = params;

        // Get active tags for this evidence
        const evidenceTags = await base44.entities.EvidenceTag.filter({
          organization_id: user.organization_id,
          evidence_id: evidenceId,
          is_active: true
        });

        // Fetch full tag details
        const tagIds = evidenceTags.map(et => et.tag_id);
        const tags = [];

        for (const tagId of tagIds) {
          const tag = await base44.entities.Tag.filter({ id: tagId, is_deleted: false });
          if (tag[0]) tags.push(tag[0]);
        }

        return Response.json({ tags });
      }

      case 'bulk_apply': {
        const { evidenceIds, tagIds } = params;

        if (!Array.isArray(evidenceIds) || !Array.isArray(tagIds)) {
          return Response.json({ error: 'Invalid input' }, { status: 400 });
        }

        let applied = 0;
        const now = new Date().toISOString();

        for (const evidenceId of evidenceIds) {
          for (const tagId of tagIds) {
            // Check if already applied
            const existing = await base44.entities.EvidenceTag.filter({
              organization_id: user.organization_id,
              evidence_id: evidenceId,
              tag_id: tagId,
              is_active: true
            });

            if (existing.length > 0) continue;

            // Apply tag
            await base44.asServiceRole.entities.EvidenceTag.create({
              organization_id: user.organization_id,
              evidence_id: evidenceId,
              tag_id: tagId,
              applied_by: user.email,
              applied_at: now,
              is_active: true
            });

            applied++;
          }
        }

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'TAG_BULK_APPLIED',
          severity: 'info',
          description: `Bulk tag application: ${applied} tags applied`,
          user_id: user.email,
          success: true,
          metadata: { evidence_count: evidenceIds.length, tag_count: tagIds.length, applied }
        });

        return Response.json({ applied });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Evidence tagging error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});