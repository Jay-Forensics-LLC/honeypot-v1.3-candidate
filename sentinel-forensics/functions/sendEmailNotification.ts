import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * EMAIL NOTIFICATION SERVICE (SendGrid/SMTP)
 * 
 * Sends email notifications for alerts
 * Falls back to mock mode if SMTP not configured
 */

const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.sendgrid.net';
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '587');
const SMTP_USERNAME = Deno.env.get('SMTP_USERNAME') || 'apikey';
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD');
const SMTP_FROM = Deno.env.get('SMTP_FROM') || 'alerts@sentinel-forensics.com';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { alert_id, recipient, test_mode = false } = await req.json();

        const startTime = Date.now();
        let alert = null;
        let subject = 'Test Email from Sentinel Forensics';
        let body = 'This is a test email to verify your notification settings.';

        if (alert_id && !test_mode) {
            const alerts = await base44.asServiceRole.entities.Alert.filter({ id: alert_id });
            
            if (alerts.length === 0) {
                return Response.json({ error: 'Alert not found' }, { status: 404 });
            }

            alert = alerts[0];
            subject = `[Sentinel Alert - ${alert.severity.toUpperCase()}] ${alert.title}`;
            body = generateAlertEmailBody(alert);
        }

        const emailRecipient = recipient || user.email;

        let result;
        
        if (SMTP_PASSWORD) {
            result = await sendViaSMTP(emailRecipient, subject, body);
        } else {
            result = simulateEmailSend(emailRecipient, subject, body);
        }

        const duration = Date.now() - startTime;

        const logEntry = await base44.asServiceRole.entities.NotificationLog.create({
            log_id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            notification_type: 'email',
            destination: emailRecipient,
            status: result.success ? 'success' : 'failed',
            related_alert_id: alert?.id || null,
            payload: { subject, body_preview: body.substring(0, 200) },
            error_message: result.error,
            error_code: result.error_code,
            sent_at: new Date().toISOString(),
            duration_ms: duration
        });

        if (result.success && !test_mode) {
            await base44.asServiceRole.entities.SentNotification.create({
                notification_id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                alert_id: alert.id,
                recipient: emailRecipient,
                channel: 'email',
                status: 'sent',
                sent_at: new Date().toISOString(),
                payload: { subject, body },
                simulated: !SMTP_PASSWORD
            });
        }

        return Response.json({
            success: result.success,
            simulated: !SMTP_PASSWORD,
            recipient: emailRecipient,
            log_id: logEntry.log_id,
            duration_ms: duration,
            error: result.error
        });

    } catch (error) {
        console.error('Email notification error:', error);
        return Response.json({
            error: 'Email send failed',
            message: error.message
        }, { status: 500 });
    }
});

async function sendViaSMTP(to, subject, body) {
    try {
        const response = await fetch(`https://${SMTP_HOST}:${SMTP_PORT}/v3/mail/send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SMTP_PASSWORD}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                personalizations: [{
                    to: [{ email: to }]
                }],
                from: { email: SMTP_FROM },
                subject: subject,
                content: [{
                    type: 'text/html',
                    value: body
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`SMTP error: ${response.status} ${response.statusText}`);
        }

        return { success: true };

    } catch (error) {
        console.error('SMTP send failed:', error);
        return {
            success: false,
            error: error.message,
            error_code: 'SMTP_ERROR'
        };
    }
}

function simulateEmailSend(to, subject, body) {
    console.log('📧 SIMULATED EMAIL SEND:', {
        to,
        subject,
        body_preview: body.substring(0, 150)
    });

    return {
        success: true,
        simulated: true
    };
}

function generateAlertEmailBody(alert) {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .severity { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; }
        .critical { background: #DC2626; color: white; }
        .high { background: #F59E0B; color: white; }
        .medium { background: #EAB308; color: white; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">🛡️ Security Alert</h1>
        </div>
        <div class="content">
            <p><span class="severity ${alert.severity}">${alert.severity.toUpperCase()}</span></p>
            
            <h2>${alert.title}</h2>
            <p>${alert.description}</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            
            <p><strong>Detection Time:</strong> ${new Date(alert.detection_timestamp).toLocaleString()}</p>
            <p><strong>Source:</strong> ${alert.source}</p>
            <p><strong>Threat Score:</strong> ${alert.threat_score}/100</p>
            
            ${alert.recommended_actions && alert.recommended_actions.length > 0 ? `
            <h3>Recommended Actions:</h3>
            <ol>
                ${alert.recommended_actions.map(action => `<li>${action}</li>`).join('\n')}
            </ol>
            ` : ''}
            
            <p style="margin-top: 30px;">
                <a href="https://sentinel-forensics.app/dashboard" 
                   style="background: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                    View in Dashboard
                </a>
            </p>
        </div>
        <div class="footer">
            <p>Sentinel Forensics Security Alert System</p>
            <p>This is an automated security notification. Do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}