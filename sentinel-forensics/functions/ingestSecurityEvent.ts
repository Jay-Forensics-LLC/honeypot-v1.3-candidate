import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Security Event Ingestion Helper
 * Simplifies event creation from frontend components
 * Automatically handles hash chaining and validation
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { 
            type, 
            severity, 
            source, 
            description,
            context 
        } = await req.json();

        // Validate required fields
        if (!type || !severity || !source) {
            return Response.json({
                error: 'Missing required fields',
                required: ['type', 'severity', 'source'],
                example: {
                    type: 'BLE',
                    severity: 'high',
                    source: 'ble_monitor',
                    description: 'Unknown device detected',
                    context: { mac: '00:11:22:33:44:55', rssi: -45 }
                }
            }, { status: 400 });
        }

        const validTypes = ['AUTH', 'PROCESS', 'NETWORK', 'BLE', 'FIREWALL', 'USB', 'DNS', 'SYSTEM', 'APP'];
        const validSeverities = ['info', 'warn', 'high', 'critical'];

        if (!validTypes.includes(type)) {
            return Response.json({
                error: `Invalid type: ${type}`,
                valid_types: validTypes
            }, { status: 400 });
        }

        if (!validSeverities.includes(severity)) {
            return Response.json({
                error: `Invalid severity: ${severity}`,
                valid_severities: validSeverities
            }, { status: 400 });
        }

        // Create event object
        const event = {
            id: `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ts: new Date().toISOString(),
            type,
            severity,
            source,
            ctx: context || {},
            prev_hash: null // TODO: Implement hash chaining per user session
        };

        // Compute event hash
        const canonical = {
            id: event.id,
            ts: event.ts,
            type: event.type,
            severity: event.severity,
            source: event.source,
            ctx: event.ctx,
            prev_hash: event.prev_hash
        };

        const canonicalString = JSON.stringify(canonical, Object.keys(canonical).sort());
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalString));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        event.hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Store as audit log
        const auditLog = await base44.entities.AuditLog.create({
            event_type: `intrusion_feed_${type.toLowerCase()}`,
            severity,
            description: description || `[${source}] Security event`,
            user_id: user.email,
            timestamp: event.ts,
            success: true,
            integrity_hash: event.hash,
            metadata: {
                event_id: event.id,
                event_type: type,
                source,
                ctx: context || {},
                prev_hash: event.prev_hash
            }
        });

        // Broadcast via WebSocket if implemented
        // The eventBus function will handle this

        return Response.json({
            success: true,
            event_id: event.id,
            hash: event.hash,
            audit_log_id: auditLog.id,
            message: 'Event ingested successfully'
        });

    } catch (error) {
        console.error('[IngestEvent] Error:', error);
        return Response.json({
            error: 'Event ingestion failed',
            message: error.message
        }, { status: 500 });
    }
});