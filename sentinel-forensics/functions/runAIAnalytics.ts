import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * AI ANALYTICS ENGINE
 * 
 * Implements network/memory/behavior anomaly detection with:
 * - Deterministic feature computation
 * - AI-assisted narrative generation
 * - Full traceability and confidence scoring
 * - Court-admissible mode option
 */

const PROMPT_VERSION = 'v1.0.0';
const MODEL_NAME = 'claude-3-5-sonnet-20241022';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { 
            caseId, 
            runType, 
            artifactIds = [],
            timeRange = null,
            courtAdmissibleMode = false 
        } = await req.json();

        if (!caseId || !runType) {
            return Response.json({ 
                error: 'Missing required fields',
                required: ['caseId', 'runType']
            }, { status: 400 });
        }

        // Create analytics run record
        const run = await base44.asServiceRole.entities.AnalyticsRun.create({
            organization_id: user.organization_id,
            case_id: caseId,
            run_type: runType,
            status: 'running',
            started_at: new Date().toISOString(),
            model_provider: 'anthropic',
            model_name: MODEL_NAME,
            prompt_version: PROMPT_VERSION,
            parameters_json: {
                artifact_ids: artifactIds,
                time_range: timeRange,
                court_admissible_mode: courtAdmissibleMode
            },
            input_artifact_ids: artifactIds,
            court_admissible_mode: courtAdmissibleMode,
            run_fingerprint: generateRunFingerprint(caseId, runType, artifactIds, timeRange)
        });

        try {
            // Fetch normalized events
            const events = await fetchNormalizedEvents(base44, user, caseId, artifactIds, timeRange);

            // Run detection pipeline based on type
            let detectionResults;
            switch (runType) {
                case 'network_anomaly':
                    detectionResults = await detectNetworkAnomalies(events, courtAdmissibleMode);
                    break;
                case 'memory_anomaly':
                    detectionResults = await detectMemoryAnomalies(events, courtAdmissibleMode);
                    break;
                case 'behavior_analytics':
                    detectionResults = await detectBehaviorAnomalies(events, courtAdmissibleMode);
                    break;
                case 'combined':
                    detectionResults = await detectCombinedAnomalies(events, courtAdmissibleMode);
                    break;
                default:
                    throw new Error(`Unknown run type: ${runType}`);
            }

            // Generate findings with AI narrative
            const findings = await generateFindings(
                base44,
                user,
                run.id,
                caseId,
                detectionResults,
                courtAdmissibleMode
            );

            // Generate visualizations
            const visualizations = await generateVisualizations(
                base44,
                user,
                run.id,
                caseId,
                events,
                findings,
                runType
            );

            // Update run status
            await base44.asServiceRole.entities.AnalyticsRun.update(run.id, {
                status: 'success',
                finished_at: new Date().toISOString(),
                output_summary: `Generated ${findings.length} findings and ${visualizations.length} visualizations`
            });

            // Audit log
            await base44.asServiceRole.entities.AuditLog.create({
                event_type: 'ai_analytics_completed',
                severity: 'info',
                description: `AI analytics run completed: ${runType}`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: true,
                metadata: {
                    run_id: run.id,
                    run_type: runType,
                    findings_count: findings.length,
                    court_mode: courtAdmissibleMode
                }
            });

            return Response.json({
                success: true,
                run_id: run.id,
                findings_count: findings.length,
                visualizations_count: visualizations.length
            });

        } catch (error) {
            // Update run as failed
            await base44.asServiceRole.entities.AnalyticsRun.update(run.id, {
                status: 'failed',
                finished_at: new Date().toISOString(),
                output_summary: `Error: ${error.message}`
            });
            throw error;
        }

    } catch (error) {
        console.error('AI analytics error:', error);
        return Response.json({
            error: 'Analytics failed',
            message: error.message
        }, { status: 500 });
    }
});

/**
 * FETCH NORMALIZED EVENTS
 */
async function fetchNormalizedEvents(base44, user, caseId, artifactIds, timeRange) {
    const query = {
        organization_id: user.organization_id,
        case_id: caseId
    };

    if (artifactIds.length > 0) {
        // Filter by artifacts (Base44 SDK doesn't support $in, fetch all and filter)
        const allEvents = await base44.entities.NormalizedEvent.filter(query);
        return allEvents.filter(e => artifactIds.includes(e.artifact_id));
    }

    return await base44.entities.NormalizedEvent.filter(query);
}

/**
 * NETWORK ANOMALY DETECTION (Deterministic)
 */
async function detectNetworkAnomalies(events, courtMode) {
    const networkEvents = events.filter(e => 
        ['net_flow', 'dns_query', 'tls_handshake', 'http_meta'].includes(e.event_type)
    );

    const detections = [];
    const threshold = courtMode ? 0.75 : 0.60;

    // Build baseline (30-day window or available data)
    const baseline = buildNetworkBaseline(networkEvents);

    // Detect outliers
    for (const event of networkEvents) {
        const anomalies = [];

        // New destination not in baseline
        if (event.dst_ip && !baseline.known_destinations.has(event.dst_ip)) {
            anomalies.push({
                type: 'new_destination',
                value: event.dst_ip,
                confidence: 0.7
            });
        }

        // Rare port usage
        if (event.dst_port && !baseline.common_ports.has(event.dst_port)) {
            if (event.dst_port > 49152 || [135, 139, 445, 3389].includes(event.dst_port)) {
                anomalies.push({
                    type: 'suspicious_port',
                    value: event.dst_port,
                    confidence: 0.8
                });
            }
        }

        // Beaconing detection (simplified)
        const hostConns = networkEvents.filter(e => 
            e.host_id === event.host_id && e.dst_ip === event.dst_ip
        );
        if (hostConns.length > 10) {
            const intervals = calculateIntervals(hostConns);
            if (isBeaconing(intervals)) {
                anomalies.push({
                    type: 'beaconing',
                    value: `${hostConns.length} connections with regular intervals`,
                    confidence: 0.85
                });
            }
        }

        if (anomalies.length > 0) {
            const maxConfidence = Math.max(...anomalies.map(a => a.confidence));
            if (maxConfidence >= threshold) {
                detections.push({
                    event_id: event.id,
                    artifact_id: event.artifact_id,
                    anomalies,
                    confidence: maxConfidence,
                    event_data: event
                });
            }
        }
    }

    return {
        type: 'network',
        detections,
        baseline
    };
}

/**
 * MEMORY ANOMALY DETECTION (Deterministic)
 */
async function detectMemoryAnomalies(events, courtMode) {
    const memoryEvents = events.filter(e => 
        e.event_type.startsWith('memory_')
    );

    const detections = [];
    const threshold = courtMode ? 0.75 : 0.60;

    for (const event of memoryEvents) {
        const anomalies = [];

        // RWX memory regions
        if (event.event_type === 'memory_region') {
            const attrs = event.attributes_json || {};
            if (attrs.protection && attrs.protection.includes('RWX')) {
                anomalies.push({
                    type: 'rwx_region',
                    value: attrs.protection,
                    confidence: 0.9
                });
            }
        }

        // Suspicious strings
        if (event.event_type === 'memory_string') {
            const content = event.attributes_json?.content || '';
            if (content.match(/powershell|cmd|exec|eval|base64/i)) {
                anomalies.push({
                    type: 'suspicious_string',
                    value: content.substring(0, 100),
                    confidence: 0.75
                });
            }
        }

        // Process anomalies
        if (event.event_type === 'memory_proc') {
            if (event.parent_process_id === 0 && event.process_name !== 'System') {
                anomalies.push({
                    type: 'orphan_process',
                    value: event.process_name,
                    confidence: 0.8
                });
            }
        }

        if (anomalies.length > 0) {
            const maxConfidence = Math.max(...anomalies.map(a => a.confidence));
            if (maxConfidence >= threshold) {
                detections.push({
                    event_id: event.id,
                    artifact_id: event.artifact_id,
                    anomalies,
                    confidence: maxConfidence,
                    event_data: event
                });
            }
        }
    }

    return {
        type: 'memory',
        detections
    };
}

/**
 * BEHAVIOR ANOMALY DETECTION (Deterministic)
 */
async function detectBehaviorAnomalies(events, courtMode) {
    const behaviorEvents = events.filter(e => 
        ['process_start', 'auth', 'file_access', 'powershell', 'scheduled_task'].includes(e.event_type)
    );

    const detections = [];
    const threshold = courtMode ? 0.75 : 0.60;

    // Build per-user baselines
    const userBaselines = buildUserBaselines(behaviorEvents);

    for (const event of behaviorEvents) {
        const anomalies = [];
        const baseline = userBaselines.get(event.actor_user);

        if (!baseline) continue;

        // First-time admin tool usage
        if (event.event_type === 'process_start') {
            const adminTools = ['reg.exe', 'schtasks.exe', 'net.exe', 'wmic.exe'];
            if (adminTools.some(tool => event.process_name?.toLowerCase().includes(tool))) {
                if (!baseline.admin_tools.has(event.process_name)) {
                    anomalies.push({
                        type: 'first_admin_tool',
                        value: event.process_name,
                        confidence: 0.8
                    });
                }
            }
        }

        // Suspicious PowerShell
        if (event.event_type === 'powershell') {
            if (event.command_line?.match(/-enc|-e\s|downloadstring|iex|invoke-expression/i)) {
                anomalies.push({
                    type: 'suspicious_powershell',
                    value: event.command_line?.substring(0, 100),
                    confidence: 0.85
                });
            }
        }

        // Off-hours activity
        const eventHour = new Date(event.event_time).getHours();
        if ((eventHour < 6 || eventHour > 22) && !baseline.off_hours_activity) {
            anomalies.push({
                type: 'off_hours',
                value: `Activity at ${eventHour}:00`,
                confidence: 0.7
            });
        }

        if (anomalies.length > 0) {
            const maxConfidence = Math.max(...anomalies.map(a => a.confidence));
            if (maxConfidence >= threshold) {
                detections.push({
                    event_id: event.id,
                    artifact_id: event.artifact_id,
                    anomalies,
                    confidence: maxConfidence,
                    event_data: event
                });
            }
        }
    }

    return {
        type: 'behavior',
        detections,
        user_baselines: Array.from(userBaselines.entries()).map(([user, baseline]) => ({
            user,
            metrics: {
                admin_tools_count: baseline.admin_tools.size,
                typical_hours: baseline.typical_hours
            }
        }))
    };
}

/**
 * COMBINED DETECTION
 */
async function detectCombinedAnomalies(events, courtMode) {
    const network = await detectNetworkAnomalies(events, courtMode);
    const memory = await detectMemoryAnomalies(events, courtMode);
    const behavior = await detectBehaviorAnomalies(events, courtMode);

    // Correlate across domains
    const correlations = [];
    for (const netDet of network.detections) {
        for (const memDet of memory.detections) {
            if (netDet.event_data.host_id === memDet.event_data.host_id) {
                correlations.push({
                    type: 'network_memory_correlation',
                    network_event: netDet.event_id,
                    memory_event: memDet.event_id,
                    confidence: Math.min(netDet.confidence, memDet.confidence) * 1.2
                });
            }
        }
    }

    return {
        type: 'combined',
        network,
        memory,
        behavior,
        correlations
    };
}

/**
 * GENERATE FINDINGS WITH AI NARRATIVE
 */
async function generateFindings(base44, user, runId, caseId, detectionResults, courtMode) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
        throw new Error('AI API key not configured');
    }

    const detections = detectionResults.type === 'combined'
        ? [...detectionResults.network.detections, ...detectionResults.memory.detections, ...detectionResults.behavior.detections]
        : detectionResults.detections;

    if (detections.length === 0) {
        return [];
    }

    // Group detections for AI processing
    const prompt = buildFindingsPrompt(detections, courtMode);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: MODEL_NAME,
            max_tokens: 4096,
            temperature: 0.2,
            system: `You are a forensic analyst generating findings. Output ONLY valid JSON.
${courtMode ? 'COURT-ADMISSIBLE MODE: Use conservative language, higher confidence thresholds, and explicit sourcing.' : ''}
Output format:
{
  "findings": [
    {
      "title": "...",
      "description": "...",
      "severity": "info|low|medium|high|critical",
      "confidence": 0.0-1.0,
      "confidence_explain": "...",
      "rationale": "...",
      "recommended_actions": ["..."],
      "finding_type": "anomaly|cluster|behavior_deviation|indicator|correlation|outlier"
    }
  ]
}`,
            messages: [{
                role: 'user',
                content: prompt
            }]
        })
    });

    if (!response.ok) {
        throw new Error(`AI API error: ${await response.text()}`);
    }

    const result = await response.json();
    const content = result.content[0].text;

    let aiFindings;
    try {
        aiFindings = JSON.parse(content);
    } catch (e) {
        console.error('Failed to parse AI response:', content);
        throw new Error('AI generated invalid JSON');
    }

    // Create finding records
    const findings = [];
    for (let i = 0; i < aiFindings.findings.length && i < detections.length; i++) {
        const aiFinding = aiFindings.findings[i];
        const detection = detections[i];

        const finding = await base44.asServiceRole.entities.AIAnalyticsFinding.create({
            organization_id: user.organization_id,
            analytics_run_id: runId,
            case_id: caseId,
            finding_type: aiFinding.finding_type || 'anomaly',
            title: aiFinding.title,
            description: aiFinding.description,
            severity: aiFinding.severity,
            confidence: aiFinding.confidence,
            confidence_explain: aiFinding.confidence_explain,
            rationale: aiFinding.rationale,
            recommended_actions: aiFinding.recommended_actions || [],
            evidence_refs: [{
                artifact_id: detection.artifact_id,
                event_ids: [detection.event_id],
                fields_used: Object.keys(detection.event_data).filter(k => detection.event_data[k]),
                time_range: {
                    start: detection.event_data.event_time,
                    end: detection.event_data.event_time
                }
            }],
            reproducibility: {
                model: MODEL_NAME,
                prompt_version: PROMPT_VERSION,
                detection_confidence: detection.confidence,
                anomaly_types: detection.anomalies.map(a => a.type)
            }
        });

        findings.push(finding);
    }

    return findings;
}

/**
 * GENERATE VISUALIZATIONS
 */
async function generateVisualizations(base44, user, runId, caseId, events, findings, runType) {
    const visualizations = [];

    // Network graph
    if (runType === 'network_anomaly' || runType === 'combined') {
        const networkGraph = buildNetworkGraph(events, findings);
        const viz = await base44.asServiceRole.entities.VisualizationArtifact.create({
            organization_id: user.organization_id,
            case_id: caseId,
            analytics_run_id: runId,
            viz_type: 'network_graph',
            title: 'Network Relationship Graph',
            spec_json: networkGraph
        });
        visualizations.push(viz);
    }

    // Process tree
    if (runType === 'behavior_analytics' || runType === 'memory_anomaly' || runType === 'combined') {
        const processTree = buildProcessTree(events, findings);
        const viz = await base44.asServiceRole.entities.VisualizationArtifact.create({
            organization_id: user.organization_id,
            case_id: caseId,
            analytics_run_id: runId,
            viz_type: 'process_tree',
            title: 'Process Execution Tree',
            spec_json: processTree
        });
        visualizations.push(viz);
    }

    // Timeline
    const timeline = buildTimeline(events, findings);
    const viz = await base44.asServiceRole.entities.VisualizationArtifact.create({
        organization_id: user.organization_id,
        case_id: caseId,
        analytics_run_id: runId,
        viz_type: 'timeline',
        title: 'Event Timeline with Anomalies',
        spec_json: timeline
    });
    visualizations.push(viz);

    return visualizations;
}

// Helper functions
function generateRunFingerprint(caseId, runType, artifactIds, timeRange) {
    const data = JSON.stringify({ caseId, runType, artifactIds, timeRange });
    return btoa(data).slice(0, 16);
}

function buildNetworkBaseline(events) {
    const destinations = new Set();
    const ports = new Set();
    
    events.forEach(e => {
        if (e.dst_ip) destinations.add(e.dst_ip);
        if (e.dst_port) ports.add(e.dst_port);
    });

    return {
        known_destinations: destinations,
        common_ports: ports
    };
}

function buildUserBaselines(events) {
    const baselines = new Map();
    
    for (const event of events) {
        if (!event.actor_user) continue;
        
        if (!baselines.has(event.actor_user)) {
            baselines.set(event.actor_user, {
                admin_tools: new Set(),
                typical_hours: [],
                off_hours_activity: false
            });
        }
        
        const baseline = baselines.get(event.actor_user);
        if (event.process_name) baseline.admin_tools.add(event.process_name);
        const hour = new Date(event.event_time).getHours();
        baseline.typical_hours.push(hour);
        if (hour < 6 || hour > 22) baseline.off_hours_activity = true;
    }
    
    return baselines;
}

function calculateIntervals(connections) {
    const times = connections.map(c => new Date(c.event_time).getTime()).sort();
    const intervals = [];
    for (let i = 1; i < times.length; i++) {
        intervals.push(times[i] - times[i-1]);
    }
    return intervals;
}

function isBeaconing(intervals) {
    if (intervals.length < 5) return false;
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    return (stdDev / avg) < 0.2; // Low variance = regular intervals
}

function buildFindingsPrompt(detections, courtMode) {
    return `Analyze these ${detections.length} anomaly detections and generate findings.

DETECTIONS DATA (read-only):
${JSON.stringify(detections.slice(0, 20).map(d => ({
    event_id: d.event_id,
    anomalies: d.anomalies,
    confidence: d.confidence,
    event_summary: {
        type: d.event_data.event_type,
        time: d.event_data.event_time,
        host: d.event_data.host_id
    }
})), null, 2)}

Generate findings with clear titles, descriptions, severity ratings, and recommended actions.
${courtMode ? 'Use conservative language suitable for court presentation.' : ''}`;
}

function buildNetworkGraph(events, findings) {
    const nodes = new Map();
    const edges = [];
    
    events.filter(e => e.event_type === 'net_flow').forEach(e => {
        if (e.src_ip && !nodes.has(e.src_ip)) {
            nodes.set(e.src_ip, { id: e.src_ip, type: 'host', label: e.src_ip });
        }
        if (e.dst_ip && !nodes.has(e.dst_ip)) {
            nodes.set(e.dst_ip, { id: e.dst_ip, type: 'destination', label: e.dst_ip });
        }
        if (e.src_ip && e.dst_ip) {
            edges.push({
                source: e.src_ip,
                target: e.dst_ip,
                value: 1
            });
        }
    });
    
    return {
        nodes: Array.from(nodes.values()),
        edges
    };
}

function buildProcessTree(events, findings) {
    const nodes = [];
    const edges = [];
    
    events.filter(e => e.event_type === 'process_start' || e.event_type === 'memory_proc').forEach(e => {
        if (e.process_id) {
            nodes.push({
                id: String(e.process_id),
                name: e.process_name || 'Unknown',
                command: e.command_line
            });
            
            if (e.parent_process_id && e.parent_process_id !== 0) {
                edges.push({
                    source: String(e.parent_process_id),
                    target: String(e.process_id)
                });
            }
        }
    });
    
    return { nodes, edges };
}

function buildTimeline(events, findings) {
    const items = events.map(e => ({
        time: e.event_time,
        type: e.event_type,
        label: `${e.event_type}: ${e.host_id || 'unknown'}`,
        id: e.id
    }));
    
    const anomalies = findings.map(f => ({
        time: f.created_date,
        type: 'finding',
        label: f.title,
        severity: f.severity,
        id: f.id
    }));
    
    return {
        events: items,
        anomalies
    };
}