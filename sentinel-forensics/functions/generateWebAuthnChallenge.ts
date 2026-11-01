import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user_email, type } = await req.json();

    if (user_email !== user.email && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate cryptographically secure challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const challengeBase64 = btoa(String.fromCharCode(...challenge));

    // Store challenge with 5 minute expiration
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await base44.asServiceRole.entities.WebAuthnChallenge.create({
      user_email,
      challenge: challengeBase64,
      type,
      expires_at: expiresAt,
      used: false
    });

    return Response.json({
      challenge: challengeBase64,
      expires_at: expiresAt
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});