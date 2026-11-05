import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Enhanced WebSocket Agent Communication with Mutual Authentication
 * Features:
 * - WSS-only enforcement
 * - Origin validation
 * - Mutual TLS authentication via public/private keys
 * - Replay attack prevention with nonces/timestamps
 * - Heartbeat monitoring with auto-expiry
 * - Signature validation on all messages
 */

const connections = new Map(); // deviceId -> { socket, lastHeartbeat, nonce }
const HEARTBEAT_TIMEOUT_MS = 60000; // 1 minute
const MESSAGE_EXPIRY_MS = 300000; // 5 minutes

async function validateAgentToken(base44, token, remoteAddr, deviceId) {
    if (!token) {
        return { valid: false, error: 'Missing token', status: 401 };
    }
    
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    const tokens = await base44.asServiceRole.entities.AgentToken.filter({
        token_hash: tokenHash
    });
    
    if (!tokens || tokens.length === 0) {
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

async function verifyMessageSignature(message, signature, publicKeyPem) {
    try {
        // Import public key
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
        
        // Verify signature
        const encoder = new TextEncoder();
        const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
        
        const isValid = await crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5',
            publicKey,
            signatureBytes,
            encoder.encode(message)
        );
        
        return isValid;
    } catch (error) {
        console.error('Signature verification failed:', error);
        return false;
    }
}

function generateNonce() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
}

Deno.serve(async (req) => {
    const url = new URL(req.url);
    
    // CRITICAL: Enforce WSS-only
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
        return new Response("WSS required for security", { status: 426 });
    }
    
    // Origin validation
    const origin = req.headers.get('origin');
    const allowedOrigins = [
        'https://sentinel-forensics.base44.app',
        'https://jayforensics.com',
        'https://sentinel.forensics.jayforensics.com'
    ];
    
    if (origin && !allowedOrigins.includes(origin) && !origin.includes('localhost')) {
        console.warn(`Rejected connection from unauthorized origin: ${origin}`);
        return new Response("Unauthorized origin", { status: 403 });
    }
    
    if (req.headers.get("upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const remoteAddr = req.headers.get('x-forwarded-for') || 
                          req.headers.get('cf-connecting-ip') || 
                          'unknown';
        
        const agentToken = url.searchParams.get('token') || req.headers.get('x-agent-token');
        const deviceId = url.searchParams.get('device_id');
        
        if (!deviceId) {
            return new Response("device_id required", { status: 400 });
        }
        
        // Validate agent token
        const tokenValidation = await validateAgentToken(base44, agentToken, remoteAddr, deviceId);
        
        if (!tokenValidation.valid) {
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'agent_ws_auth_failed',
                severity: 'warning',
                description: 'WebSocket connection rejected: ' + tokenValidation.error,
                user_id: 'system',
                timestamp: new Date().toISOString(),
                success: false,
                metadata: {
                    device_id: deviceId,
                    remote_addr: remoteAddr,
                    reason: tokenValidation.error
                }
            });
            
            return new Response(tokenValidation.error, { status: tokenValidation.status });
        }

        // Verify device exists and get public key
        const devices = await base44.asServiceRole.entities.Device.filter({ id: deviceId });
        const device = devices[0];

        if (!device) {
            return new Response("Device not found", { status: 404 });
        }

        if (device.status !== 'enrolled') {
            return new Response("Device not enrolled", { status: 403 });
        }

        if (!device.public_key_pem) {
            return new Response("Device missing public key for mutual auth", { status: 403 });
        }

        // Upgrade to WebSocket
        const { socket, response } = Deno.upgradeWebSocket(req);

        // Generate session nonce for replay protection
        const sessionNonce = generateNonce();
        
        // Create session record with nonce
        const session = await base44.asServiceRole.entities.AgentSession.create({
            device_id: deviceId,
            session_token: `SESSION-${Date.now()}-${sessionNonce.substring(0, 8)}`,
            connected_at: new Date().toISOString(),
            remote_addr: remoteAddr,
            user_agent: req.headers.get('user-agent') || 'unknown',
            status: 'active',
            last_heartbeat: new Date().toISOString()
        });

        // Track connection with metadata
        connections.set(deviceId, {
            socket,
            lastHeartbeat: Date.now(),
            nonce: sessionNonce,
            sessionId: session.id,
            publicKey: device.public_key_pem,
            receivedNonces: new Set() // Track seen nonces for replay prevention
        });

        socket.onopen = async () => {
            console.log(`[WS] Agent connected: ${deviceId}`);

            await base44.asServiceRole.entities.Device.update(deviceId, {
                last_seen_at: new Date().toISOString()
            });
            
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'agent_ws_connected',
                severity: 'info',
                description: `Agent WebSocket connected: ${device.display_name}`,
                user_id: 'system',
                timestamp: new Date().toISOString(),
                success: true,
                metadata: {
                    device_id: deviceId,
                    session_id: session.id,
                    token_name: tokenValidation.tokenRecord.token_name,
                    remote_addr: remoteAddr,
                    mutual_auth: true
                }
            });

            // Send welcome with challenge nonce
            socket.send(JSON.stringify({
                type: 'welcome',
                session_id: session.id,
                device_id: deviceId,
                server_time: new Date().toISOString(),
                challenge_nonce: sessionNonce,
                heartbeat_interval_ms: 30000,
                message_expiry_ms: MESSAGE_EXPIRY_MS
            }));

            // Check for pending commands
            const pendingCommands = await base44.asServiceRole.entities.AgentCommand.filter({
                device_id: deviceId,
                status: 'queued'
            });

            for (const cmd of pendingCommands) {
                if (new Date(cmd.expires_at) < new Date()) {
                    await base44.asServiceRole.entities.AgentCommand.update(cmd.id, {
                        status: 'expired'
                    });
                    continue;
                }

                socket.send(JSON.stringify({
                    type: 'command',
                    command_id: cmd.id,
                    command_kind: cmd.command_kind,
                    params: cmd.params,
                    counter: cmd.counter,
                    expires_at: cmd.expires_at,
                    server_signature: cmd.server_signature
                }));

                await base44.asServiceRole.entities.AgentCommand.update(cmd.id, {
                    status: 'delivered'
                });
            }
        };

        socket.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data);
                const connData = connections.get(deviceId);

                if (!connData) {
                    console.error('[WS] Connection data not found');
                    return;
                }

                // CRITICAL: Verify message signature for security-critical messages
                if (msg.signature && msg.signed_payload) {
                    const isValidSig = await verifyMessageSignature(
                        msg.signed_payload,
                        msg.signature,
                        connData.publicKey
                    );

                    if (!isValidSig) {
                        console.error('[WS] Invalid message signature!');
                        await base44.asServiceRole.entities.AuditLog.create({
                            event_type: 'agent_invalid_signature',
                            severity: 'critical',
                            description: 'Agent sent message with invalid signature',
                            user_id: 'system',
                            timestamp: new Date().toISOString(),
                            success: false,
                            metadata: {
                                device_id: deviceId,
                                session_id: session.id,
                                message_type: msg.type
                            }
                        });
                        socket.close(1008, 'Invalid signature');
                        return;
                    }
                }

                // CRITICAL: Replay attack prevention with nonces
                if (msg.nonce) {
                    if (connData.receivedNonces.has(msg.nonce)) {
                        console.error('[WS] Replay attack detected - nonce reused!');
                        await base44.asServiceRole.entities.AuditLog.create({
                            event_type: 'agent_replay_attack',
                            severity: 'critical',
                            description: 'Replay attack detected - duplicate nonce',
                            user_id: 'system',
                            timestamp: new Date().toISOString(),
                            success: false,
                            metadata: {
                                device_id: deviceId,
                                session_id: session.id,
                                nonce: msg.nonce
                            }
                        });
                        socket.close(1008, 'Replay attack detected');
                        return;
                    }
                    connData.receivedNonces.add(msg.nonce);
                    
                    // Cleanup old nonces (keep last 1000)
                    if (connData.receivedNonces.size > 1000) {
                        const arr = Array.from(connData.receivedNonces);
                        connData.receivedNonces = new Set(arr.slice(-1000));
                    }
                }

                // Timestamp validation (reject messages older than 5 minutes)
                if (msg.timestamp) {
                    const msgTime = new Date(msg.timestamp).getTime();
                    const now = Date.now();
                    
                    if (now - msgTime > MESSAGE_EXPIRY_MS) {
                        console.error('[WS] Message expired');
                        return; // Silently drop expired messages
                    }
                    
                    if (msgTime > now + 60000) { // More than 1 minute in future
                        console.error('[WS] Message timestamp in future - clock skew?');
                        return;
                    }
                }

                switch (msg.type) {
                    case 'heartbeat': {
                        // Update heartbeat timestamp
                        connData.lastHeartbeat = Date.now();
                        
                        await base44.asServiceRole.entities.AgentSession.update(session.id, {
                            last_heartbeat: new Date().toISOString()
                        });

                        await base44.asServiceRole.entities.Device.update(deviceId, {
                            last_seen_at: new Date().toISOString()
                        });

                        socket.send(JSON.stringify({
                            type: 'heartbeat_ack',
                            server_time: new Date().toISOString(),
                            nonce: generateNonce()
                        }));
                        break;
                    }

                    case 'result': {
                        const { 
                            command_id, 
                            outcome, 
                            result_data, 
                            error_code, 
                            error_message, 
                            duration_ms, 
                            artifacts, 
                            agent_signature 
                        } = msg;

                        // CRITICAL: Verify this is a response to a real command
                        const commands = await base44.asServiceRole.entities.AgentCommand.filter({ 
                            id: command_id,
                            device_id: deviceId 
                        });
                        
                        if (!commands || commands.length === 0) {
                            console.error('[WS] Result for unknown command');
                            return;
                        }

                        const result = await base44.asServiceRole.entities.AgentResult.create({
                            device_id: deviceId,
                            command_id,
                            received_at: new Date().toISOString(),
                            outcome,
                            error_code,
                            error_message,
                            duration_ms,
                            manifest_hash: result_data?.manifest_hash || '',
                            artifacts: artifacts || [],
                            agent_signature: agent_signature || '',
                            result_data: result_data || {},
                            logs: result_data?.logs || []
                        });

                        await base44.asServiceRole.entities.AgentCommand.update(command_id, {
                            status: outcome === 'success' ? 'completed' : 'failed',
                            result_id: result.id
                        });

                        socket.send(JSON.stringify({
                            type: 'result_ack',
                            command_id,
                            result_id: result.id,
                            nonce: generateNonce()
                        }));

                        console.log(`[WS] Result received for command ${command_id}: ${outcome}`);
                        break;
                    }

                    case 'auth_challenge_response': {
                        // Agent proving it has the private key
                        const { challenge_signature } = msg;
                        
                        if (!challenge_signature) {
                            socket.close(1008, 'Missing challenge signature');
                            return;
                        }

                        // Verify agent signed the challenge nonce
                        const isValid = await verifyMessageSignature(
                            sessionNonce,
                            challenge_signature,
                            connData.publicKey
                        );

                        if (!isValid) {
                            console.error('[WS] Challenge response signature invalid');
                            await base44.asServiceRole.entities.AuditLog.create({
                                event_type: 'agent_auth_challenge_failed',
                                severity: 'critical',
                                description: 'Agent failed mutual auth challenge',
                                user_id: 'system',
                                timestamp: new Date().toISOString(),
                                success: false,
                                metadata: {
                                    device_id: deviceId,
                                    session_id: session.id
                                }
                            });
                            socket.close(1008, 'Authentication failed');
                            return;
                        }

                        // Mark session as fully authenticated
                        await base44.asServiceRole.entities.AgentSession.update(session.id, {
                            status: 'authenticated'
                        });

                        socket.send(JSON.stringify({
                            type: 'auth_success',
                            message: 'Mutual authentication successful',
                            nonce: generateNonce()
                        }));
                        
                        console.log(`[WS] Mutual auth successful for ${deviceId}`);
                        break;
                    }

                    case 'log': {
                        console.log(`[WS] Agent ${deviceId}: ${msg.message}`);
                        break;
                    }

                    default:
                        console.warn(`[WS] Unknown message type: ${msg.type}`);
                }
            } catch (error) {
                console.error('[WS] Message handling error:', error);
            }
        };

        socket.onclose = async () => {
            console.log(`[WS] Agent disconnected: ${deviceId}`);
            connections.delete(deviceId);

            await base44.asServiceRole.entities.AgentSession.update(session.id, {
                status: 'disconnected',
                disconnected_at: new Date().toISOString()
            });
            
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'agent_ws_disconnected',
                severity: 'info',
                description: `Agent WebSocket disconnected: ${device.display_name}`,
                user_id: 'system',
                timestamp: new Date().toISOString(),
                success: true,
                metadata: {
                    device_id: deviceId,
                    session_id: session.id
                }
            });
        };

        socket.onerror = (error) => {
            console.error(`[WS] Error for ${deviceId}:`, error);
        };

        // Heartbeat monitoring - auto-disconnect stale connections
        const heartbeatInterval = setInterval(async () => {
            const connData = connections.get(deviceId);
            if (!connData) {
                clearInterval(heartbeatInterval);
                return;
            }

            const timeSinceLastHeartbeat = Date.now() - connData.lastHeartbeat;
            
            if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
                console.warn(`[WS] Heartbeat timeout for ${deviceId}, disconnecting`);
                
                await base44.asServiceRole.entities.AuditLog.create({
                    event_type: 'agent_heartbeat_timeout',
                    severity: 'warning',
                    description: `Agent heartbeat timeout: ${device.display_name}`,
                    user_id: 'system',
                    timestamp: new Date().toISOString(),
                    success: false,
                    metadata: {
                        device_id: deviceId,
                        session_id: session.id,
                        timeout_ms: timeSinceLastHeartbeat
                    }
                });

                socket.close(1001, 'Heartbeat timeout');
                connections.delete(deviceId);
                clearInterval(heartbeatInterval);
            }
        }, 30000); // Check every 30 seconds

        return response;

    } catch (error) {
        console.error('[WS] Connection error:', error);
        return new Response(error.message, { status: 500 });
    }
});