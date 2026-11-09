import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * SEED MOCK THREAT INTELLIGENCE DATA
 * 
 * Creates sample IOCs, threat actors, and SIEM logs for testing
 * This provides meaningful visualizations in fresh environments
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const results = {
            iocs_created: 0,
            threat_actors_created: 0,
            siem_logs_created: 0,
            devices_enriched: 0
        };

        // Create mock threat actors
        const aptGroups = [
            {
                group_name: 'APT28 (Fancy Bear)',
                aliases: ['Sofacy', 'Sednit', 'STRONTIUM'],
                origin_country: 'Russia',
                motivation: 'cyber_espionage',
                target_sectors: ['government', 'military', 'media'],
                threat_level: 'critical',
                activity_status: 'active',
                ttps: {
                    initial_access: ['Spear Phishing', 'Credential Stuffing'],
                    execution: ['PowerShell', 'Command-Line Interface'],
                    persistence: ['Registry Run Keys', 'Scheduled Tasks']
                }
            },
            {
                group_name: 'Lazarus Group',
                aliases: ['HIDDEN COBRA', 'Guardians of Peace'],
                origin_country: 'North Korea',
                motivation: 'financial_gain',
                target_sectors: ['finance', 'cryptocurrency', 'entertainment'],
                threat_level: 'critical',
                activity_status: 'active',
                ttps: {
                    initial_access: ['Supply Chain Compromise', 'Phishing'],
                    execution: ['Malicious File', 'Scripting'],
                    exfiltration: ['Exfiltration Over C2 Channel']
                }
            },
            {
                group_name: 'APT29 (Cozy Bear)',
                aliases: ['The Dukes', 'YTTRIUM', 'NOBELIUM'],
                origin_country: 'Russia',
                motivation: 'cyber_espionage',
                target_sectors: ['government', 'think_tanks', 'healthcare'],
                threat_level: 'critical',
                activity_status: 'active',
                ttps: {
                    initial_access: ['Spear Phishing', 'Exploit Public-Facing Application'],
                    defense_evasion: ['Obfuscated Files', 'Rootkit'],
                    command_and_control: ['Web Service', 'Encrypted Channel']
                }
            }
        ];

        for (const apt of aptGroups) {
            try {
                await base44.asServiceRole.entities.APTGroup.create({
                    ...apt,
                    linked_iocs: [],
                    confidence_score: 85,
                    last_updated: new Date().toISOString()
                });
                results.threat_actors_created++;
            } catch (error) {
                console.warn('APT creation skipped:', error.message);
            }
        }

        // Create mock IOCs
        const mockIOCs = [
            { type: 'ip', value: '185.220.101.45', actor: 'APT28 (Fancy Bear)', score: 95, tags: ['c2', 'MITRE:Command-and-Control'] },
            { type: 'ip', value: '23.106.215.76', actor: 'Lazarus Group', score: 92, tags: ['malware', 'MITRE:Execution'] },
            { type: 'domain', value: 'malicious-c2.ru', actor: 'APT29 (Cozy Bear)', score: 98, tags: ['c2', 'MITRE:Command-and-Control'] },
            { type: 'domain', value: 'fake-update.com', actor: 'APT28 (Fancy Bear)', score: 88, tags: ['phishing', 'MITRE:Initial-Access'] },
            { type: 'sha256', value: '3395856ce81f2b7382dee72602f798b642f14140', actor: 'Lazarus Group', score: 96, tags: ['malware', 'trojan'] },
            { type: 'ip', value: '104.192.3.12', actor: 'APT29 (Cozy Bear)', score: 85, tags: ['scanning', 'reconnaissance'] }
        ];

        for (const ioc of mockIOCs) {
            try {
                const indicator = await base44.asServiceRole.entities.IOCIndicator.create({
                    indicator_id: `IOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    indicator_type: ioc.type,
                    value: ioc.value,
                    confidence: 0.9,
                    extraction_method: 'threat_feed',
                    reputation_score: ioc.score,
                    threat_classification: 'malicious',
                    tags: ioc.tags,
                    enrichment_status: 'completed',
                    status: 'malicious',
                    first_seen: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
                    last_seen: new Date().toISOString(),
                    recurrence_count: Math.floor(Math.random() * 10) + 1
                });

                // Link to threat actor
                const actors = await base44.asServiceRole.entities.APTGroup.filter({
                    group_name: ioc.actor
                });

                if (actors.length > 0) {
                    const actor = actors[0];
                    await base44.asServiceRole.entities.APTGroup.update(actor.id, {
                        linked_iocs: [...(actor.linked_iocs || []), indicator.indicator_id]
                    });
                }

                results.iocs_created++;
            } catch (error) {
                console.warn('IOC creation skipped:', error.message);
            }
        }

        // Create mock SIEM logs
        const eventTypes = [
            'failed_authentication', 'successful_authentication', 'network_connection',
            'malware_detected', 'privilege_escalation', 'lateral_movement',
            'data_exfiltration', 'suspicious_process'
        ];

        const severities = ['debug', 'info', 'warning', 'error', 'critical'];

        for (let i = 0; i < 50; i++) {
            const randomIP = mockIOCs[Math.floor(Math.random() * mockIOCs.length)].value;
            const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            const severity = severities[Math.floor(Math.random() * severities.length)];

            try {
                await base44.asServiceRole.entities.SIEMLog.create({
                    log_id: `LOG-${Date.now()}-${i}`,
                    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
                    ingested_at: new Date().toISOString(),
                    source_type: 'endpoint_agent',
                    source_id: `AGENT-${Math.floor(Math.random() * 10)}`,
                    source_name: `Device-${Math.floor(Math.random() * 10)}`,
                    event_type: eventType,
                    severity,
                    message: `${eventType.replace(/_/g, ' ')} detected from ${randomIP}`,
                    raw_log: `[${new Date().toISOString()}] ${eventType}: ${randomIP}`,
                    normalized_fields: {
                        source_ip: randomIP,
                        destination_ip: `10.0.0.${Math.floor(Math.random() * 255)}`,
                        protocol: ['TCP', 'UDP', 'HTTP', 'HTTPS'][Math.floor(Math.random() * 4)]
                    },
                    tags: [
                        eventType.includes('auth') ? 'authentication' : '',
                        eventType.includes('malware') ? 'MITRE:Execution' : '',
                        eventType.includes('lateral') ? 'MITRE:Lateral-Movement' : ''
                    ].filter(Boolean),
                    indexed: true
                });
                results.siem_logs_created++;
            } catch (error) {
                console.warn('SIEM log creation skipped:', error.message);
            }
        }

        return Response.json({
            success: true,
            message: 'Mock threat data seeded successfully',
            results
        });

    } catch (error) {
        console.error('Seed data error:', error);
        return Response.json({
            error: 'Seeding failed',
            message: error.message
        }, { status: 500 });
    }
});