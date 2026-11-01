import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ALERT RULE EVALUATION ENGINE
 * 
 * Evaluates alert rules against SIEM events and creates alerts
 * Supports severity, event type, IOC match filtering
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { event_id, auto_evaluate_recent } = await req.json();

        // Get active alert rules
        const rules = await base44.asServiceRole.entities.SIEMAlertRule.filter({
            enabled: true
        });

        if (rules.length === 0) {
            return Response.json({
                success: true,
                message: 'No active rules to evaluate',
                alerts_created: 0
            });
        }

        let eventsToCheck = [];

        if (auto_evaluate_recent) {
            // Check recent events (last 5 minutes)
            const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            eventsToCheck = await base44.asServiceRole.entities.SIEMLog.filter({
                timestamp: { $gte: cutoff },
                alert_generated: false
            }, '-timestamp', 100);
        } else if (event_id) {
            const events = await base44.asServiceRole.entities.SIEMLog.filter({ log_id: event_id });
            eventsToCheck = events;
        } else {
            return Response.json({ error: 'event_id or auto_evaluate_recent required' }, { status: 400 });
        }

        const alertsCreated = [];

        for (const event of eventsToCheck) {
            for (const rule of rules) {
                const match = await evaluateRule(rule, event, base44);

                if (match.matched) {
                    // Create alert
                    const alert = await base44.asServiceRole.entities.Alert.create({
                        alert_type: match.alert_type || 'network_anomaly',
                        severity: rule.severity,
                        title: match.title || rule.rule_name,
                        description: match.description,
                        source: `AlertRule: ${rule.rule_name}`,
                        detection_timestamp: event.timestamp,
                        status: 'new',
                        threat_score: match.threat_score || 50,
                        affected_systems: [event.source_id],
                        recommended_actions: match.recommended_actions || []
                    });

                    // Update event
                    await base44.asServiceRole.entities.SIEMLog.update(event.id, {
                        alert_generated: true,
                        alert_ids: [...(event.alert_ids || []), alert.id],
                        matched_rules: [...(event.matched_rules || []), rule.rule_id]
                    });

                    // Update rule stats
                    await base44.asServiceRole.entities.SIEMAlertRule.update(rule.id, {
                        match_count: (rule.match_count || 0) + 1,
                        alert_count: (rule.alert_count || 0) + 1,
                        last_matched: new Date().toISOString()
                    });

                    alertsCreated.push({
                        alert_id: alert.id,
                        rule_id: rule.rule_id,
                        event_id: event.log_id,
                        severity: rule.severity
                    });

                    // Dispatch notifications
                    if (rule.actions && rule.actions.length > 0) {
                        for (const action of rule.actions) {
                            if (action.action_type === 'send_email' || 
                                action.action_type === 'create_alert') {
                                // Will be handled by alert dispatcher
                            }
                        }
                    }
                }
            }
        }

        return Response.json({
            success: true,
            events_evaluated: eventsToCheck.length,
            alerts_created: alertsCreated.length,
            alerts: alertsCreated
        });

    } catch (error) {
        console.error('Alert evaluation error:', error);
        return Response.json({
            error: 'Evaluation failed',
            message: error.message
        }, { status: 500 });
    }
});

async function evaluateRule(rule, event, base44) {
    const conditions = rule.conditions || {};
    
    // Check severity
    if (conditions.event_types && conditions.event_types.length > 0) {
        if (!conditions.event_types.includes(event.event_type)) {
            return { matched: false };
        }
    }

    // Check field matches
    if (conditions.field_matches && conditions.field_matches.length > 0) {
        for (const fieldMatch of conditions.field_matches) {
            const fieldValue = getNestedField(event, fieldMatch.field);
            
            if (!evaluateFieldCondition(fieldValue, fieldMatch.operator, fieldMatch.value)) {
                return { matched: false };
            }
        }
    }

    // Check threshold conditions
    if (conditions.threshold) {
        const thresholdMet = await evaluateThreshold(rule, event, conditions.threshold, base44);
        if (!thresholdMet) {
            return { matched: false };
        }
    }

    // Check if IOC match is required
    const hasIOCMatch = event.threat_indicators && event.threat_indicators.length > 0;
    const requiresIOC = conditions.field_matches?.some(f => f.field === 'threat_indicators');

    if (requiresIOC && !hasIOCMatch) {
        return { matched: false };
    }

    // Rule matched - generate alert details
    const iocInfo = hasIOCMatch 
        ? ` with ${event.threat_indicators.length} IOC match(es)`
        : '';

    return {
        matched: true,
        alert_type: mapEventTypeToAlertType(event.event_type),
        title: `${rule.rule_name}: ${event.event_type}${iocInfo}`,
        description: `Detected ${event.event_type} from ${event.source_name || event.source_id}. ${event.message}`,
        threat_score: hasIOCMatch 
            ? Math.max(...event.threat_indicators.map(t => t.threat_score || 50))
            : 50,
        recommended_actions: generateRecommendations(event, hasIOCMatch)
    };
}

function getNestedField(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

function evaluateFieldCondition(value, operator, expected) {
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
        case 'in':
            return Array.isArray(expected) && expected.includes(value);
        default:
            return false;
    }
}

async function evaluateThreshold(rule, event, threshold, base44) {
    if (!threshold.time_window_minutes || !threshold.count) {
        return true;
    }

    const cutoff = new Date(Date.now() - threshold.time_window_minutes * 60 * 1000).toISOString();
    
    const query = {
        timestamp: { $gte: cutoff },
        event_type: event.event_type
    };

    if (threshold.group_by_fields && threshold.group_by_fields.length > 0) {
        threshold.group_by_fields.forEach(field => {
            const value = getNestedField(event, field);
            if (value) {
                query[field] = value;
            }
        });
    }

    const recentEvents = await base44.asServiceRole.entities.SIEMLog.filter(query);
    
    return recentEvents.length >= threshold.count;
}

function mapEventTypeToAlertType(eventType) {
    const mapping = {
        'failed_authentication': 'unauthorized_access',
        'malware_detected': 'malware_detected',
        'lateral_movement': 'network_anomaly',
        'privilege_escalation': 'unauthorized_access',
        'data_exfiltration': 'data_exfiltration'
    };
    return mapping[eventType] || 'network_anomaly';
}

function generateRecommendations(event, hasIOC) {
    const recommendations = [
        'Review event details and context',
        'Check affected system logs',
        'Verify user account status'
    ];

    if (hasIOC) {
        recommendations.push('Investigate IOC matches in threat intelligence');
        recommendations.push('Check for additional IOC correlations');
    }

    if (event.severity === 'critical') {
        recommendations.push('Consider device isolation');
        recommendations.push('Collect forensic evidence');
    }

    return recommendations;
}