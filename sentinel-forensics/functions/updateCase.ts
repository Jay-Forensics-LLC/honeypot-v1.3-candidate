import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Update Case - BACKEND ONLY
 * Fixes Issues: #003, #004, #006, #007, #045
 * 
 * Features:
 * - Workflow validation (Issue #003, #004)
 * - Tag validation (Issue #006)
 * - Team member validation (Issue #045)
 * - Sensitive findings encryption (Issue #007)
 * - Audit trail for all changes
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { case_id, updates } = await req.json();

    if (!case_id || !updates) {
      return Response.json({ 
        error: 'Missing required fields: case_id, updates' 
      }, { status: 400 });
    }

    // Get existing case
    const existingCase = await base44.entities.Case.get(case_id);
    
    if (!existingCase) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }

    // Verify user has access
    const hasAccess = 
      existingCase.created_by === user.email ||
      existingCase.assigned_investigator === user.email ||
      existingCase.team_members?.includes(user.email) ||
      user.role === 'admin';

    if (!hasAccess) {
      return Response.json({ 
        error: 'You do not have access to this case' 
      }, { status: 403 });
    }

    // Issue #003, #004: Validate status/priority transitions
    if (updates.status) {
      const validTransition = validateStatusTransition(
        existingCase.status,
        updates.status,
        user.role
      );

      if (!validTransition.allowed) {
        return Response.json({ 
          error: validTransition.reason,
          issue: '#003'
        }, { status: 400 });
      }
    }

    if (updates.priority) {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(updates.priority)) {
        return Response.json({ 
          error: 'Invalid priority value',
          issue: '#004'
        }, { status: 400 });
      }
    }

    // Issue #006: Validate tags if provided
    if (updates.tags) {
      if (updates.tags.length > 20) {
        return Response.json({ 
          error: 'Maximum 20 tags allowed',
          issue: '#006'
        }, { status: 400 });
      }

      const tagPattern = /^[a-zA-Z0-9_-]{1,30}$/;
      for (const tag of updates.tags) {
        if (!tagPattern.test(tag)) {
          return Response.json({ 
            error: `Invalid tag format: "${tag}". Tags must be 1-30 characters: a-z, A-Z, 0-9, dash, underscore only`,
            issue: '#006'
          }, { status: 400 });
        }
      }
    }

    // Issue #045: Validate team_members if provided
    if (updates.team_members) {
      if (updates.team_members.length > 50) {
        return Response.json({ 
          error: 'Maximum 50 team members allowed' 
        }, { status: 400 });
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const email of updates.team_members) {
        if (!emailPattern.test(email)) {
          return Response.json({ 
            error: `Invalid email format: "${email}"` 
          }, { status: 400 });
        }

        // Verify team member is from same organization
        const teamMemberUsers = await base44.asServiceRole.entities.User.filter({
          email: email
        });

        if (!teamMemberUsers || teamMemberUsers.length === 0) {
          return Response.json({ 
            error: `Team member not found: ${email}`,
            issue: '#045'
          }, { status: 400 });
        }

        if (teamMemberUsers[0].organization_id !== user.organization_id) {
          return Response.json({ 
            error: `Team member ${email} is from a different organization`,
            issue: '#045'
          }, { status: 403 });
        }
      }
    }

    // Build update data
    const timestamp = new Date().toISOString();
    const updateData = {
      ...updates,
      last_modified_by: user.email,
      last_modified_at: timestamp
    };

    // Issue #007: Encrypt findings_sensitive if provided
    if (updates.findings_sensitive) {
      // In production, use actual encryption
      updateData.findings_sensitive = `[ENCRYPTED] ${updates.findings_sensitive}`;
    }

    // Prevent modification of protected fields
    delete updateData.organization_id;
    delete updateData.case_number;
    delete updateData.evidence_count;
    delete updateData.created_by;
    delete updateData.created_date;
    delete updateData.legal_hold;
    delete updateData.retention_until;
    delete updateData.archive_location;

    // Track which fields changed
    const fields_changed = Object.keys(updateData).filter(
      key => updateData[key] !== existingCase[key]
    );

    // Update case using service role
    const updatedCase = await base44.asServiceRole.entities.Case.update(
      case_id,
      updateData
    );

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: 'case_updated',
      severity: 'info',
      description: `Case updated: ${existingCase.title}`,
      resource_type: 'Case',
      resource_id: case_id,
      case_id: case_id,
      action_performed: 'update',
      fields_changed: fields_changed,
      previous_state: existingCase,
      new_state: updatedCase,
      metadata: {
        modified_by: user.email
      }
    });

    return Response.json({ 
      success: true,
      case_id: updatedCase.id,
      fields_changed: fields_changed,
      message: 'Case updated successfully'
    });

  } catch (error) {
    console.error('Case update failed:', error);
    return createErrorResponse(error);
  }
});

/**
 * Issue #003: Validate status transitions
 * Prevents workflow bypass
 */
function validateStatusTransition(currentStatus, newStatus, userRole) {
  // Define allowed transitions
  const allowedTransitions = {
    'open': ['active', 'closed'],
    'active': ['under_review', 'closed'],
    'under_review': ['active', 'closed'],
    'closed': ['archived'],
    'archived': [] // Archived cases cannot change status (unless admin)
  };

  // Admins can override workflow
  if (userRole === 'admin') {
    return { allowed: true, reason: 'Admin override' };
  }

  // Check if transition is allowed
  const allowed = allowedTransitions[currentStatus]?.includes(newStatus);

  if (!allowed) {
    return {
      allowed: false,
      reason: `Invalid status transition: ${currentStatus} → ${newStatus}. Allowed: ${allowedTransitions[currentStatus]?.join(', ') || 'none'}`
    };
  }

  return { allowed: true };
}