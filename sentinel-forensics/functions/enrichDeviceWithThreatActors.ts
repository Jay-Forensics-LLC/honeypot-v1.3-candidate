import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * DEVICE THREAT ACTOR ENRICHMENT
 * 
 * Enriches device records with associated threat actors
 * when they connect to known malicious infrastructure
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { device_id, malicious_connection } = await req.json();

        if (!device_id) {
            return Response.json({ error: 'device_id required' }, { status: 400 });
        }

        const devices = await base44.asServiceRole.entities.Device.filter({ id: device_id });
        
        if (devices.length === 0) {
            return Response.json({ error: 'Device not found' }, { status: 404 });
        }

        const device = devices[0];

        const iocs = await base44.asServiceRole.entities.IOCIndicator.filter({
            value: malicious_connection?.ip || malicious_connection?.domain
        });

        if (iocs.length === 0) {
            return Response.json({
                success: false,
                message: 'No IOC found for connection'
            });
        }

        const ioc = iocs[0];
        const associatedActors = new Set(device.security_profile?.associated_threat_actors || []);

        const linkedActors = await base44.asServiceRole.entities.APTGroup.filter({
            linked_iocs: { $contains: ioc.indicator_id }
        });

        let enrichmentApplied = false;

        for (const actor of linkedActors) {
            associatedActors.add(actor.group_name);
            enrichmentApplied = true;

            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'device_threat_actor_association',
                severity: 'warning',
                description: `Device ${device.display_name} associated with threat actor ${actor.group_name}`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: true,
                metadata: {
                    device_id: device.id,
                    threat_actor: actor.group_name,
                    ioc_value: ioc.value,
                    connection_type: malicious_connection?.type || 'network'
                }
            });
        }

        await base44.asServiceRole.entities.Device.update(device.id, {
            security_profile: {
                ...device.security_profile,
                associated_threat_actors: Array.from(associatedActors),
                has_known_malicious_connections: true,
                last_malicious_connection_at: new Date().toISOString(),
                risk_score: Math.min(100, (device.security_profile?.risk_score || 0) + 20)
            },
            anomaly_events: [
                ...(device.anomaly_events || []),
                {
                    timestamp: new Date().toISOString(),
                    anomaly_type: 'malicious_connection',
                    severity: 'high',
                    description: `Connected to IOC: ${ioc.value} (linked to ${linkedActors.length} threat actor(s))`
                }
            ]
        });

        const actorProfiles = [];
        
        for (const actor of linkedActors) {
            actorProfiles.push({
                name: actor.group_name,
                aliases: actor.aliases || [],
                motivation: actor.motivation,
                target_sectors: actor.target_sectors || [],
                ttps: actor.ttps || {},
                confidence_score: actor.confidence_score || 50,
                threat_level: actor.threat_level
            });
        }

        return Response.json({
            success: true,
            enrichment_applied: enrichmentApplied,
            device_id: device.id,
            associated_threat_actors: Array.from(associatedActors),
            threat_actor_profiles: actorProfiles,
            risk_score: device.security_profile?.risk_score || 0,
            recommendations: [
                'Isolate device from network',
                'Collect forensic evidence',
                'Review all device activity logs',
                'Check for lateral movement indicators',
                'Scan for persistence mechanisms'
            ]
        });

    } catch (error) {
        console.error('Device enrichment error:', error);
        return Response.json({
            error: 'Enrichment failed',
            message: error.message
        }, { status: 500 });
    }
});