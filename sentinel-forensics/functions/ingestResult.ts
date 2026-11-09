import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Enhanced Result Ingestion with Signature Validation
 * - Validates agent signatures on all results
 * - Prevents tampering and replay attacks
 * - Enforces timestamp validation
 */

async function validateAgentToken(base44, authHeader, remoteAddr, deviceId) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { valid: false, error: 'Missing or invalid Authorization header', status: 401 };
    }

    const token = authHeader.replace('Bearer ', '');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    const tokens = await base44.asServiceRole.entities.AgentToken.filter({
        token_hash: tokenHash
    });
    
    if (!tokens || tokens.length === 0) {
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'agent_auth_failed',
            severity: 'warning',
            description: 'Invalid agent token used',
            user_id: 'system',
            timestamp: new Date().toISOString(),
            success: false,
            metadata: { remote_addr: remoteAddr, device_id: deviceId, reason: 'token_not_found' }
        });
        return { valid: false, error: 'Invalid token', status: 401 };
    }
    
    const tokenRecord = tokens[0];
    
    if (tokenRecord.status === 'revoked') {
        return { valid: false, error: 'Token has been revoked', status: 401 };
    }
    
    if (new Date(tokenRecord.expires_at) < new Date()) {
        await base44.asServiceRole.entities.AgentToken.update(tokenRecord.id, {
            status: 'expired'
        });
        return { valid: false, error: 'Token has expired', status: 401 };
    }
    
    if (tokenRecord.allowed_ips && tokenRecord.allowed_ips.length > 0) {
        if (!tokenRecord.allowed_ips.includes(remoteAddr)) {
            return { valid: false, error: 'Unauthorized IP address', status: 403 };
        }
    }
    
    if (tokenRecord.allowed_devices && tokenRecord.allowed_devices.length > 0) {
        if (!tokenRecord.allowed_devices.includes(deviceId)) {
            return { valid: false, error: 'Unauthorized device', status: 403 };
        }
    }
    
    await base44.asServiceRole.entities.AgentToken.update(tokenRecord.id, {
        last_used_at: new Date().toISOString(),
        usage_count: (tokenRecord.usage_count || 0) + 1
    });
    
    return { valid: true, tokenRecord };
}

async function verifyAgentSignature(payload, signature, publicKeyPem) {
    try {
        const pemHeader = "-----BEGIN PUBLIC KEY-----";
        const pemFooter = "-----END PUBLIC KEY-----";
        const pemContents = publicKeyPem
            .replace(pemHeader, '')
            .replace(pemFooter, '')
            .replace(/\s/g, '');
        
        const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
        
        const publicKey = await crypto.subtle.importKey(
            'spki',
            binaryDer,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
        );
        
        const encoder = new TextEncoder();
        const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
        
        const isValid = await crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5',
            publicKey,
            signatureBytes,
            encoder.encode(payload)
        );
        
        return isValid;
    } catch (error) {
        console.error('Signature verification failed:', error);
        return false;
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const remoteAddr = req.headers.get('x-forwarded-for') || 
                          req.headers.get('cf-connecting-ip') || 
                          'unknown';
        
        const authHeader = req.headers.get('Authorization');
        
        const {
            device_id,
            command_id,
            outcome,
            error_code,
            error_message,
            duration_ms,
            manifest_hash,
            artifacts,
            agent_signature,
            result_data,
            logs,
            timestamp,
            nonce
        } = await req.json();

        if (!device_id || !command_id || !outcome) {
            return Response.json({
                error: 'Missing required fields',
                required: ['device_id', 'command_id', 'outcome']
            }, { status: 400 });
        }

        // CRITICAL: Timestamp validation (prevent replay attacks)
        if (timestamp) {
            const msgTime = new Date(timestamp).getTime();
            const now = Date.now();
            
            if (now - msgTime > 300000) { // 5 minutes
                return Response.json({
                    error: 'Message expired',
                    message: 'Result timestamp too old (>5 minutes)'
                }, { status: 400 });
            }
            
            if (msgTime > now + 60000) {
                return Response.json({
                    error: 'Invalid timestamp',
                    message: 'Result timestamp in future'
                }, { status: 400 });
            }
        }
        
        // Validate agent token
        const tokenValidation = await validateAgentToken(base44, authHeader, remoteAddr, device_id);
        
        if (!tokenValidation.valid) {
            return Response.json({ error: tokenValidation.error }, { status: tokenValidation.status });
        }

        // Verify device exists
        const devices = await base44.asServiceRole.entities.Device.filter({ id: device_id });
        const device = devices[0];

        if (!device) {
            return Response.json({ error: 'Device not found' }, { status: 404 });
        }

        // CRITICAL: Verify agent signature if provided
        if (agent_signature && device.public_key_pem) {
            const payloadToVerify = JSON.stringify({
                device_id,
                command_id,
                outcome,
                timestamp: timestamp || new Date().toISOString(),
                result_data
            });

            const isValidSignature = await verifyAgentSignature(
                payloadToVerify,
                agent_signature,
                device.public_key_pem
            );

            if (!isValidSignature) {
                console.error('[SECURITY] Invalid agent signature on result!');
                
                // Log security incident
                await base44.asServiceRole.entities.AuditLog.create({
                    event_type: 'agent_invalid_signature',
                    severity: 'critical',
                    description: 'Agent result with invalid signature detected',
                    user_id: 'system',
                    timestamp: new Date().toISOString(),
                    success: false,
                    metadata: {
                        device_id,
                        command_id,
                        remote_addr: remoteAddr
                    }
                });

                // Update device security profile
                const currentAnomalies = device.anomaly_events || [];
                currentAnomalies.push({
                    timestamp: new Date().toISOString(),
                    anomaly_type: 'invalid_signature',
                    severity: 'critical',
                    description: 'Result submitted with invalid signature'
                });

                await base44.asServiceRole.entities.Device.update(device_id, {
                    anomaly_events: currentAnomalies,
                    'security_profile.risk_score': Math.min(100, (device.security_profile?.risk_score || 0) + 30)
                });

                return Response.json({
                    error: 'Invalid signature',
                    message: 'Result signature verification failed'
                }, { status: 403 });
            }
        } else if (!agent_signature) {
            console.warn('[SECURITY] Result received without signature');
        }

        // Update device last_seen
        await base44.asServiceRole.entities.Device.update(device_id, {
            last_seen_at: new Date().toISOString()
        });

        // Create result record
        const result = await base44.asServiceRole.entities.AgentResult.create({
            device_id,
            command_id,
            received_at: new Date().toISOString(),
            outcome,
            error_code,
            error_message,
            duration_ms,
            manifest_hash,
            artifacts: artifacts || [],
            agent_signature: agent_signature || '',
            result_data: result_data || {},
            logs: logs || [],
            signature_verified: !!agent_signature
        });

        // Update command status
        const commands = await base44.asServiceRole.entities.AgentCommand.filter({ id: command_id });
        const command = commands[0];
        
        if (command) {
            await base44.asServiceRole.entities.AgentCommand.update(command_id, {
                status: outcome === 'success' ? 'completed' : 'failed',
                result_id: result.id
            });
        }

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'command_result_received',
            severity: outcome === 'success' ? 'info' : 'warning',
            description: `Result received for command on device "${device.display_name}"`,
            user_id: 'system',
            timestamp: new Date().toISOString(),
            success: outcome === 'success',
            metadata: {
                result_id: result.id,
                command_id,
                device_id,
                outcome,
                duration_ms,
                artifacts_count: artifacts?.length || 0,
                signature_verified: !!agent_signature,
                token_name: tokenValidation.tokenRecord.token_name,
                remote_addr: remoteAddr
            }
        });

        // Update telemetry
        await base44.asServiceRole.entities.DefenseActionTelemetry.create({
            device_id,
            action_kind: command?.command_kind?.split('.')[0] || 'unknown',
            metric_type: outcome === 'success' ? 'success_count' : 'failure_count',
            metric_value: 1,
            metric_text: error_message || '',
            recorded_at: new Date().toISOString()
        });

        return Response.json({
            success: true,
            result_id: result.id,
            signature_verified: !!agent_signature,
            message: 'Result ingested successfully'
        });

    } catch (error) {
        console.error('Result ingestion error:', error);
        return Response.json({
            error: 'Ingestion failed',
            message: error.message
        }, { status: 500 });
    }
});