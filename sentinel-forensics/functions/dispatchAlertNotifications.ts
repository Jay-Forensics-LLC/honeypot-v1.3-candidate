import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ALERT NOTIFICATION DISPATCHER
 * 
 * Sends alert notifications via email, messaging, webhooks
 * Abstracted layer for easy integration with real providers
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { alert_id } = await req.json();

        if (!alert_id) {
            return Response.json({ error: 'alert_id required' }, { status: 400 });
        }

        // Get alert
        const alerts = await base44.asServiceRole.entities.Alert.filter({ id: alert_id });
        
        if (alerts.length === 0) {
            return Response.json({ error: 'Alert not found' }, { status: 404 });
        }

        const alert = alerts[0];

        // Find matching alert rule if source indicates one
        let alertRule = null;
        if (alert.source?.startsWith('AlertRule:')) {
            const ruleName = alert.source.replace('AlertRule: ', '');
            const rules = await base44.asServiceRole.entities.SIEMAlertRule.filter({
                rule_name: ruleName
            });
            alertRule = rules[0];
        }

        const notifications = [];

        // Get user preferences
        const targetUser = await base44.asServiceRole.entities.User.filter({
            email: alert.created_by || user.email
        });

        const userEmail = targetUser[0]?.email || user.email;

        // Determine notification channels
        const channels = [];

        if (alertRule?.actions) {
            for (const action of alertRule.actions) {
                if (action.action_type === 'send_email') {
                    channels.push({
                        type: 'email',
                        config: action.action_config || { recipient: userEmail }
                    });
                }
            }
        } else {
            // Default: send UI toast only
            channels.push({ type: 'ui_toast', config: {} });
        }

        // Always create UI toast notification
        const uiNotif = await base44.asServiceRole.entities.SentNotification.create({
            notification_id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            alert_id: alert.id,
            alert_rule_id: alertRule?.rule_id || null,
            recipient: userEmail,
            channel: 'ui_toast',
            status: 'sent',
            sent_at: new Date().toISOString(),
            payload: {
                title: alert.title,
                severity: alert.severity,
                message: alert.description,
                link: `/alerts/${alert.id}`
            },
            simulated: false
        });

        notifications.push(uiNotif);

        // Send email notifications (simulated)
        for (const channel of channels.filter(c => c.type === 'email')) {
            const emailNotif = await sendEmailNotification(alert, channel.config, base44);
            notifications.push(emailNotif);
        }

        return Response.json({
            success: true,
            alert_id: alert.id,
            notifications_sent: notifications.length,
            notifications: notifications.map(n => ({
                id: n.notification_id,
                channel: n.channel,
                status: n.status,
                simulated: n.simulated
            }))
        });

    } catch (error) {
        console.error('Alert dispatch error:', error);
        return Response.json({
            error: 'Dispatch failed',
            message: error.message
        }, { status: 500 });
    }
});

async function sendEmailNotification(alert, config, base44) {
    const recipient = config.recipient || alert.created_by;

    // ABSTRACTION LAYER: Email service
    // In production, integrate with SendGrid, AWS SES, etc.
    const emailPayload = {
        to: recipient,
        subject: `[Sentinel Alert - ${alert.severity.toUpperCase()}] ${alert.title}`,
        body: `
Security Alert Detected

Severity: ${alert.severity.toUpperCase()}
Title: ${alert.title}
Description: ${alert.description}

Detection Time: ${new Date(alert.detection_timestamp).toLocaleString()}
Source: ${alert.source}

Threat Score: ${alert.threat_score}/100

Recommended Actions:
${alert.recommended_actions?.map((a, i) => `${i + 1}. ${a}`).join('\n') || 'None specified'}

---
View full details in Sentinel Forensics dashboard.
        `.trim()
    };

    // SIMULATED: Log email instead of actually sending
    console.log('📧 SIMULATED EMAIL SEND:', {
        to: recipient,
        subject: emailPayload.subject,
        preview: emailPayload.body.substring(0, 200)
    });

    return await base44.asServiceRole.entities.SentNotification.create({
        notification_id: `EMAIL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        alert_id: alert.id,
        alert_rule_id: null,
        recipient: recipient,
        channel: 'email',
        status: 'sent',
        sent_at: new Date().toISOString(),
        payload: emailPayload,
        simulated: true
    });
}