import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Redact PII from messages
function redactMessage(message) {
  // Redact emails
  let redacted = message.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
  
  // Redact phone numbers
  redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');
  
  // Redact SSN-like patterns
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]');
  
  return redacted;
}

// Send to Slack (mock)
function sendSlack(webhook, message, deepLink) {
  // In production, use actual Slack webhook
  console.log('[Slack] Sending:', { message, deepLink });
  
  // Mock Slack API call
  return {
    channel: 'slack',
    status: 'sent',
    sent_at: new Date().toISOString()
  };
}

// Send SMS (mock)
function sendSMS(phone, message) {
  // In production, use Twilio API
  console.log('[SMS] Sending to', phone, ':', message);
  
  return {
    channel: 'sms',
    address: phone,
    status: 'sent',
    sent_at: new Date().toISOString()
  };
}

// Send Email (mock)
function sendEmail(to, subject, body, deepLink) {
  // In production, use email service
  console.log('[Email] Sending to', to, ':', subject);
  
  return {
    channel: 'email',
    address: to,
    status: 'sent',
    sent_at: new Date().toISOString()
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      case_id, 
      alert_type, 
      severity, 
      title, 
      message, 
      channels, 
      metadata 
    } = await req.json();

    if (!alert_type || !severity || !title || !message || !channels) {
      return Response.json({ 
        error: 'alert_type, severity, title, message, and channels required' 
      }, { status: 400 });
    }

    // Redact message
    const redactedMessage = redactMessage(message);

    // Generate deep link
    const deepLink = `${Deno.env.get('APP_URL') || 'https://app.sentinel.com'}/cases/${case_id}`;

    // Dispatch to each channel
    const recipients = [];

    for (const channel of channels) {
      try {
        let result;
        
        switch (channel) {
          case 'slack':
            result = sendSlack(
              Deno.env.get('SLACK_WEBHOOK_URL'),
              redactedMessage,
              deepLink
            );
            break;
            
          case 'sms':
            result = sendSMS(
              user.phone || Deno.env.get('DEFAULT_SMS_NUMBER'),
              redactedMessage.substring(0, 160) // SMS character limit
            );
            break;
            
          case 'email':
            result = sendEmail(
              user.email,
              title,
              redactedMessage,
              deepLink
            );
            break;
            
          case 'voice':
            // Mock voice call
            result = {
              channel: 'voice',
              address: user.phone,
              status: 'sent',
              sent_at: new Date().toISOString()
            };
            break;
            
          default:
            continue;
        }
        
        recipients.push(result);
      } catch (error) {
        console.error(`Failed to send ${channel}:`, error);
        recipients.push({
          channel,
          status: 'failed',
          error: error.message,
          sent_at: new Date().toISOString()
        });
      }
    }

    // Create alert record
    const alert = await base44.asServiceRole.entities.NotificationAlert.create({
      alert_id: `ALERT-${Date.now()}`,
      case_id: case_id || null,
      alert_type,
      severity,
      title,
      message: redactedMessage,
      channels,
      recipients,
      deep_link: deepLink,
      acknowledged: false,
      escalated: false,
      escalation_timeout_minutes: 30,
      metadata: metadata || {},
      created_at: new Date().toISOString()
    });

    return Response.json({
      success: true,
      alert_id: alert.alert_id,
      recipients,
      summary: {
        sent: recipients.filter(r => r.status === 'sent').length,
        failed: recipients.filter(r => r.status === 'failed').length
      }
    });

  } catch (error) {
    console.error('Alert dispatch error:', error);
    return Response.json({ 
      error: 'Dispatch failed', 
      message: error.message 
    }, { status: 500 });
  }
});