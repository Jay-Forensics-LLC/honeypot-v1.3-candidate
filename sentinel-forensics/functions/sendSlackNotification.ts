import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * SLACK NOTIFICATION SERVICE
 * 
 * Sends alert notifications to Slack via webhook
 * Falls back to mock mode if webhook not configured
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { alert_id, webhook_url, channel, test_mode = false } = await req.json();

        const startTime = Date.now();
        let alert = null;
        let slackMessage = {
            text: '🧪 Test message from Sentinel Forensics',
            blocks: [{
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*This is a test notification*\nYour Slack integration is working correctly!'
                }
            }]
        };

        if (alert_id && !test_mode) {
            const alerts = await base44.asServiceRole.entities.Alert.filter({ id: alert_id });
            
            if (alerts.length === 0) {
                return Response.json({ error: 'Alert not found' }, { status: 404 });
            }

            alert = alerts[0];
            slackMessage = generateSlackMessage(alert, channel);
        }

        const targetWebhook = webhook_url || (await getDefaultWebhook(user.email, base44));

        let result;

        if (targetWebhook && targetWebhook.startsWith('https://hooks.slack.com/')) {
            result = await sendToSlack(targetWebhook, slackMessage);
        } else {
            result = simulateSlackSend(targetWebhook || 'no-webhook-configured', slackMessage);
        }

        const duration = Date.now() - startTime;

        await base44.asServiceRole.entities.NotificationLog.create({
            log_id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            notification_type: 'slack',
            destination: channel || targetWebhook || 'unknown',
            status: result.success ? 'success' : 'failed',
            related_alert_id: alert?.id || null,
            payload: slackMessage,
            error_message: result.error,
            error_code: result.error_code,
            sent_at: new Date().toISOString(),
            duration_ms: duration
        });

        if (result.success && !test_mode && alert) {
            await base44.asServiceRole.entities.SentNotification.create({
                notification_id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                alert_id: alert.id,
                recipient: channel || 'slack',
                channel: 'slack',
                status: 'sent',
                sent_at: new Date().toISOString(),
                payload: slackMessage,
                simulated: !targetWebhook?.startsWith('https://hooks.slack.com/')
            });
        }

        return Response.json({
            success: result.success,
            simulated: !targetWebhook?.startsWith('https://hooks.slack.com/'),
            webhook_configured: !!targetWebhook,
            duration_ms: duration,
            error: result.error
        });

    } catch (error) {
        console.error('Slack notification error:', error);
        return Response.json({
            error: 'Slack send failed',
            message: error.message
        }, { status: 500 });
    }
});

async function getDefaultWebhook(userEmail, base44) {
    const settings = await base44.asServiceRole.entities.NotificationSettings.filter({
        user_email: userEmail,
        slack_enabled: true
    });

    return settings[0]?.slack_webhook_url || null;
}

async function sendToSlack(webhookUrl, message) {
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Slack error: ${response.status} ${text}`);
        }

        return { success: true };

    } catch (error) {
        console.error('Slack send failed:', error);
        return {
            success: false,
            error: error.message,
            error_code: 'SLACK_ERROR'
        };
    }
}

function simulateSlackSend(destination, message) {
    console.log('💬 SIMULATED SLACK SEND:', {
        destination,
        message_preview: message.text || message.blocks?.[0]?.text?.text
    });

    return {
        success: true,
        simulated: true
    };
}

function generateSlackMessage(alert, channel) {
    const severityEmoji = {
        critical: '🚨',
        high: '⚠️',
        medium: '⚡',
        low: 'ℹ️'
    };

    const emoji = severityEmoji[alert.severity] || '🔔';
    const channelPrefix = channel ? `<!channel> ` : '';

    return {
        text: `${emoji} ${alert.severity.toUpperCase()} Security Alert: ${alert.title}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${emoji} Security Alert`,
                    emoji: true
                }
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Severity:*\n${alert.severity.toUpperCase()}`
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Threat Score:*\n${alert.threat_score}/100`
                    }
                ]
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${alert.title}*\n${alert.description}`
                }
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Source:*\n${alert.source}`
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Time:*\n${new Date(alert.detection_timestamp).toLocaleString()}`
                    }
                ]
            },
            ...(alert.recommended_actions && alert.recommended_actions.length > 0 ? [{
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Recommended Actions:*\n${alert.recommended_actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
                }
            }] : []),
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View in Dashboard',
                            emoji: true
                        },
                        url: 'https://sentinel-forensics.app/dashboard',
                        style: 'primary'
                    }
                ]
            }
        ]
    };
}