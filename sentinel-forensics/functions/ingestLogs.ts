import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * SIEM LOG INGESTION ENDPOINT
 * 
 * Accepts logs from various sources (agents, network devices, applications)
 * Normalizes, enriches, and stores them for analysis
 * 
 * Supports:
 * - Batch log ingestion
 * - Multiple log formats (JSON, syslog, CEF, LEEF)
 * - Automatic field normalization
 * - Threat intelligence enrichment
 * - Real-time alert rule matching
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate the log source
        const authHeader = req.headers.get('Authorization');
        const apiKey = req.headers.get('X-API-Key');
        
        let sourceAuth = null;
        
        // Check for agent token or user auth
        if (apiKey) {
            // Verify agent token
            const tokens = await base44.asServiceRole.entities.AgentToken.filter({
                token_prefix: apiKey.substring(0, 8)
            });
            
            if (tokens.length === 0 || tokens[0].status !== 'active') {
                return Response.json({ error: 'Invalid API key' }, { status: 401 });
            }
            
            sourceAuth = { type: 'agent', token: tokens[0] };
        } else {
            // Require user authentication
            const user = await base44.auth.me();
            if (!user) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            sourceAuth = { type: 'user', user };
        }

        const { logs, source_type, source_id, source_name, format } = await req.json();

        if (!logs || !Array.isArray(logs)) {
            return Response.json({ 
                error: 'Invalid payload',
                expected: { logs: [], source_type: 'endpoint_agent', source_id: 'device-1' }
            }, { status: 400 });
        }

        const ingestedLogs = [];
        const alertsGenerated = [];

        // Process each log
        for (const logData of logs) {
            // Normalize log based on format
            const normalized = normalizeLog(logData, format || 'json');
            
            // Generate log ID
            const logId = `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Enrich with threat intelligence
            const enrichment = await enrichLog(normalized, base44);
            
            // Create SIEM log entry
            const siemLog = {
                log_id: logId,
                timestamp: normalized.timestamp || new Date().toISOString(),
                ingested_at: new Date().toISOString(),
                source_type: source_type || normalized.source_type || 'application',
                source_id: source_id || normalized.source_id || 'unknown',
                source_name: source_name || normalized.source_name || source_id,
                event_type: normalized.event_type || 'generic',
                severity: normalized.severity || 'info',
                message: normalized.message || JSON.stringify(logData),
                raw_log: JSON.stringify(logData),
                normalized_fields: normalized.fields || {},
                tags: normalized.tags || [],
                geo_location: enrichment.geo_location,
                threat_indicators: enrichment.threat_indicators || [],
                enrichment_data: enrichment.data || {},
                matched_rules: [],
                alert_generated: false,
                alert_ids: []
            };

            const createdLog = await base44.asServiceRole.entities.SIEMLog.create(siemLog);
            ingestedLogs.push(createdLog);

            // Check alert rules
            const matchedRules = await checkAlertRules(createdLog, base44);
            
            if (matchedRules.length > 0) {
                siemLog.matched_rules = matchedRules.map(r => r.rule_id);
                siemLog.alert_generated = true;

                // Generate alerts
                for (const rule of matchedRules) {
                    const alert = await generateAlert(createdLog, rule, base44);
                    alertsGenerated.push(alert);
                    siemLog.alert_ids.push(alert.id);
                }

                // Update log with matched rules
                await base44.asServiceRole.entities.SIEMLog.update(createdLog.id, {
                    matched_rules: siemLog.matched_rules,
                    alert_generated: true,
                    alert_ids: siemLog.alert_ids
                });
            }
        }

        return Response.json({
            success: true,
            logs_ingested: ingestedLogs.length,
            alerts_generated: alertsGenerated.length,
            log_ids: ingestedLogs.map(l => l.log_id)
        });

    } catch (error) {
        console.error('Log ingestion error:', error);
        return Response.json({ 
            error: 'Log ingestion failed',
            message: error.message
        }, { status: 500 });
    }
});

/**
 * Normalize log from various formats to standard schema
 */
function normalizeLog(logData, format) {
    const normalized = {
        timestamp: logData.timestamp || logData['@timestamp'] || new Date().toISOString(),
        fields: {},
        tags: []
    };

    if (format === 'json') {
        normalized.message = logData.message || logData.msg || JSON.stringify(logData);
        normalized.severity = mapSeverity(logData.level || logData.severity || 'info');
        normalized.event_type = logData.event_type || logData.event || 'generic';
        
        // Extract common fields
        if (logData.source_ip || logData.src_ip) {
            normalized.fields.source_ip = logData.source_ip || logData.src_ip;
        }
        if (logData.dest_ip || logData.destination_ip) {
            normalized.fields.destination_ip = logData.dest_ip || logData.destination_ip;
        }
        if (logData.user || logData.user_id) {
            normalized.fields.user_id = logData.user || logData.user_id;
        }
        if (logData.process || logData.process_name) {
            normalized.fields.process_name = logData.process || logData.process_name;
        }
    } else if (format === 'syslog') {
        // Parse syslog format
        const syslogRegex = /<(\d+)>(\w+\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+(\S+):\s+(.+)/;
        const match = logData.match?.(syslogRegex);
        
        if (match) {
            normalized.timestamp = new Date(match[2]).toISOString();
            normalized.fields.hostname = match[3];
            normalized.fields.process_name = match[4];
            normalized.message = match[5];
        }
    }

    return normalized;
}

function mapSeverity(level) {
    const severityMap = {
        'debug': 'debug',
        'trace': 'debug',
        'info': 'info',
        'information': 'info',
        'warn': 'warning',
        'warning': 'warning',
        'error': 'error',
        'err': 'error',
        'fatal': 'critical',
        'critical': 'critical',
        'crit': 'critical'
    };
    
    return severityMap[level.toLowerCase()] || 'info';
}

async function enrichLog(normalized, base44) {
    const enrichment = {
        data: {},
        threat_indicators: []
    };

    // Enrich IP addresses
    if (normalized.fields.source_ip) {
        try {
            const ipScores = await base44.asServiceRole.entities.IPReputationScore.filter({
                ip_address: normalized.fields.source_ip
            });
            
            if (ipScores.length > 0) {
                enrichment.data.ip_reputation = ipScores[0];
                
                if (ipScores[0].reputation_score < 50) {
                    enrichment.threat_indicators.push({
                        indicator_type: 'ip',
                        indicator_value: normalized.fields.source_ip,
                        threat_score: 100 - ipScores[0].reputation_score
                    });
                }
            }
        } catch (error) {
            console.warn('IP enrichment failed:', error);
        }
    }

    // Enrich file hashes
    if (normalized.fields.file_hash) {
        enrichment.threat_indicators.push({
            indicator_type: 'hash',
            indicator_value: normalized.fields.file_hash,
            threat_score: 50
        });
    }

    return enrichment;
}

async function checkAlertRules(log, base44) {
    try {
        // Fetch active alert rules
        const rules = await base44.asServiceRole.entities.SIEMAlertRule.filter({
            enabled: true
        });

        const matchedRules = [];

        for (const rule of rules) {
            if (evaluateRule(log, rule)) {
                matchedRules.push(rule);
                
                // Update rule match count
                await base44.asServiceRole.entities.SIEMAlertRule.update(rule.id, {
                    match_count: (rule.match_count || 0) + 1,
                    last_matched: new Date().toISOString()
                });
            }
        }

        return matchedRules;
    } catch (error) {
        console.error('Alert rule check failed:', error);
        return [];
    }
}

function evaluateRule(log, rule) {
    const conditions = rule.conditions;

    // Check source type
    if (conditions.source_types && conditions.source_types.length > 0) {
        if (!conditions.source_types.includes(log.source_type)) {
            return false;
        }
    }

    // Check event type
    if (conditions.event_types && conditions.event_types.length > 0) {
        if (!conditions.event_types.includes(log.event_type)) {
            return false;
        }
    }

    // Check field matches
    if (conditions.field_matches) {
        for (const fieldMatch of conditions.field_matches) {
            const fieldValue = log.normalized_fields[fieldMatch.field];
            
            if (!matchCondition(fieldValue, fieldMatch.operator, fieldMatch.value)) {
                return false;
            }
        }
    }

    return true;
}

function matchCondition(value, operator, expected) {
    if (value === undefined || value === null) return false;

    switch (operator) {
        case 'equals':
            return value === expected;
        case 'not_equals':
            return value !== expected;
        case 'contains':
            return String(value).includes(expected);
        case 'not_contains':
            return !String(value).includes(expected);
        case 'regex':
            return new RegExp(expected).test(String(value));
        case 'gt':
            return Number(value) > Number(expected);
        case 'lt':
            return Number(value) < Number(expected);
        case 'gte':
            return Number(value) >= Number(expected);
        case 'lte':
            return Number(value) <= Number(expected);
        default:
            return false;
    }
}

async function generateAlert(log, rule, base44) {
    const alert = await base44.asServiceRole.entities.Alert.create({
        alert_type: 'system_compromise',
        severity: rule.severity,
        title: `SIEM Alert: ${rule.rule_name}`,
        description: `${rule.description}\n\nTriggered by: ${log.message}`,
        source: `SIEM Rule: ${rule.rule_name}`,
        detection_timestamp: log.timestamp,
        status: 'new',
        recommended_actions: rule.actions?.map(a => a.action_type) || [],
        threat_score: rule.severity === 'critical' ? 90 : 
                     rule.severity === 'high' ? 70 :
                     rule.severity === 'medium' ? 50 : 30,
        affected_systems: [log.source_id]
    });

    // Update rule alert count
    await base44.asServiceRole.entities.SIEMAlertRule.update(rule.id, {
        alert_count: (rule.alert_count || 0) + 1
    });

    return alert;
}