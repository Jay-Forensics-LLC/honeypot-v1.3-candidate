import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Get MDM Device Status & Health
 * Returns comprehensive device status including compliance, security, and health metrics
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { device_id } = await req.json();

        if (!device_id) {
            return Response.json({ error: 'device_id required' }, { status: 400 });
        }

        // Get device
        const devices = await base44.asServiceRole.entities.MobileDevice.filter({ id: device_id });
        
        if (devices.length === 0) {
            return Response.json({ error: 'Device not found' }, { status: 404 });
        }

        const device = devices[0];

        // Check ownership
        if (device.created_by !== user.email && user.role !== 'admin') {
            return Response.json({ error: 'Access denied' }, { status: 403 });
        }

        // Get applied policies
        const policies = await base44.asServiceRole.entities.MDMPolicy.filter({
            assigned_device_ids: { $contains: device.id }
        });

        // Get recent actions
        const actions = await base44.asServiceRole.entities.MDMAction.filter({
            device_id: device.id
        }, '-initiated_at', 10);

        // Calculate health metrics
        const lastSyncTime = new Date(device.last_sync || device.enrolled_at);
        const timeSinceSync = Date.now() - lastSyncTime.getTime();
        const isOnline = timeSinceSync < 300000; // 5 minutes

        // Compliance scoring
        const secStatus = device.security_status || {};
        const complianceFactors = {
            screen_lock: secStatus.screen_lock_enabled ? 20 : 0,
            encryption: secStatus.encryption_enabled ? 30 : 0,
            biometric: secStatus.biometric_enabled ? 10 : 0,
            not_rooted: !secStatus.is_rooted ? 20 : 0,
            not_jailbroken: !secStatus.is_jailbroken ? 20 : 0
        };

        const complianceScore = Object.values(complianceFactors).reduce((a, b) => a + b, 0);

        // Risk assessment
        let riskFactors = [];
        if (secStatus.is_rooted || secStatus.is_jailbroken) {
            riskFactors.push('Device is rooted/jailbroken');
        }
        if (secStatus.developer_mode_enabled) {
            riskFactors.push('Developer mode enabled');
        }
        if (!secStatus.encryption_enabled) {
            riskFactors.push('Device encryption disabled');
        }
        if (device.mdm_status?.mdm_detected && device.mdm_status?.mdm_legitimacy_score < 50) {
            riskFactors.push('Suspicious MDM profile detected');
        }

        const status = {
            device_id: device.id,
            device_name: device.device_name,
            platform: device.platform,
            status: device.status,
            online: isOnline,
            last_sync: device.last_sync,
            time_since_sync_minutes: Math.floor(timeSinceSync / 60000),
            compliance: {
                status: complianceScore >= 90 ? 'compliant' : 
                       complianceScore >= 70 ? 'partial' : 'non_compliant',
                score: complianceScore,
                factors: complianceFactors
            },
            security: {
                risk_score: device.risk_score,
                risk_level: device.risk_score >= 75 ? 'high' :
                           device.risk_score >= 50 ? 'medium' : 'low',
                risk_factors: riskFactors,
                security_status: secStatus
            },
            policies: {
                count: policies.length,
                active: policies.filter(p => p.is_active).length,
                names: policies.map(p => p.policy_name)
            },
            recent_actions: actions.length,
            mdm_info: device.mdm_status,
            network_info: device.network_info,
            health_summary: {
                overall: complianceScore >= 90 ? 'healthy' :
                        complianceScore >= 70 ? 'warning' : 'critical',
                issues: riskFactors.length,
                last_check: device.last_sync
            }
        };

        return Response.json(status);

    } catch (error) {
        console.error('Device status error:', error);
        return Response.json({
            error: 'Failed to get device status',
            message: error.message
        }, { status: 500 });
    }
});