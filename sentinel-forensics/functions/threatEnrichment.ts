import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Automated threat enrichment orchestrator
 * SECURITY: Uses user-scoped RLS throughout - no asServiceRole bypass
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { evidence_id, indicators } = await req.json();

        if (!evidence_id || !indicators) {
            return Response.json({ 
                error: 'evidence_id and indicators are required',
                example: {
                    evidence_id: "evidence_123",
                    indicators: {
                        file_hashes: ["abc123..."],
                        ip_addresses: ["1.2.3.4"],
                        domains: ["evil.com"],
                        urls: ["http://malicious.site"]
                    }
                }
            }, { status: 400 });
        }

        // SECURITY FIX: Use user-scoped client to verify access (RLS enforced)
        const userEvidence = await base44.entities.EvidenceV2.filter({ id: evidence_id });
        
        if (!userEvidence || userEvidence.length === 0) {
            // RLS denied access or evidence doesn't exist
            await base44.entities.AuditLog.create({
                event_type: 'unauthorized_access_attempt',
                severity: 'warning',
                description: `User attempted to enrich evidence they don't have access to`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: {
                    evidence_id,
                    reason: 'rls_denied'
                }
            });
            
            return Response.json({ 
                error: 'Forbidden',
                message: 'You do not have access to this evidence'
            }, { status: 403 });
        }

        const evidence = userEvidence[0];

        const results = {
            evidence_id,
            enrichment_timestamp: new Date().toISOString(),
            sources_checked: [],
            threats_found: [],
            overall_threat_score: 0,
            recommendations: []
        };

        // Check file hashes via VirusTotal
        if (indicators.file_hashes && indicators.file_hashes.length > 0) {
            for (const hash of indicators.file_hashes) {
                try {
                    const vtResponse = await base44.functions.invoke('virusTotal', {
                        hash: hash,
                        type: 'file'
                    });

                    if (vtResponse.data.found && vtResponse.data.malicious_count > 0) {
                        results.threats_found.push({
                            source: 'VirusTotal',
                            indicator_type: 'file_hash',
                            indicator_value: hash,
                            threat_level: vtResponse.data.threat_level,
                            malicious_count: vtResponse.data.malicious_count,
                            detection_rate: vtResponse.data.detection_rate,
                            permalink: vtResponse.data.permalink
                        });
                    }
                    results.sources_checked.push('VirusTotal');
                } catch (error) {
                    console.error('VirusTotal check failed:', error);
                }
            }
        }

        // Check IP addresses via AbuseIPDB
        if (indicators.ip_addresses && indicators.ip_addresses.length > 0) {
            for (const ip of indicators.ip_addresses) {
                try {
                    const abuseResponse = await base44.functions.invoke('abuseipdb', {
                        ip_address: ip
                    });

                    if (abuseResponse.data.abuse_confidence_score > 25) {
                        results.threats_found.push({
                            source: 'AbuseIPDB',
                            indicator_type: 'ip_address',
                            indicator_value: ip,
                            threat_level: abuseResponse.data.threat_level,
                            abuse_score: abuseResponse.data.abuse_confidence_score,
                            total_reports: abuseResponse.data.total_reports,
                            country: abuseResponse.data.country_code
                        });
                    }
                    results.sources_checked.push('AbuseIPDB');
                } catch (error) {
                    console.error('AbuseIPDB check failed:', error);
                }
            }
        }

        // Check URLs via URLScan.io
        if (indicators.urls && indicators.urls.length > 0) {
            for (const url of indicators.urls) {
                try {
                    const urlscanResponse = await base44.functions.invoke('urlscan', {
                        url: url,
                        action: 'search'
                    });

                    if (urlscanResponse.data.results_found > 0) {
                        const recentScan = urlscanResponse.data.recent_scans?.[0];
                        if (recentScan && recentScan.malicious) {
                            results.threats_found.push({
                                source: 'URLScan.io',
                                indicator_type: 'url',
                                indicator_value: url,
                                threat_level: 'high',
                                screenshot: recentScan.screenshot,
                                result_url: recentScan.result_url
                            });
                        }
                    }
                    results.sources_checked.push('URLScan.io');
                } catch (error) {
                    console.error('URLScan check failed:', error);
                }
            }
        }

        // Calculate overall threat score
        const criticalThreats = results.threats_found.filter(t => t.threat_level === 'critical').length;
        const highThreats = results.threats_found.filter(t => t.threat_level === 'high').length;
        const mediumThreats = results.threats_found.filter(t => t.threat_level === 'medium').length;
        
        results.overall_threat_score = Math.min(100,
            (criticalThreats * 40) +
            (highThreats * 25) +
            (mediumThreats * 10)
        );

        // Generate recommendations
        if (results.overall_threat_score > 75) {
            results.recommendations = [
                'CRITICAL: Isolate affected systems immediately',
                'Quarantine all related evidence',
                'Initiate incident response procedures',
                'Notify security team and stakeholders',
                'Document chain of custody for legal proceedings'
            ];
        } else if (results.overall_threat_score > 50) {
            results.recommendations = [
                'HIGH PRIORITY: Investigate further',
                'Review network logs for related activity',
                'Check for lateral movement indicators',
                'Update threat detection rules'
            ];
        } else if (results.overall_threat_score > 25) {
            results.recommendations = [
                'MEDIUM: Continue monitoring',
                'Add indicators to watchlist',
                'Review historical data for patterns'
            ];
        }

        // SECURITY FIX: Store enrichment results using user-scoped client (RLS enforced)
        try {
            await base44.entities.ThreatDetection.create({
                evidence_id,
                detection_engine: 'automated_enrichment',
                threat_found: results.threats_found.length > 0,
                threat_name: results.threats_found.length > 0 ? 'Multiple IOCs Detected' : 'Clean',
                threat_severity: results.overall_threat_score > 75 ? 'critical' :
                               results.overall_threat_score > 50 ? 'high' :
                               results.overall_threat_score > 25 ? 'medium' : 'low',
                confidence_score: results.threats_found.length > 0 ? 85 : 100,
                detection_details: {
                    sources_checked: results.sources_checked,
                    threats_found: results.threats_found,
                    total_indicators_checked: 
                        (indicators.file_hashes?.length || 0) +
                        (indicators.ip_addresses?.length || 0) +
                        (indicators.domains?.length || 0) +
                        (indicators.urls?.length || 0)
                },
                scan_timestamp: new Date().toISOString(),
                remediation_steps: results.recommendations
            });
        } catch (dbError) {
            console.error('Failed to store threat detection result:', dbError);
        }

        // SECURITY FIX: Create audit log with user-scoped client (RLS enforced)
        await base44.entities.AuditLog.create({
            event_type: 'threat_enrichment_completed',
            severity: results.overall_threat_score > 50 ? 'warning' : 'info',
            description: `Automated threat enrichment for evidence ${evidence_id}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                evidence_id,
                threat_score: results.overall_threat_score,
                threats_found: results.threats_found.length,
                sources_checked: results.sources_checked.length
            }
        });

        return Response.json(results);

    } catch (error) {
        console.error('Threat enrichment error:', error);
        return Response.json({ 
            error: 'Internal server error', 
            message: error.message
        }, { status: 500 });
    }
});