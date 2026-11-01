import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AUTOMATIC IOC CORRELATION WITH SIEM LOGS
 * 
 * Correlates incoming SIEM logs with known IOCs from threat intel
 * Updates logs with IOC match flags and threat scores
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { log_id, auto_correlate_all } = await req.json();

        let logsToProcess = [];

        if (auto_correlate_all) {
            // Process recent uncorrelated logs
            const recentLogs = await base44.asServiceRole.entities.SIEMLog.filter({
                alert_generated: false,
                indexed: true
            }, '-timestamp', 100);
            logsToProcess = recentLogs;
        } else if (log_id) {
            const logs = await base44.asServiceRole.entities.SIEMLog.filter({ log_id });
            logsToProcess = logs;
        } else {
            return Response.json({ error: 'log_id or auto_correlate_all required' }, { status: 400 });
        }

        // Fetch all active IOCs
        const iocs = await base44.asServiceRole.entities.IOCIndicator.filter({
            status: { $in: ['new', 'investigating', 'malicious'] }
        });

        let matchedLogs = 0;
        let totalMatches = 0;
        const correlations = [];

        for (const log of logsToProcess) {
            const matches = [];

            // Extract fields to check
            const fieldsToCheck = {
                source_ip: log.normalized_fields?.source_ip,
                destination_ip: log.normalized_fields?.destination_ip,
                domain: log.normalized_fields?.url?.split('/')[2],
                file_hash: log.normalized_fields?.file_hash,
                process_name: log.normalized_fields?.process_name
            };

            // Check each IOC
            for (const ioc of iocs) {
                let isMatch = false;
                let matchedField = null;

                switch (ioc.indicator_type) {
                    case 'ip':
                        if (fieldsToCheck.source_ip === ioc.value || 
                            fieldsToCheck.destination_ip === ioc.value) {
                            isMatch = true;
                            matchedField = 'IP Address';
                        }
                        break;
                    
                    case 'domain':
                        if (fieldsToCheck.domain === ioc.value) {
                            isMatch = true;
                            matchedField = 'Domain';
                        }
                        break;
                    
                    case 'sha256':
                    case 'md5':
                    case 'sha1':
                        if (fieldsToCheck.file_hash === ioc.value) {
                            isMatch = true;
                            matchedField = 'File Hash';
                        }
                        break;
                    
                    case 'process_name':
                        if (fieldsToCheck.process_name?.toLowerCase().includes(ioc.value.toLowerCase())) {
                            isMatch = true;
                            matchedField = 'Process Name';
                        }
                        break;
                }

                if (isMatch) {
                    matches.push({
                        ioc_id: ioc.indicator_id,
                        ioc_value: ioc.value,
                        ioc_type: ioc.indicator_type,
                        matched_field: matchedField,
                        threat_score: ioc.reputation_score || 50,
                        confidence: ioc.confidence
                    });

                    // Create correlation record
                    await base44.asServiceRole.entities.ThreatIntelCorrelation.create({
                        correlation_id: `CORR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        correlation_type: 'ioc_to_log',
                        threat_intel_id: ioc.indicator_id,
                        siem_log_id: log.log_id,
                        confidence_score: ioc.confidence * 100,
                        match_details: {
                            matched_fields: [matchedField],
                            ioc_value: ioc.value,
                            log_value: fieldsToCheck[matchedField?.toLowerCase().replace(' ', '_')],
                            match_type: 'exact'
                        },
                        threat_context: {
                            malware_family: ioc.tags?.find(t => t.startsWith('malware:'))?.replace('malware:', ''),
                            ttps: ioc.tags?.filter(t => t.startsWith('MITRE:')) || []
                        },
                        correlated_at: new Date().toISOString()
                    });

                    // Update IOC recurrence
                    await base44.asServiceRole.entities.IOCIndicator.update(ioc.id, {
                        recurrence_count: (ioc.recurrence_count || 1) + 1,
                        last_seen: new Date().toISOString()
                    });
                }
            }

            // If matches found, update log
            if (matches.length > 0) {
                matchedLogs++;
                totalMatches += matches.length;

                const maxThreatScore = Math.max(...matches.map(m => m.threat_score));
                
                await base44.asServiceRole.entities.SIEMLog.update(log.id, {
                    threat_indicators: matches,
                    matched_rules: [...(log.matched_rules || []), 'IOC_CORRELATION'],
                    alert_generated: maxThreatScore >= 70,
                    enrichment_data: {
                        ...(log.enrichment_data || {}),
                        ioc_matches: matches.length,
                        max_threat_score: maxThreatScore,
                        correlated_at: new Date().toISOString()
                    }
                });

                // Generate alert for high-severity matches
                if (maxThreatScore >= 70) {
                    const alert = await base44.asServiceRole.entities.Alert.create({
                        alert_type: 'system_compromise',
                        severity: maxThreatScore >= 90 ? 'critical' : 'high',
                        title: `IOC Match: ${matches[0].matched_field}`,
                        description: `Detected ${matches.length} IOC match(es) in log ${log.log_id}`,
                        source: 'IOC Correlation Engine',
                        detection_timestamp: new Date().toISOString(),
                        status: 'new',
                        threat_score: maxThreatScore,
                        recommended_actions: [
                            'Investigate affected system',
                            'Review network connections',
                            'Check for lateral movement',
                            'Isolate device if necessary'
                        ]
                    });

                    correlations.push({
                        log_id: log.log_id,
                        alert_id: alert.id,
                        matches: matches.length,
                        max_threat_score: maxThreatScore
                    });
                }
            }
        }

        return Response.json({
            success: true,
            logs_processed: logsToProcess.length,
            logs_matched: matchedLogs,
            total_ioc_matches: totalMatches,
            correlations_created: correlations.length,
            correlations
        });

    } catch (error) {
        console.error('IOC correlation error:', error);
        return Response.json({
            error: 'Correlation failed',
            message: error.message
        }, { status: 500 });
    }
});