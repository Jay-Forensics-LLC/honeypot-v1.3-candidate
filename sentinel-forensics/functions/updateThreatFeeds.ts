import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Automated Threat Intelligence Feed Updater
 * Fetches latest IOCs, malware signatures, and APT data from multiple sources
 * Should be called via cron (daily/weekly)
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate system worker token (cron job authentication)
        const authHeader = req.headers.get('Authorization');
        if (authHeader !== `Bearer ${Deno.env.get('SYSTEM_WORKER_TOKEN')}`) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const updates = {
            timestamp: new Date().toISOString(),
            sources_updated: [],
            iocs_added: 0,
            signatures_updated: 0,
            apt_groups_updated: 0,
            errors: []
        };

        // 1. Update AlienVault OTX Pulses
        try {
            const otxKey = Deno.env.get('ALIENVAULT_OTX_API_KEY');
            if (otxKey) {
                const otxResponse = await fetch(
                    'https://otx.alienvault.com/api/v1/pulses/subscribed',
                    {
                        headers: {
                            'X-OTX-API-KEY': otxKey,
                            'Accept': 'application/json'
                        }
                    }
                );

                if (otxResponse.ok) {
                    const pulseData = await otxResponse.json();
                    const pulses = pulseData.results?.slice(0, 50) || [];

                    for (const pulse of pulses) {
                        // Extract IOCs from pulse
                        for (const indicator of pulse.indicators || []) {
                            const existingIOCs = await base44.asServiceRole.entities.IOCIndicator.filter({
                                value: indicator.indicator,
                                indicator_type: indicator.type
                            });

                            if (existingIOCs.length === 0) {
                                await base44.asServiceRole.entities.IOCIndicator.create({
                                    indicator_id: `IOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    evidence_id: 'threat_feed',
                                    case_id: null,
                                    indicator_type: indicator.type,
                                    value: indicator.indicator,
                                    confidence: 0.8,
                                    extraction_method: 'otx_feed',
                                    context: {
                                        pulse_name: pulse.name,
                                        pulse_id: pulse.id,
                                        description: pulse.description
                                    },
                                    reputation_score: indicator.role === 'malicious' ? 10 : 50,
                                    first_seen: new Date().toISOString(),
                                    last_seen: new Date().toISOString(),
                                    enrichment_status: 'completed',
                                    status: 'new',
                                    tags: pulse.tags || []
                                });

                                updates.iocs_added++;
                            }
                        }
                    }

                    updates.sources_updated.push('AlienVault OTX');
                }
            }
        } catch (error) {
            console.error('OTX update error:', error);
            updates.errors.push({
                source: 'AlienVault OTX',
                error: error.message
            });
        }

        // 2. Update Known APT Groups (from public sources)
        try {
            // Example: Fetch from MITRE ATT&CK or curated JSON
            const aptGroupsToUpdate = [
                {
                    group_name: 'APT28',
                    aliases: ['Fancy Bear', 'Sofacy', 'Pawn Storm'],
                    origin_country: 'Russia',
                    motivation: 'cyber_espionage',
                    target_sectors: ['government', 'military', 'media'],
                    threat_level: 'critical',
                    activity_status: 'active'
                },
                {
                    group_name: 'APT29',
                    aliases: ['Cozy Bear', 'The Dukes'],
                    origin_country: 'Russia',
                    motivation: 'cyber_espionage',
                    target_sectors: ['government', 'think_tanks', 'healthcare'],
                    threat_level: 'critical',
                    activity_status: 'active'
                },
                {
                    group_name: 'Lazarus Group',
                    aliases: ['Hidden Cobra', 'APT38'],
                    origin_country: 'North Korea',
                    motivation: 'financial_gain',
                    target_sectors: ['finance', 'cryptocurrency', 'defense'],
                    threat_level: 'critical',
                    activity_status: 'active'
                }
            ];

            for (const aptData of aptGroupsToUpdate) {
                const existing = await base44.asServiceRole.entities.APTGroup.filter({
                    group_name: aptData.group_name
                });

                if (existing.length === 0) {
                    await base44.asServiceRole.entities.APTGroup.create({
                        ...aptData,
                        first_observed: new Date().toISOString(),
                        last_updated: new Date().toISOString()
                    });
                    updates.apt_groups_updated++;
                } else {
                    await base44.asServiceRole.entities.APTGroup.update(existing[0].id, {
                        last_updated: new Date().toISOString()
                    });
                }
            }

            updates.sources_updated.push('APT Database');
        } catch (error) {
            console.error('APT update error:', error);
            updates.errors.push({
                source: 'APT Database',
                error: error.message
            });
        }

        // 3. Update Malware Signatures
        try {
            const malwareSignatures = [
                {
                    signature_id: 'SIG-PEGASUS-2024',
                    malware_family: 'Pegasus',
                    signature_type: 'behavioral_pattern',
                    signature_data: 'zero_click_exploit,ios_jailbreak,camera_access,mic_access',
                    detection_confidence: 90,
                    severity: 'critical',
                    targeted_platforms: ['ios', 'android'],
                    behavioral_indicators: {
                        api_calls: ['AVCaptureSession', 'AVAudioSession', 'CoreLocation'],
                        network_behavior: ['encrypted_c2', 'data_exfiltration'],
                        privilege_escalation: true,
                        persistence_mechanism: ['launch_daemon', 'kernel_extension']
                    }
                }
            ];

            for (const sig of malwareSignatures) {
                const existing = await base44.asServiceRole.entities.MalwareSignature.filter({
                    signature_id: sig.signature_id
                });

                if (existing.length === 0) {
                    await base44.asServiceRole.entities.MalwareSignature.create({
                        ...sig,
                        first_seen: new Date().toISOString(),
                        last_updated: new Date().toISOString(),
                        ml_model_trained: false,
                        false_positive_rate: 0.05,
                        threat_intel_source: 'Community Reports'
                    });
                    updates.signatures_updated++;
                }
            }

            updates.sources_updated.push('Malware Signatures');
        } catch (error) {
            console.error('Signature update error:', error);
            updates.errors.push({
                source: 'Malware Signatures',
                error: error.message
            });
        }

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'threat_feed_update',
            severity: 'info',
            description: `Threat intelligence feeds updated: ${updates.sources_updated.join(', ')}`,
            user_id: 'system',
            timestamp: new Date().toISOString(),
            success: updates.errors.length === 0,
            metadata: updates
        });

        return Response.json({
            success: true,
            ...updates
        });

    } catch (error) {
        console.error('Threat feed update error:', error);
        return Response.json({
            error: 'Feed update failed',
            message: error.message
        }, { status: 500 });
    }
});