import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * SEND NOTIFICATION
 * Create notifications for users
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.organization_id) {
      return Response.json({ error: 'Organization context required' }, { status: 403 });
    }

    const { userEmail, type, title, message, severity, link, metadata } = await req.json();
    if (typeof userEmail !== 'string' || !userEmail.trim()) {
      return Response.json({ error: 'Recipient required' }, { status: 400 });
    }

    const recipientEmail = userEmail.trim();
    const recipients = await base44.asServiceRole.entities.User.filter({
      email: recipientEmail,
      organization_id: user.organization_id
    });
    if (!recipients.some(recipient => recipient.organization_id === user.organization_id)) {
      return Response.json({ error: 'Recipient not found in your organization' }, { status: 404 });
    }

    // Create notification
    const notification = await base44.asServiceRole.entities.Notification.create({
      organization_id: user.organization_id,
      user_email: recipientEmail,
      type,
      title,
      message,
      severity: severity || 'info',
      link,
      metadata
    });

    // Log notification
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'notification_sent',
      severity: 'info',
      description: `Notification sent to ${recipientEmail}: ${title}`,
      user_id: user.email,
      resource_type: 'Notification',
      resource_id: notification.id,
      action_performed: 'create',
      success: true,
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      timestamp: new Date().toISOString(),
      blockchain_hash: crypto.randomUUID()
    });

    return Response.json({ success: true, notificationId: notification.id });
  } catch (error) {
    console.error('Notification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});