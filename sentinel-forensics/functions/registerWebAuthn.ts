import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * WebAuthn Registration (Passkey Support)
 * Allows users to register biometric/hardware keys for phishing-resistant auth
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { action, credential_data } = await req.json();

        if (action === 'start_registration') {
            // Generate registration challenge
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);
            const challengeB64 = btoa(String.fromCharCode(...challenge));

            // Store challenge temporarily (expires in 5 minutes)
            const challengeRecord = await base44.entities.WebAuthnChallenge?.create({
                user_email: user.email,
                challenge: challengeB64,
                type: 'registration',
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                used: false
            });

            return Response.json({
                challenge: challengeB64,
                user: {
                    id: user.id,
                    name: user.full_name,
                    displayName: user.email
                },
                rp: {
                    name: 'Sentinel Forensics',
                    id: new URL(req.url).hostname
                },
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 },  // ES256
                    { type: 'public-key', alg: -257 } // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
                    residentKey: 'preferred'
                },
                timeout: 60000,
                attestation: 'none'
            });
        }

        if (action === 'verify_registration') {
            const { credential_id, public_key, device_name } = credential_data;

            // Verify challenge was valid
            const challenges = await base44.entities.WebAuthnChallenge?.filter({
                user_email: user.email,
                type: 'registration',
                used: false
            });

            const validChallenge = challenges?.find(c => 
                new Date(c.expires_at) > new Date()
            );

            if (!validChallenge) {
                return Response.json({ 
                    error: 'Invalid or expired challenge' 
                }, { status: 400 });
            }

            // Mark challenge as used
            await base44.entities.WebAuthnChallenge?.update(validChallenge.id, {
                used: true
            });

            // Store credential on user
            const currentUser = await base44.auth.me();
            const credentials = currentUser.webauthn_credentials || [];
            
            credentials.push({
                credential_id,
                public_key,
                counter: 0,
                device_name: device_name || 'Security Key',
                registered_at: new Date().toISOString(),
                last_used: new Date().toISOString()
            });

            await base44.auth.updateMe({
                webauthn_credentials: credentials
            });

            // Audit log
            await base44.entities.AuditLog.create({
                event_type: 'webauthn_registered',
                severity: 'info',
                description: `WebAuthn credential registered: ${device_name}`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: true,
                metadata: {
                    device_name,
                    credential_id: credential_id.substring(0, 16) + '...'
                }
            });

            return Response.json({
                success: true,
                message: 'Passkey registered successfully'
            });
        }

        return Response.json({ 
            error: 'Invalid action' 
        }, { status: 400 });

    } catch (error) {
        console.error('WebAuthn registration error:', error);
        return Response.json({ 
            error: 'Registration failed',
            message: error.message
        }, { status: 500 });
    }
});