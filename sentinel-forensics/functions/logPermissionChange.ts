import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * LOG PERMISSION CHANGE
 * Audit logging for role and permission changes
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const { 
      targetUserId, 
      targetUserEmail,
      previousRole, 
      newRole, 
      changeType,
      reason 
    } = await req.json();

    // Create comprehensive audit log
    const auditLog = await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: changeType === 'role_change' ? 'user_role_changed' : 'permission_modified',
      severity: 'warning',
      description: `Role changed from ${previousRole} to ${newRole} for user ${targetUserEmail}`,
      user_id: user.email, // Who made the change
      resource_type: 'User',
      resource_id: targetUserId,
      action_performed: 'role_update',
      previous_state: { role: previousRole },
      new_state: { role: newRole },
      success: true,
      metadata: {
        targetUser: targetUserEmail,
        previousRole,
        newRole,
        reason: reason || 'Not specified',
        changedBy: user.email
      },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      timestamp: new Date().toISOString(),
      blockchain_hash: crypto.randomUUID(),
      change_hash: await calculateChangeHash({ previousRole, newRole })
    });

    return Response.json({ 
      success: true, 
      auditLogId: auditLog.id 
    });
  } catch (error) {
    console.error('Permission logging error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function calculateChangeHash(data) {
  const encoder = new TextEncoder();
  const dataString = JSON.stringify(data);
  const dataBuffer = encoder.encode(dataString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}