import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Device Enrollment Endpoint
 * 
 * UPDATED: Validates enrollment token, creates device record
 * Supports all platforms: Windows, macOS, Linux, iOS, Android
 */

async function validatePublicKey(publicKeyPem, algorithm) {
    try {
        const pemHeader = "-----BEGIN PUBLIC KEY-----";
        const pemFooter = "-----END PUBLIC KEY-----";
        
        if (!publicKeyPem.includes(pemHeader) || !publicKeyPem.includes(pemFooter)) {
            return { valid: false, error: 'Invalid PEM format' };
        }

        const pemContents = publicKeyPem
            .replace(pemHeader, '')
            .replace(pemFooter, '')
            .replace(/\s/g, '');
        
        const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
        
        let cryptoAlg;
        if (algorithm === 'RSA-2048' || algorithm === 'RSA-4096') {
            cryptoAlg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
        } else if (algorithm === 'Ed25519') {
            cryptoAlg = { name: 'Ed25519' };
        } else {
            return { valid: false, error: 'Unsupported algorithm' };
        }
        
        await crypto.subtle.importKey('spki', binaryDer, cryptoAlg, false, ['verify']);
        
        return { valid: true };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get enrollment token from header
        const enrollmentToken = req.headers.get('X-Enrollment-Token') || 
                               req.headers.get('Authorization')?.replace('Bearer ', '');

        if (!enrollmentToken) {
            return Response.json({ 
                error: 'Enrollment token required',
                header: 'X-Enrollment-Token or Authorization: Bearer <token>'
            }, { status: 401 });
        }

        // Validate token
        const encoder = new TextEncoder();
        const tokenData = encoder.encode(enrollmentToken);
        const hashBuffer = await crypto.subtle.digest('SHA-256', tokenData);
        const tokenHash = Array.from(new Uint8Array(hashBuffer), byte => 
            byte.toString(16).padStart(2, '0')
        ).join('');

        const agentTokens = await base44.asServiceRole.entities.AgentToken.filter({
            token_hash: tokenHash,
            status: 'active'
        });

        if (agentTokens.length === 0) {
            return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
        }

        const agentToken = agentTokens[0];

        // Check expiration
        if (new Date(agentToken.expires_at) < new Date()) {
            await base44.asServiceRole.entities.AgentToken.update(agentToken.id, {
                status: 'expired'
            });
            return Response.json({ error: 'Token expired' }, { status: 401 });
        }

        const {
            display_name,
            platform,
            public_key_pem,
            key_algorithm,
            device_info,
            capabilities
        } = await req.json();

        if (!display_name || !platform || !public_key_pem) {
            return Response.json({
                error: 'Missing required fields',
                required: ['display_name', 'platform', 'public_key_pem']
            }, { status: 400 });
        }

        const validPlatforms = ['windows', 'macos', 'linux', 'ios', 'android'];
        if (!validPlatforms.includes(platform)) {
            return Response.json({
                error: 'Invalid platform',
                valid_platforms: validPlatforms
            }, { status: 400 });
        }

        // Validate public key
        const algo = key_algorithm || 'RSA-4096';
        const keyValidation = await validatePublicKey(public_key_pem, algo);
        
        if (!keyValidation.valid) {
            return Response.json({
                error: 'Invalid public key',
                details: keyValidation.error
            }, { status: 400 });
        }

        // Get user from token
        const userEmail = agentToken.created_by;

        // Create device record
        const device = await base44.asServiceRole.entities.Device.create({
            display_name,
            platform,
            owner_user_id: userEmail,
            public_key_pem,
            key_algorithm: algo,
            enrolled_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            status: 'enrolled',
            device_info: device_info || {},
            capabilities: capabilities || ['heartbeat', 'forensic_snapshot'],
            case_ids: [],
            security_profile: {
                risk_score: 0,
                last_integrity_check: new Date().toISOString(),
                integrity_status: 'verified',
                certificate_pinning_enabled: true,
                allowed_command_whitelist: []
            },
            connection_history: [],
            anomaly_events: []
        });

        // Update token usage
        await base44.asServiceRole.entities.AgentToken.update(agentToken.id, {
            last_used_at: new Date().toISOString(),
            usage_count: (agentToken.usage_count || 0) + 1,
            allowed_devices: [...(agentToken.allowed_devices || []), device.id]
        });

        // Audit log with proper organization isolation
        const enrollingUser = await base44.asServiceRole.entities.User.filter({ email: userEmail });
        const orgId = enrollingUser[0]?.organization_id;
        
        await base44.asServiceRole.entities.AuditLog.create({
            organization_id: orgId,
            event_type: 'device_enrolled',
            severity: 'info',
            description: `Device "${display_name}" (${platform}) enrolled successfully`,
            user_id: userEmail,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                device_id: device.id,
                platform,
                key_algorithm: algo,
                capabilities,
                token_prefix: enrollmentToken.substring(0, 8)
            }
        }).catch((err) => console.warn('Audit log failed:', err));

        const wsUrl = Deno.env.get('WS_URL') || 'wss://sentinel-forensics.base44.app';

        return Response.json({
            success: true,
            device_id: device.id,
            enrolled_at: device.enrolled_at,
            message: 'Device enrolled successfully',
            websocket_url: `${wsUrl}/api/agent/ws?device_id=${device.id}&token=${enrollmentToken}`,
            next_steps: [
                'Connect to WebSocket URL for command & control',
                'Send heartbeat every 60 seconds',
                'Listen for commands and respond with signed results'
            ]
        });

    } catch (error) {
        console.error('Device enrollment error:', error);
        return Response.json({
            error: 'Enrollment failed',
            message: error.message
        }, { status: 500 });
    }
});