import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI THREAT HUNTER
 * 
 * Analyzes SIEM logs for APT patterns and anomalies
 * Generates threat findings with MITRE ATT&CK mapping
 */

const MITRE_PATTERNS = {
    'brute_force_auth': {
        tactic: 'TA0006',
        tactic_name: 'Credential Access',
        technique: 'T1110',
        technique_name: 'Brute Force',
        category: 'credential_access'
    },
    'lateral_movement': {
        tactic: 'TA0008',
        tactic_name: 'Lateral Movement',
        technique: 'T1021',
        technique_name: 'Remote Services',
        category: 'lateral_movement'
    },
    'privilege_escalation': {
        tactic: 'TA0004',
        tactic_name: 'Privilege Escalation',
        technique: 'T1078',
        technique_name: 'Valid Accounts',
        category: 'privilege_escalation'
    },
    'data_exfiltration': {
        tactic: 'TA0010',
        tactic_name: 'Exfiltration',
        technique: 'T1041',
        technique_name: 'Exfiltration Over C2 Channel',
        category: 'exfiltration'
    },
    'persistence': {
        tactic: 'TA0003',
        tactic_name: 'Persistence',
        technique: 'T1053',
        technique_name: 'Scheduled Task/Job',
        category: 'persistence'
    },
    'defense_evasion': {
        tactic: 'TA0005',
        tactic_name: 'Defense Evasion',
        technique: 'T1070',
        technique_name: 'Indicator Removal',
        category: 'defense_evasion'
    }
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { time_range_hours = 24 } = await req.json();

        const startTime = new Date(Date.now() - time_range_hours * 60 * 60 * 1000);
        const endTime = new Date();

        const events = await base44.asServiceRole.entities.SIEMLog.filter({
            timestamp: { $gte: startTime.toISOString() }
        }, '-timestamp', 1000);

        const findings = [];

        const bruteForceFindings = detectBruteForce(events, startTime, endTime);
        findings.push(...bruteForceFindings);

        const lateralMovementFindings = detectLateralMovement(events, startTime, endTime);
        findings.push(...lateralMovementFindings);

        const anomalyFindings = detectAnomalies(events, startTime, endTime);
        findings.push(...anomalyFindings);

        const iocFindings = detectIOCPatterns(events, startTime, endTime);
        findings.push(...iocFindings);

        const createdFindings = [];

        for (const finding of findings) {
            const created = await base44.asServiceRole.entities.AiThreatFinding.create(finding);
            createdFindings.push(created);
        }

        return Response.json({
            success: true,
            hunt_completed_at: new Date().toISOString(),
            time_range: {
                start: startTime.toISOString(),
                end: endTime.toISOString(),
                hours: time_range_hours
            },
            events_analyzed: events.length,
            findings_created: createdFindings.length,
            findings: createdFindings.map(f => ({
                id: f.finding_id,
                category: f.category,
                score: f.suspicion_score,
                summary: f.summary
            }))
        });

    } catch (error) {
        console.error('AI Hunt error:', error);
        return Response.json({
            error: 'Hunt failed',
            message: error.message
        }, { status: 500 });
    }
});

function detectBruteForce(events, start, end) {
    const findings = [];
    
    const failedAuths = events.filter(e => 
        e.event_type?.includes('failed_auth') || 
        e.event_type?.includes('authentication') && e.severity !== 'info'
    );

    const ipGroups = new Map();
    
    failedAuths.forEach(event => {
        const ip = event.normalized_fields?.source_ip;
        if (!ip) return;
        
        if (!ipGroups.has(ip)) {
            ipGroups.set(ip, []);
        }
        ipGroups.get(ip).push(event);
    });

    for (const [ip, authEvents] of ipGroups) {
        if (authEvents.length >= 5) {
            const score = Math.min(100, 40 + authEvents.length * 5);
            
            findings.push({
                finding_id: `FIND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                created_at: new Date().toISOString(),
                time_range_start: start.toISOString(),
                time_range_end: end.toISOString(),
                related_event_ids: authEvents.map(e => e.log_id),
                related_device_ids: [...new Set(authEvents.map(e => e.source_id))],
                mitre_mapping: MITRE_PATTERNS.brute_force_auth,
                suspicion_score: score,
                category: 'credential_access',
                summary: `Brute force attack detected from ${ip} (${authEvents.length} failed attempts)`,
                hypotheses: [
                    { hypothesis: `Verify if IP ${ip} is in threat intelligence feeds`, priority: 'high', completed: false },
                    { hypothesis: `Check if any successful logins followed from ${ip}`, priority: 'critical', completed: false },
                    { hypothesis: `Review all affected user accounts for compromise`, priority: 'high', completed: false },
                    { hypothesis: `Block IP ${ip} at firewall level`, priority: 'medium', completed: false }
                ],
                pattern_type: 'brute_force',
                evidence: {
                    event_count: authEvents.length,
                    unique_ips: [ip],
                    unique_users: [...new Set(authEvents.map(e => e.normalized_fields?.user_id).filter(Boolean))],
                    time_span_minutes: Math.round((new Date(authEvents[authEvents.length - 1].timestamp) - new Date(authEvents[0].timestamp)) / 60000),
                    ioc_matches: authEvents.filter(e => e.threat_indicators?.length > 0).length
                },
                status: 'new',
                auto_generated: true
            });
        }
    }

    return findings;
}

function detectLateralMovement(events, start, end) {
    const findings = [];
    
    const lateralEvents = events.filter(e =>
        e.event_type?.includes('lateral') ||
        e.tags?.includes('lateral_movement') ||
        (e.event_type?.includes('network') && e.severity === 'warning')
    );

    if (lateralEvents.length >= 3) {
        const devices = [...new Set(lateralEvents.map(e => e.source_id))];
        
        if (devices.length >= 2) {
            findings.push({
                finding_id: `FIND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                created_at: new Date().toISOString(),
                time_range_start: start.toISOString(),
                time_range_end: end.toISOString(),
                related_event_ids: lateralEvents.map(e => e.log_id),
                related_device_ids: devices,
                mitre_mapping: MITRE_PATTERNS.lateral_movement,
                suspicion_score: 75,
                category: 'lateral_movement',
                summary: `Potential lateral movement across ${devices.length} devices (${lateralEvents.length} events)`,
                hypotheses: [
                    { hypothesis: `Map network connections between affected devices`, priority: 'critical', completed: false },
                    { hypothesis: `Check for stolen credentials or pass-the-hash attacks`, priority: 'high', completed: false },
                    { hypothesis: `Review account usage patterns for anomalies`, priority: 'high', completed: false },
                    { hypothesis: `Isolate affected devices from network`, priority: 'medium', completed: false }
                ],
                pattern_type: 'lateral_movement',
                evidence: {
                    event_count: lateralEvents.length,
                    unique_ips: [...new Set(lateralEvents.map(e => e.normalized_fields?.source_ip).filter(Boolean))],
                    unique_users: [],
                    time_span_minutes: Math.round((end - start) / 60000),
                    ioc_matches: 0
                },
                status: 'new',
                auto_generated: true
            });
        }
    }

    return findings;
}

function detectAnomalies(events, start, end) {
    const findings = [];
    
    const userLocations = new Map();
    
    events.forEach(event => {
        const userId = event.normalized_fields?.user_id;
        const country = event.geo_location?.country;
        
        if (userId && country) {
            if (!userLocations.has(userId)) {
                userLocations.set(userId, new Set());
            }
            userLocations.get(userId).add(country);
        }
    });

    for (const [userId, countries] of userLocations) {
        if (countries.size >= 3) {
            const userEvents = events.filter(e => e.normalized_fields?.user_id === userId);
            
            findings.push({
                finding_id: `FIND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                created_at: new Date().toISOString(),
                time_range_start: start.toISOString(),
                time_range_end: end.toISOString(),
                related_event_ids: userEvents.map(e => e.log_id),
                related_device_ids: [],
                mitre_mapping: {
                    tactic: 'TA0001',
                    tactic_name: 'Initial Access',
                    technique: 'T1078',
                    technique_name: 'Valid Accounts'
                },
                suspicion_score: 65,
                category: 'anomaly',
                summary: `User ${userId} accessed from ${countries.size} different countries`,
                hypotheses: [
                    { hypothesis: `Verify if user ${userId} traveled recently`, priority: 'high', completed: false },
                    { hypothesis: `Check for compromised credentials`, priority: 'critical', completed: false },
                    { hypothesis: `Review account activity for other anomalies`, priority: 'medium', completed: false }
                ],
                pattern_type: 'geo_anomaly',
                evidence: {
                    event_count: userEvents.length,
                    unique_ips: [...new Set(userEvents.map(e => e.normalized_fields?.source_ip).filter(Boolean))],
                    unique_users: [userId],
                    time_span_minutes: Math.round((end - start) / 60000),
                    ioc_matches: 0
                },
                status: 'new',
                auto_generated: true
            });
        }
    }

    return findings;
}

function detectIOCPatterns(events, start, end) {
    const findings = [];
    
    const iocEvents = events.filter(e => 
        e.threat_indicators && e.threat_indicators.length > 0
    );

    const deviceIOCs = new Map();
    
    iocEvents.forEach(event => {
        const deviceId = event.source_id;
        if (!deviceIOCs.has(deviceId)) {
            deviceIOCs.set(deviceId, []);
        }
        deviceIOCs.get(deviceId).push(event);
    });

    for (const [deviceId, iocEvts] of deviceIOCs) {
        if (iocEvts.length >= 3) {
            const maxThreatScore = Math.max(...iocEvts.flatMap(e => 
                e.threat_indicators?.map(t => t.threat_score || 0) || []
            ));

            findings.push({
                finding_id: `FIND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                created_at: new Date().toISOString(),
                time_range_start: start.toISOString(),
                time_range_end: end.toISOString(),
                related_event_ids: iocEvts.map(e => e.log_id),
                related_device_ids: [deviceId],
                mitre_mapping: {
                    tactic: 'TA0011',
                    tactic_name: 'Command and Control',
                    technique: 'T1071',
                    technique_name: 'Application Layer Protocol'
                },
                suspicion_score: Math.min(95, maxThreatScore + 10),
                category: 'reconnaissance',
                summary: `Device ${deviceId} triggered ${iocEvts.length} IOC matches`,
                hypotheses: [
                    { hypothesis: `Isolate device ${deviceId} from network`, priority: 'critical', completed: false },
                    { hypothesis: `Collect memory dump for malware analysis`, priority: 'high', completed: false },
                    { hypothesis: `Check for C2 communication patterns`, priority: 'high', completed: false },
                    { hypothesis: `Review IOC threat intelligence sources`, priority: 'medium', completed: false }
                ],
                pattern_type: 'ioc_cluster',
                evidence: {
                    event_count: iocEvts.length,
                    unique_ips: [...new Set(iocEvts.flatMap(e => 
                        e.threat_indicators?.map(t => t.ioc_value) || []
                    ).filter(v => /^\d+\.\d+\.\d+\.\d+$/.test(v)))],
                    unique_users: [],
                    time_span_minutes: Math.round((end - start) / 60000),
                    ioc_matches: iocEvts.reduce((sum, e) => sum + (e.threat_indicators?.length || 0), 0)
                },
                status: 'new',
                auto_generated: true
            });
        }
    }

    return findings;
}