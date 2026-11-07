/**
 * Agent Event Ingestion Endpoint
 * Validates and persists telemetry events from Sentinel agents
 * 
 * Security: Signature validation, replay protection, org scoping
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sanitizeError } from './helpers/security.js';

const SIGNATURE_SECRET = Deno.env.get('AGENT_SECRET_TOKEN');
const MAX_EVENT_AGE_MINUTES = 10;
const NONCE_CACHE = new Map<string, number>();

// Clean old nonces every 15 minutes
setInterval(() => {
  const cutoff = Date.now() - (MAX_EVENT_AGE_MINUTES * 60 * 1000);
  for (const [nonce, timestamp] of NONCE_CACHE.entries()) {
    if (timestamp < cutoff) NONCE_CACHE.delete(nonce);
  }
}, 15 * 60 * 1000);

async function validateSignature(payload: string, signature: string): Promise<boolean> {
  if (!SIGNATURE_SECRET) {
    console.error('[AGENT-INGEST] AGENT_SECRET_TOKEN not configured');
    return false;
  }
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SIGNATURE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  
  const signatureBuffer = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  const dataBuffer = encoder.encode(payload);
  
  return await crypto.subtle.verify('HMAC', key, signatureBuffer, dataBuffer);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse request
    const body = await req.json();
    const { 
      device_id,
      organization_id,
      event_type,
      event_time,
      payload,
      nonce,
      signature,
      agent_version
    } = body;
    
    // Validate required fields
    if (!device_id || !organization_id || !event_type || !event_time || !payload || !nonce) {
      return Response.json({
        error: 'Missing required fields',
        required: ['device_id', 'organization_id', 'event_type', 'event_time', 'payload', 'nonce']
      }, { status: 400 });
    }
    
    // Validate signature
    const payloadString = JSON.stringify({ device_id, organization_id, event_type, event_time, payload, nonce });
    const signatureValid = signature ? await validateSignature(payloadString, signature) : false;
    
    if (signature && !signatureValid) {
      console.warn('[AGENT-INGEST] Invalid signature from device:', device_id);
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    // Check event timestamp (prevent replay of old events)
    const eventTimestamp = new Date(event_time).getTime();
    const now = Date.now();
    const ageMinutes = (now - eventTimestamp) / (60 * 1000);
    
    if (ageMinutes > MAX_EVENT_AGE_MINUTES || ageMinutes < -5) {
      return Response.json({
        error: 'Event timestamp out of acceptable window',
        max_age_minutes: MAX_EVENT_AGE_MINUTES
      }, { status: 400 });
    }
    
    // Check nonce for replay protection
    if (NONCE_CACHE.has(nonce)) {
      console.warn('[AGENT-INGEST] Replay attempt detected:', { device_id, nonce });
      return Response.json({ error: 'Nonce already used (replay detected)' }, { status: 400 });
    }
    NONCE_CACHE.set(nonce, now);
    
    // Verify device exists and belongs to org
    const devices = await base44.asServiceRole.entities.Device.filter({
      organization_id,
      id: device_id
    });
    
    if (devices.length === 0) {
      return Response.json({
        error: 'Device not found or does not belong to organization',
        device_id,
        organization_id
      }, { status: 403 });
    }
    
    // Create agent event
    const event = await base44.asServiceRole.entities.AgentEvent.create({
      organization_id,
      device_id,
      event_type,
      event_time,
      payload_json: payload,
      signature_valid: signatureValid,
      ingest_time: new Date().toISOString(),
      source_ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      agent_version: agent_version || 'unknown',
      nonce
    });
    
    // Update device last_seen
    await base44.asServiceRole.entities.Device.update(device_id, {
      last_seen: new Date().toISOString()
    });
    
    // Audit log
    await base44.asServiceRole.entities.SecurityAuditLog.create({
      organization_id,
      event_type: 'agent_telemetry_received',
      severity: 'info',
      description: `Agent event ingested: ${event_type}`,
      actor_email: 'system',
      success: true,
      metadata: {
        device_id,
        event_type,
        agent_version,
        signature_valid: signatureValid
      },
      timestamp_utc: new Date().toISOString()
    });
    
    return Response.json({
      success: true,
      event_id: event.id,
      ingested_at: event.ingest_time
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[AGENT-INGEST] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});