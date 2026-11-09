import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Test Event Generator
 * Creates realistic security events for testing the Intrusion Feed
 * Admin only
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role !== 'admin') {
            return Response.json({ 
                error: 'Forbidden',
                message: 'Admin role required'
            }, { status: 403 });
        }

        const { count = 10, event_type = 'random' } = await req.json();

        const eventTemplates = [
            {
                type: 'AUTH',
                severity: 'warn',
                source: 'auth_system',
                description: 'Failed login attempt',
                ctx: { username: 'admin', ip: '192.168.1.100', reason: 'invalid_password' }
            },
            {
                type: 'NETWORK',
                severity: 'high',
                source: 'network_monitor',
                description: 'Suspicious outbound connection',
                ctx: { dest_ip: '45.33.32.156', port: 4444, protocol: 'TCP', country: 'CN' }
            },
            {
                type: 'BLE',
                severity: 'critical',
                source: 'ble_scanner',
                description: 'Tracking beacon detected',
                ctx: { mac: 'AA:BB:CC:DD:EE:FF', rssi: -45, service_uuid: 'FE2C', recurrence: 5 }
            },
            {
                type: 'PROCESS',
                severity: 'high',
                source: 'process_monitor',
                description: 'Unknown process spawned',
                ctx: { pid: 1337, name: 'suspicious.exe', parent: 'explorer.exe', hash: 'abc123...' }
            },
            {
                type: 'FIREWALL',
                severity: 'warn',
                source: 'firewall',
                description: 'Blocked connection attempt',
                ctx: { src_ip: '10.0.0.50', dest_ip: '1.2.3.4', port: 22, protocol: 'SSH' }
            },
            {
                type: 'USB',
                severity: 'critical',
                source: 'usb_sentinel',
                description: 'Unknown USB device connected',
                ctx: { vid: '0x1234', pid: '0x5678', vendor: 'Unknown', product: 'USB Device' }
            },
            {
                type: 'DNS',
                severity: 'high',
                source: 'dns_monitor',
                description: 'Query to suspicious domain',
                ctx: { query: 'malicious.example.com', response: '45.33.32.156', type: 'A' }
            },
            {
                type: 'SYSTEM',
                severity: 'critical',
                source: 'integrity_monitor',
                description: 'Critical file modified',
                ctx: { file: '/etc/shadow', expected_hash: 'abc...', actual_hash: 'def...' }
            }
        ];

        const generatedEvents = [];

        for (let i = 0; i < count; i++) {
            const template = event_type === 'random' 
                ? eventTemplates[Math.floor(Math.random() * eventTemplates.length)]
                : eventTemplates.find(t => t.type === event_type) || eventTemplates[0];

            const event = {
                id: `TEST-${Date.now()}-${i}`,
                ts: new Date(Date.now() - Math.random() * 3600000).toISOString(),
                type: template.type,
                severity: template.severity,
                source: template.source,
                ctx: { ...template.ctx, test: true, sequence: i }
            };

            // Compute hash
            const canonical = JSON.stringify({
                id: event.id,
                ts: event.ts,
                type: event.type,
                severity: event.severity,
                source: event.source,
                ctx: event.ctx
            }, Object.keys(event).sort());

            const encoder = new TextEncoder();
            const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(canonical));
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            event.hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            // Store as audit log
            await base44.entities.AuditLog.create({
                event_type: `intrusion_feed_${event.type.toLowerCase()}`,
                severity: event.severity,
                description: `[TEST] ${template.description}`,
                user_id: user.email,
                timestamp: event.ts,
                success: true,
                integrity_hash: event.hash,
                metadata: {
                    event_id: event.id,
                    event_type: event.type,
                    source: event.source,
                    ctx: event.ctx,
                    test_event: true
                }
            });

            generatedEvents.push(event);

            // Small delay to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        return Response.json({
            success: true,
            count: generatedEvents.length,
            events: generatedEvents.map(e => ({
                id: e.id,
                type: e.type,
                severity: e.severity,
                hash: e.hash
            })),
            message: `Generated ${generatedEvents.length} test events`
        });

    } catch (error) {
        console.error('[GenerateTestEvents] Error:', error);
        return Response.json({
            error: 'Failed to generate test events',
            message: error.message
        }, { status: 500 });
    }
});