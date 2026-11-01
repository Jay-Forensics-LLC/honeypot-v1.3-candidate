import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AUTOMATED THREAT INTELLIGENCE CORRELATION ENGINE
 * 
 * Correlates incoming threat intelligence with internal SIEM events
 * Detects APT campaigns, threat actors, and security incidents
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const recentLogs = await base44.asServiceRole.entities.SIEMLog.filter({
            indexed: false
        });

        const activeIOCs = await base44.asServiceRole.entities.IOCIndicator.filter({
            status: 'new'
        });

        const aptGroups = await base44.asServiceRole.entities.APTGroup.list();

        const correlations = [];
        const incidents = [];

        for (const log of recentLogs) {
            for (const ioc of activeIOCs) {
                const match = checkIOCMatch(log, ioc);
                
                if (match.matched) {
                    const correlation = await base44.asServiceRole.entities.ThreatIntelCorrelation.create({
                        correlation_id: `CORR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        correlation_type: 'ioc_to_log',
                        threat_intel_id: ioc.id,
                        siem_log_id: log.id,
                        confidence_score: match.confidence,
                        match_details: match.details,
                        correlated_at: new Date().toISOString()
                    });

                    correlations.push(correlation);

                    await base44.asServiceRole.entities.SIEMLog.update(log.id, {
                        matched_rules: [...(log.matched_rules || []), `IOC:${ioc.indicator_id}`],
                        indexed: true
                    });

                    if (match.confidence >= 75) {
                        const incident = await escalateToIncident(log, ioc, correlation, base44);
                        incidents.push(incident);
                    }
                }
            }

            for (const aptGroup of aptGroups) {
                const aptMatch = checkAPTPattern(log, aptGroup);
                
                if (aptMatch.matched && aptMatch.confidence >= 60) {
                    const correlation = await base44.asServiceRole.entities.ThreatIntelCorrelation.create({
                        correlation_id: `CORR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        correlation_type: 'apt_to_event',
                        threat_intel_id: aptGroup.id,
                        siem_log_id: log.id,
                        confidence_score: aptMatch.confidence,
                        match_details: aptMatch.details,
                        threat_context: {
                            apt_group: aptGroup.group_name,
                            ttps: aptMatch.ttps
                        },
                        severity_escalation: 'high_to_critical',
                        correlated_at: new Date().toISOString()
                    });

                    correlations.push(correlation);

                    const incident = await createAPTIncident(log, aptGroup, correlation, base44);
                    incidents.push(incident);
                }
            }
        }

        return Response.json({
            success: true,
            logs_analyzed: recentLogs.length,
            correlations_found: correlations.length,
            incidents_created: incidents.length,
            correlation_ids: correlations.map(c => c.correlation_id)
        });

    } catch (error) {
        console.error('Correlation error:', error);
        return Response.json({
            error: 'Correlation failed',
            message: error.message
        }, { status: 500 });
    }
});

function checkIOCMatch(log, ioc) {
    const matched = {
        matched: false,
        confidence: 0,
        details: {}
    };

    const logFields = log.normalized_fields || {};
    const iocValue = ioc.value.toLowerCase();

    if (ioc.indicator_type === 'ip') {
        if (logFields.source_ip === iocValue || logFields.destination_ip === iocValue) {
            matched.matched = true;
            matched.confidence = ioc.confidence * 100;
            matched.details = {
                matched_fields: logFields.source_ip === iocValue ? ['source_ip'] : ['destination_ip'],
                ioc_value: iocValue,
                log_value: logFields.source_ip || logFields.destination_ip,
                match_type: 'exact'
            };
        }
    }

    if (ioc.indicator_type === 'domain') {
        if (logFields.url?.includes(iocValue)) {
            matched.matched = true;
            matched.confidence = ioc.confidence * 100;
            matched.details = {
                matched_fields: ['url'],
                ioc_value: iocValue,
                log_value: logFields.url,
                match_type: 'substring'
            };
        }
    }

    if (ioc.indicator_type === 'sha256' || ioc.indicator_type === 'md5') {
        if (logFields.file_hash === iocValue) {
            matched.matched = true;
            matched.confidence = 95;
            matched.details = {
                matched_fields: ['file_hash'],
                ioc_value: iocValue,
                log_value: logFields.file_hash,
                match_type: 'exact'
            };
        }
    }

    return matched;
}

function checkAPTPattern(log, aptGroup) {
    const matched = {
        matched: false,
        confidence: 0,
        details: {},
        ttps: []
    };

    const logFields = log.normalized_fields || {};
    const aptTTPs = aptGroup.ttps || {};

    if (aptTTPs.lateral_movement?.length > 0) {
        if (log.event_type === 'network_connection' && 
            logFields.destination_port === 445) {
            matched.matched = true;
            matched.confidence = 70;
            matched.ttps.push('T1021 - Remote Services');
        }
    }

    if (aptTTPs.persistence?.length > 0) {
        if (log.event_type === 'registry_modification' || 
            log.event_type === 'scheduled_task_created') {
            matched.matched = true;
            matched.confidence = 65;
            matched.ttps.push('T1053 - Scheduled Task/Job');
        }
    }

    if (aptGroup.infrastructure?.known_ips?.includes(logFields.destination_ip)) {
        matched.matched = true;
        matched.confidence = 85;
        matched.ttps.push('C2 Communication');
    }

    return matched;
}

async function escalateToIncident(log, ioc, correlation, base44) {
    const incidentId = `INC-${Date.now()}`;

    const incident = await base44.asServiceRole.entities.IncidentResponse.create({
        incident_id: incidentId,
        incident_number: `INC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        incident_type: 'malware_outbreak',
        severity: 'high',
        status: 'detected',
        detected_at: log.timestamp,
        detected_by: 'SIEM Correlation Engine',
        title: `IOC Match: ${ioc.indicator_type} - ${ioc.value}`,
        description: `Automated correlation detected IOC match.\n\nIOC: ${ioc.value}\nLog: ${log.event_type}`,
        affected_systems: [log.source_id],
        threat_intel_enrichment: {
            matched_iocs: [{
                ioc_type: ioc.indicator_type,
                ioc_value: ioc.value,
                threat_score: ioc.reputation_score || 70
            }]
        }
    });

    await base44.asServiceRole.entities.ThreatIntelCorrelation.update(correlation.id, {
        incident_id: incidentId
    });

    return incident;
}

async function createAPTIncident(log, aptGroup, correlation, base44) {
    const incidentId = `INC-APT-${Date.now()}`;

    return await base44.asServiceRole.entities.IncidentResponse.create({
        incident_id: incidentId,
        incident_number: `INC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        incident_type: 'apt_attack',
        severity: 'critical',
        status: 'detected',
        detected_at: log.timestamp,
        detected_by: 'APT Detection Engine',
        title: `APT Activity: ${aptGroup.group_name}`,
        description: `Potential ${aptGroup.group_name} activity detected.`,
        affected_systems: [log.source_id]
    });
}