import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { createErrorResponse } from './errorHandler.js';
import { validateRequest } from './validateInput.js';

/**
 * Generate enrollment token for new agents
 * Supports pre-enrollment token generation (before device exists)
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { device_id, platform, expires_in_hours = 24 } = await req.json();

        // NEW: Support pre-enrollment (device doesn't exist yet)
        let deviceRecord = null;
        
        if (device_id && device_id !== 'NEW_DEVICE') {
            // Existing device - validate ownership
            const devices = await base44.entities.Device.filter({ id: device_id });
            deviceRecord = devices[0];

            if (!deviceRecord) {
                return Response.json({ error: 'Device not found' }, { status: 404 });
            }

            // RLS check
            if (deviceRecord.owner_user_id !== user.email && user.role !== 'admin') {
                return Response.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        // Generate secure enrollment token
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const enrollmentToken = Array.from(tokenBytes, byte => 
            byte.toString(16).padStart(2, '0')
        ).join('');

        const expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000);

        // Store token hash for validation
        const encoder = new TextEncoder();
        const tokenData = encoder.encode(enrollmentToken);
        const hashBuffer = await crypto.subtle.digest('SHA-256', tokenData);
        const tokenHash = Array.from(new Uint8Array(hashBuffer), byte => 
            byte.toString(16).padStart(2, '0')
        ).join('');

        // Create agent token record
        await base44.asServiceRole.entities.AgentToken.create({
            token_name: deviceRecord 
                ? `${deviceRecord.display_name} Enrollment` 
                : `Pre-Enrollment ${platform || 'Device'}`,
            token_hash: tokenHash,
            token_prefix: enrollmentToken.substring(0, 8),
            created_by: user.email,
            expires_at: expiresAt.toISOString(),
            last_used_at: null,
            usage_count: 0,
            allowed_ips: [],
            allowed_devices: deviceRecord ? [device_id] : [],
            permissions: ['enroll_device', 'heartbeat', 'ingest_result'],
            status: 'active'
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            organization_id: user.organization_id,
            event_type: 'enrollment_token_generated',
            severity: 'info',
            description: deviceRecord 
                ? `Enrollment token generated for device ${deviceRecord.display_name}`
                : `Pre-enrollment token generated for ${platform || 'new device'}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            blockchain_hash: tokenHash.substring(0, 64),
            success: true,
            metadata: {
                device_id: device_id || 'pre_enrollment',
                platform: platform || 'unknown',
                expires_at: expiresAt.toISOString(),
                token_prefix: enrollmentToken.substring(0, 8)
            }
        });

        const wsUrl = Deno.env.get('WS_URL') || 'wss://sentinel-forensics.base44.app';
        const apiUrl = Deno.env.get('API_URL') || 'https://base44.app/api';

        return Response.json({
            token: enrollmentToken,
            token_prefix: enrollmentToken.substring(0, 8),
            user_email: user.email,
            expires_at: expiresAt.toISOString(),
            platform: platform || 'unknown',
            enrollment_endpoint: `${apiUrl}/apps/${Deno.env.get('BASE44_APP_ID')}/functions/enrollDevice`,
            websocket_url: device_id && device_id !== 'NEW_DEVICE'
                ? `${wsUrl}/api/agent/ws?device_id=${device_id}&token=${enrollmentToken}`
                : `${wsUrl}/api/agent/ws?token=${enrollmentToken}`,
            instructions: {
                windows: 'Run installer with --token flag',
                macos: 'Run: sudo sentinel-agent enroll --token=TOKEN',
                linux: 'Run: sudo sentinel-agent enroll --token=TOKEN',
                ios: 'Scan QR code in mobile app',
                android: 'Enter token in mobile app'
            }
        });

    } catch (error) {
        console.error('Token generation error:', error);
        return createErrorResponse(error, 'Failed to generate enrollment token');
    }
});