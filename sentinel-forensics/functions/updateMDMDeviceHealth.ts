import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Update MDM Device Health (Heartbeat)
 * Called by mobile devices to report status and receive policy updates
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate device via enrollment token (header or body)
        const authHeader = req.headers.get('Authorization');
        const { 
            enrollment_token,
            device_id,
            health_data 
        } = await req.json();

        const token = authHeader?.replace('Bearer ', '') || enrollment_token;

        if (!token || !device_id) {
            return Response.json({
                error: 'Missing authentication',
                required: ['enrollment_token', 'device_id']
            }, { status: 401 });
        }

        // Find device by token
        const devices = await base44.asServiceRole.entities.MobileDevice.filter({
            id: device_id,
            enrollment_token: token
        });

        if (devices.length === 0) {
            return Response.json({ error: 'Device not found or invalid token' }, { status: 404 });
        }

        const device = devices[0];

        // Update device health
        const updates = {
            last_sync: new Date().toISOString()
        };

        if (health_data) {
            // Update security status
            if (health_data.security_status) {
                updates.security_status = {
                    ...device.security_status,
                    ...health_data.security_status
                };
            }

            // Update network info
            if (health_data.network_info) {
                updates.network_info = health_data.network_info;
            }

            // Update installed apps
            if (health_data.installed_apps) {
                updates.installed_apps = health_data.installed_apps;
            }

            // Update MDM detection
            if (health_data.mdm_status) {
                updates.mdm_status = {
                    ...device.mdm_status,
                    ...health_data.mdm_status,
                    last_scan: new Date().toISOString()
                };
            }

            // Recalculate risk score
            let riskScore = 0;
            
            const sec = updates.security_status || device.security_status;
            if (sec.is_rooted || sec.is_jailbroken) riskScore += 40;
            if (sec.developer_mode_enabled) riskScore += 15;
            if (!sec.encryption_enabled) riskScore += 20;
            if (!sec.screen_lock_enabled) riskScore += 15;
            if (sec.unknown_sources_enabled) riskScore += 10;
            
            const mdm = updates.mdm_status || device.mdm_status;
            if (mdm.mdm_detected && mdm.mdm_legitimacy_score < 50) {
                riskScore += 30;
            }

            updates.risk_score = Math.min(riskScore, 100);
        }

        // Update device
        await base44.asServiceRole.entities.MobileDevice.update(device.id, updates);

        // Get pending actions for this device
        const pendingActions = await base44.asServiceRole.entities.MDMAction.filter({
            device_id: device.id,
            status: { $in: ['queued', 'sent'] }
        }, '-initiated_at', 10);

        // Mark actions as sent
        for (const action of pendingActions) {
            await base44.asServiceRole.entities.MDMAction.update(action.id, {
                status: 'sent'
            });
        }

        // Get active policies
        const policies = await base44.asServiceRole.entities.MDMPolicy.filter({
            assigned_device_ids: { $contains: device.id },
            is_active: true
        });

        return Response.json({
            success: true,
            device_status: updates.status || device.status,
            risk_score: updates.risk_score || device.risk_score,
            pending_actions: pendingActions.map(a => ({
                action_id: a.action_id,
                action_type: a.action_type,
                params: a.params
            })),
            active_policies: policies.map(p => ({
                policy_id: p.policy_id,
                policy_name: p.policy_name,
                policy_config: p.policy_config
            })),
            server_time: new Date().toISOString(),
            next_checkin_interval_seconds: 300 // Check in every 5 minutes
        });

    } catch (error) {
        console.error('Health update error:', error);
        return Response.json({
            error: 'Health update failed',
            message: error.message
        }, { status: 500 });
    }
});