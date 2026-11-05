import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ENHANCED Mobile Device Enrollment
 * Enrolls iOS/Android devices into MDM with proper validation and audit logging
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { 
            device_name,
            platform,
            device_fingerprint,
            enrollment_method 
        } = await req.json();

        // Validation
        if (!device_name || !platform || !device_fingerprint) {
            return Response.json({
                error: 'Missing required fields',
                required: ['device_name', 'platform', 'device_fingerprint']
            }, { status: 400 });
        }

        if (!['ios', 'android'].includes(platform)) {
            return Response.json({
                error: 'Invalid platform',
                allowed: ['ios', 'android']
            }, { status: 400 });
        }

        // Generate secure enrollment token
        const enrollmentToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // Create mobile device record
        const device = await base44.asServiceRole.entities.MobileDevice.create({
            device_name,
            platform,
            device_fingerprint,
            enrollment_method: enrollment_method || 'manual',
            enrollment_token: enrollmentToken,
            enrolled_at: new Date().toISOString(),
            last_sync: new Date().toISOString(),
            status: 'active',
            security_status: {
                is_rooted: false,
                is_jailbroken: false,
                developer_mode_enabled: false,
                unknown_sources_enabled: false,
                screen_lock_enabled: false,
                encryption_enabled: false,
                biometric_enabled: false
            },
            mdm_status: {
                mdm_detected: false,
                mdm_vendor: null,
                mdm_profile_id: null,
                is_supervised: false,
                supervision_type: 'none',
                mdm_legitimacy_score: 0,
                certificates: [],
                configuration_profiles: [],
                last_scan: new Date().toISOString(),
                removal_attempted: false,
                removal_successful: false,
                removal_attempts: []
            },
            risk_score: 50, // Neutral starting risk
            network_info: {
                current_ip: null,
                current_network: null,
                vpn_active: false,
                proxy_detected: false
            },
            installed_apps: [],
            quarantined: false,
            quarantine_reason: null
        });

        // Get or create default policy
        let defaultPolicy = await base44.asServiceRole.entities.MDMPolicy.filter({
            is_default: true,
            platform: { $in: [platform, 'both'] }
        });

        if (defaultPolicy.length === 0) {
            // Create default policy
            defaultPolicy = await base44.asServiceRole.entities.MDMPolicy.create({
                policy_id: `POLICY-DEFAULT-${platform.toUpperCase()}`,
                policy_name: `Default ${platform.toUpperCase()} Security`,
                description: 'Standard security policy for enrolled devices',
                platform: platform,
                policy_config: {
                    passcode: {
                        required: true,
                        min_length: 6,
                        require_alphanumeric: false,
                        allow_biometric: true,
                        max_failed_attempts: 5
                    },
                    encryption: {
                        require_device_encryption: true
                    },
                    network: {
                        require_vpn: false,
                        block_untrusted_wifi: false
                    },
                    app_restrictions: {
                        blocked_apps: [],
                        require_app_signatures: true
                    },
                    security: {
                        enable_remote_wipe: true,
                        allow_camera: true,
                        allow_screenshots: true,
                        require_screen_lock: true
                    }
                },
                compliance_rules: [],
                assigned_device_ids: [device.id],
                device_count: 1,
                is_default: true,
                is_active: true,
                created_by: 'system'
            });
        } else {
            // Update device count on existing default policy
            const policy = defaultPolicy[0];
            await base44.asServiceRole.entities.MDMPolicy.update(policy.id, {
                assigned_device_ids: [...(policy.assigned_device_ids || []), device.id],
                device_count: (policy.device_count || 0) + 1
            });
        }

        // Create audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'mobile_device_enrolled',
            severity: 'info',
            description: `Mobile device "${device_name}" enrolled successfully`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                device_id: device.id,
                device_name,
                platform,
                enrollment_method: enrollment_method || 'manual',
                risk_score: 50
            }
        });

        return Response.json({
            success: true,
            device_id: device.id,
            enrollment_token: enrollmentToken,
            device_name,
            platform,
            policy_applied: defaultPolicy[0]?.policy_name || 'Default Security',
            next_steps: platform === 'ios' ? 
                'Install the Sentinel MDM profile from Settings > General > VPN & Device Management' :
                'Install the Sentinel app and enter your enrollment token',
            instructions_url: `/mobile-enrollment?token=${enrollmentToken}&platform=${platform}`
        });

    } catch (error) {
        console.error('Mobile enrollment error:', error);
        
        // Audit failed enrollment
        try {
            const base44 = createClientFromRequest(req);
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'mobile_device_enrollment_failed',
                severity: 'error',
                description: `Mobile device enrollment failed: ${error.message}`,
                user_id: 'system',
                timestamp: new Date().toISOString(),
                success: false,
                metadata: { error: error.message }
            });
        } catch (auditError) {
            console.error('Audit log failed:', auditError);
        }

        return Response.json({
            error: 'Enrollment failed',
            message: error.message
        }, { status: 500 });
    }
});