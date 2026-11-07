import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// SECURITY FIX: Rate limiting
const rateLimitStore = new Map();
const RATE_LIMIT = 20; // notifications per minute
const WINDOW_MS = 60000;

function checkRateLimit(userEmail) {
  const now = Date.now();
  const userKey = userEmail;
  const record = rateLimitStore.get(userKey) || { count: 0, resetTime: now + WINDOW_MS };
  
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + WINDOW_MS;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  rateLimitStore.set(userKey, record);
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check
    if (!checkRateLimit(user.email)) {
      return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const { incident_id, incident_type, assigned_to_email, message, notification_type } = await req.json();

    if (!incident_id || !assigned_to_email) {
      return Response.json({ error: 'incident_id and assigned_to_email required' }, { status: 400 });
    }

    // Create notification record
    await base44.asServiceRole.entities.Notification.create({
      user_email: assigned_to_email,
      title: `Incident ${notification_type || 'Assignment'}`,
      message: message || `You have been assigned to ${incident_type} ${incident_id}`,
      type: 'incident_assignment',
      severity: 'high',
      read: false,
      metadata: {
        incident_id,
        incident_type,
        assigned_by: user.email
      }
    });

    // Send email notification
    try {
      await base44.integrations.Core.SendEmail({
        to: assigned_to_email,
        subject: `Incident Assignment - ${incident_type.toUpperCase()} ${incident_id}`,
        body: `
          <h2>You have been assigned to an incident</h2>
          <p><strong>Type:</strong> ${incident_type}</p>
          <p><strong>ID:</strong> ${incident_id}</p>
          <p><strong>Assigned by:</strong> ${user.full_name || user.email}</p>
          <p><strong>Message:</strong> ${message || 'No additional message'}</p>
          <p>Please log in to review and respond to this incident.</p>
        `
      });
    } catch (emailError) {
      console.error('Email notification failed:', emailError);
    }

    return Response.json({ 
      success: true,
      message: 'Notification sent'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});