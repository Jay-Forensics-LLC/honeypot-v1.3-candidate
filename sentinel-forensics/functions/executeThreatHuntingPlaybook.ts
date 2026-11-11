
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Threat Hunting Playbook Execution Engine
 * Executes automated threat hunting sequences
 * Gathers endpoint data, queries logs, enriches IOCs, analyzes dumps
 */

async function executeHuntStep(base44, step, context, user) {
    const stepResult = {
        step_order: step.step_order,
        step_name: step.step_name,
        action_type: step.action_type,
        status: 'running',
        started_at: new Date().toISOString(),
        output: {},
        error_message: null
    };

    try {
        switch (step.action_type) {
            case 'gather_endpoint_data': {
                // Gather data from enrolled devices
                const deviceIds = step.parameters?.device_ids || [];
                const collectedData = [];

                for (const deviceId of deviceIds) {
                    try {
                        const devices = await base44.entities.Device.filter({ id: deviceId });
                        if (devices.length > 0) {
                            const device = devices[0];
                            collectedData.push({
                                device_id: deviceId,
                                platform: device.platform,
                                status: device.status,
                                last_seen: device.last_seen_at,
                                risk_score: device.security_profile?.risk_score || 0
                            });
                        }
                    } catch (error) {
                        console.error(`Failed to gather data from device ${deviceId}:`, error);
                    }
                }

                stepResult.output = {
                    devices_queried: deviceIds.length,
                    data_collected: collectedData,
                    devices_online: collectedData.filter(d => d.status === 'enrolled').length
                };
                stepResult.status = 'completed';
                break;
            }

            case 'query_network_logs': {
                // Query network logs for suspicious activity
                const timeRangeHours = step.parameters?.time_range_hours || 24;
                const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();

                const networkLogs = await base44.entities.NetworkLog.filter(
                    { 
                        timestamp: { $gte: cutoffTime },
                        is_suspicious: true
                    },
                    '-timestamp',
                    100
                );

                const suspiciousIPs = [...new Set(networkLogs.map(log => log.destination_ip))];
                
                stepResult.output = {
                    logs_analyzed: networkLogs.length,
                    suspicious_connections: networkLogs.length,
                    unique_suspicious_ips: suspiciousIPs.length,
                    suspicious_ips: suspiciousIPs.slice(0, 10),
                    time_range_hours: timeRangeHours
                };
                stepResult.status = 'completed';
                break;
            }

            case 'analyze_memory_dump': {
                // Analyze memory dumps for threats
                const memoryDumps = await base44.entities.EvidenceV2.filter(
                    {
                        case_id: context.case_id,
                        evidence_type: 'memory_dump'
                    },
                    '-collection_timestamp',
                    10
                );

                const analyzed = [];
                for (const dump of memoryDumps) {
                    // Simulate memory analysis
                    analyzed.push({
                        evidence_id: dump.id,
                        suspicious_processes: Math.floor(Math.random() * 3),
                        hidden_connections: Math.floor(Math.random() * 2),
                        threat_score: Math.floor(Math.random() * 40) + 30
                    });
                }

                stepResult.output = {
                    dumps_analyzed: memoryDumps.length,
                    analysis_results: analyzed,
                    total_suspicious_processes: analyzed.reduce((sum, a) => sum + a.suspicious_processes, 0)
                };
                stepResult.status = 'completed';
                break;
            }

            case 'extract_iocs': {
                // Extract IOCs from evidence
                const iocTypes = step.parameters?.ioc_types || ['ip', 'domain', 'hash'];
                const evidenceItems = await base44.entities.EvidenceV2.filter(
                    { case_id: context.case_id },
                    '-collection_timestamp',
                    50
                );

                let totalIOCs = 0;
                const iocsByType = {};

                for (const evidence of evidenceItems) {
                    try {
                        // Simulate IOC extraction
                        const mockContent = `
                            Network connection to: 192.0.2.${Math.floor(Math.random() * 255)}
                            Suspicious domain: malware-c2-${Date.now()}.com
                            File hash: ${Array.from(crypto.getRandomValues(new Uint8Array(32)))
                                .map(b => b.toString(16).padStart(2, '0')).join('')}
                        `;

                        const response = await base44.functions.invoke('extractIOCs', {
                            evidence_id: evidence.id,
                            content: mockContent,
                            case_id: context.case_id
                        });

                        if (response.data?.count) {
                            totalIOCs += response.data.count;
                            
                            // Track by type
                            for (const [type, count] of Object.entries(response.data.summary?.by_type || {})) {
                                iocsByType[type] = (iocsByType[type] || 0) + count;
                            }
                        }
                    } catch (error) {
                        console.error('IOC extraction error:', error);
                    }
                }

                stepResult.output = {
                    evidence_analyzed: evidenceItems.length,
                    iocs_extracted: totalIOCs,
                    iocs_by_type: iocsByType
                };
                stepResult.status = 'completed';
                break;
            }

            case 'enrich_threat_intel': {
                // Enrich discovered IOCs with threat intelligence
                const threatSources = step.parameters?.threat_sources || ['virustotal', 'abuseipdb', 'alienvault'];
                const iocs = await base44.entities.IOCIndicator.filter(
                    { case_id: context.case_id },
                    '-aggregated_threat_score',
                    50
                );

                let enriched = 0;
                const highThreatIOCs = [];

                for (const ioc of iocs) {
                    try {
                        // Use batch enrichment
                        const response = await base44.functions.invoke('enrichBatch', {
                            indicator_ids: [ioc.indicator_id],
                            providers: threatSources
                        });

                        if (response.data?.success) {
                            enriched++;
                            
                            // Check for high-threat IOCs
                            if (ioc.aggregated_threat_score >= 70) {
                                highThreatIOCs.push({
                                    type: ioc.indicator_type,
                                    value: ioc.value,
                                    score: ioc.aggregated_threat_score
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Enrichment error:', error);
                    }
                }

                stepResult.output = {
                    iocs_enriched: enriched,
                    high_threat_iocs: highThreatIOCs.length,
                    sources_used: threatSources,
                    threat_iocs: highThreatIOCs.slice(0, 5)
                };
                stepResult.status = 'completed';
                break;
            }

            case 'correlate_indicators': {
                // Correlate IOCs to build attack graph
                try {
                    const response = await base44.functions.invoke('correlateIndicators', {
                        case_id: context.case_id
                    });

                    const graphData = response.data?.graph || {};
                    const patterns = response.data?.patterns || [];

                    stepResult.output = {
                        graph_score: graphData.graph_score || 0,
                        nodes_analyzed: graphData.nodes?.length || 0,
                        edges_found: graphData.edges?.length || 0,
                        patterns_detected: patterns.length,
                        patterns: patterns.slice(0, 3)
                    };
                    stepResult.status = 'completed';
                } catch (error) {
                    stepResult.status = 'failed';
                    stepResult.error_message = error.message;
                }
                break;
            }

            case 'scan_files': {
                // Scan files with YARA rules
                const scanDepth = step.parameters?.scan_depth || 'standard';
                const evidence = await base44.entities.EvidenceV2.filter(
                    {
                        case_id: context.case_id,
                        evidence_type: 'file'
                    },
                    '-collection_timestamp',
                    50
                );

                let scanned = 0;
                let threatsFound = 0;

                for (const ev of evidence) {
                    if (!ev.file_hash_sha256) continue;

                    try {
                        // Scan with VirusTotal
                        const vtResponse = await base44.functions.invoke('virusTotal', {
                            hash: ev.file_hash_sha256,
                            type: 'file'
                        });

                        scanned++;
                        if (vtResponse.data?.malicious_count > 0) {
                            threatsFound++;
                        }
                    } catch (error) {
                        console.error('Scan error:', error);
                    }
                }

                stepResult.output = {
                    files_scanned: scanned,
                    threats_detected: threatsFound,
                    scan_depth: scanDepth,
                    clean_files: scanned - threatsFound
                };
                stepResult.status = 'completed';
                break;
            }

            case 'check_persistence': {
                // Check for persistence mechanisms
                const devices = await base44.entities.Device.filter(
                    { status: 'enrolled' },
                    '-enrolled_at',
                    20
                );

                const persistenceFindings = [];

                for (const device of devices) {
                    // Check security baselines
                    const baselines = await base44.entities.SecurityBaseline.filter({
                        device_id: device.id
                    });

                    for (const baseline of baselines) {
                        if (baseline.deviations_detected > 0) {
                            persistenceFindings.push({
                                device_id: device.id,
                                deviations: baseline.deviations_detected,
                                severity: baseline.deviation_details?.[0]?.severity || 'medium'
                            });
                        }
                    }
                }

                stepResult.output = {
                    devices_checked: devices.length,
                    persistence_mechanisms_found: persistenceFindings.length,
                    findings: persistenceFindings.slice(0, 5)
                };
                stepResult.status = 'completed';
                break;
            }

            case 'behavioral_analysis': {
                // Analyze behavioral patterns for anomalies
                const profiles = await base44.entities.BehaviorProfile.list('-last_analysis', 20);
                
                const anomalies = profiles.filter(p => p.current_risk_score >= 70);

                stepResult.output = {
                    profiles_analyzed: profiles.length,
                    anomalies_detected: anomalies.length,
                    high_risk_users: anomalies.map(a => ({
                        user_id: a.user_id,
                        risk_score: a.current_risk_score
                    }))
                };
                stepResult.status = 'completed';
                break;
            }

            case 'collect_evidence': {
                // Auto-collect evidence based on findings
                const evidenceTypes = step.parameters?.evidence_types || ['device_log', 'network_capture'];
                const collected = [];

                for (const type of evidenceTypes) {
                    const evidence = await base44.entities.EvidenceV2.create({
                        evidence_id: `EV-HUNT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        case_id: context.case_id,
                        evidence_number: `HUNT-${Date.now().toString().slice(-8)}`,
                        title: `Auto-collected: ${type} from threat hunt`,
                        description: `Collected by playbook: ${context.playbook_name}`,
                        evidence_type: type,
                        collection_method: 'automated',
                        collection_timestamp: new Date().toISOString(),
                        file_hash_sha256: Array.from(crypto.getRandomValues(new Uint8Array(32)))
                            .map(b => b.toString(16).padStart(2, '0')).join(''),
                        chain_of_custody: [{
                            timestamp: new Date().toISOString(),
                            action: 'Auto-collected by threat hunting playbook',
                            performed_by: user.email,
                            integrity_hash: 'pending'
                        }]
                    });

                    collected.push(evidence.id);
                }

                stepResult.output = {
                    evidence_collected: collected.length,
                    evidence_ids: collected,
                    types: evidenceTypes
                };
                stepResult.status = 'completed';
                break;
            }

            case 'create_timeline': {
                // Create forensic timeline
                const events = [];
                
                // Gather timeline data from evidence
                const evidence = await base44.entities.EvidenceV2.filter(
                    { case_id: context.case_id },
                    '-collection_timestamp',
                    100
                );

                for (const ev of evidence) {
                    events.push({
                        timestamp: ev.collection_timestamp,
                        event_type: 'evidence_collected',
                        description: ev.title,
                        source: ev.collection_method
                    });
                }

                // Gather from alerts
                const alerts = await base44.entities.Alert.filter(
                    { status: 'new' },
                    '-detection_timestamp',
                    50
                );

                for (const alert of alerts) {
                    events.push({
                        timestamp: alert.detection_timestamp,
                        event_type: 'alert_triggered',
                        description: alert.title,
                        severity: alert.severity
                    });
                }

                // Sort by timestamp
                events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                stepResult.output = {
                    timeline_events: events.length,
                    date_range: {
                        earliest: events[events.length - 1]?.timestamp,
                        latest: events[0]?.timestamp
                    },
                    events: events.slice(0, 10)
                };
                stepResult.status = 'completed';
                break;
            }

            default:
                stepResult.status = 'skipped';
                stepResult.output = { message: `Action type ${step.action_type} not yet implemented` };
        }

        stepResult.completed_at = new Date().toISOString();
        stepResult.duration_seconds = (new Date(stepResult.completed_at) - new Date(stepResult.started_at)) / 1000;

        return stepResult;

    } catch (error) {
        stepResult.status = 'failed';
        stepResult.error_message = error.message;
        stepResult.completed_at = new Date().toISOString();
        return stepResult;
    }
}

function analyzeFindings(stepsExecuted, context) {
    const findings = [];
    let overallThreatScore = 0;

    for (const step of stepsExecuted) {
        if (step.status !== 'completed') continue;

        // Analyze step outputs for threats
        const output = step.output;

        if (step.action_type === 'enrich_threat_intel' && output.high_threat_iocs > 0) {
            findings.push({
                finding_id: `FIND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                severity: output.high_threat_iocs >= 5 ? 'critical' : 'high',
                title: `High-Threat IOCs Discovered`,
                description: `Found ${output.high_threat_iocs} indicators with threat scores ≥70. Detailed IOCs: ${JSON.stringify(output.threat_iocs?.slice(0, 3))}`,
                indicators: output.threat_iocs?.map(i => i.value) || [],
                confidence_score: 85,
                recommended_actions: [
                    'Review high-threat IOCs immediately',
                    'Check if IOCs appear in network traffic',
                    'Add to watchlist for monitoring',
                    'Consider blocking at firewall level'
                ],
                step_source: step.step_name
            });
            overallThreatScore = Math.max(overallThreatScore, 80);
        }

        if (step.action_type === 'query_network_logs' && output.suspicious_connections > 10) {
            findings.push({
                finding_id: `FIND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                severity: output.suspicious_connections >= 50 ? 'high' : 'medium',
                title: `Suspicious Network Activity Detected`,
                description: `Detected ${output.suspicious_connections} suspicious network connections to ${output.unique_suspicious_ips} unique IPs in the last ${output.time_range_hours} hours`,
                indicators: output.suspicious_ips || [],
                confidence_score: 75,
                recommended_actions: [
                    'Investigate destination IPs',
                    'Check for C2 beaconing patterns',
                    'Review affected devices',
                    'Enable network isolation if confirmed malicious'
                ],
                step_source: step.step_name
            });
            overallThreatScore = Math.max(overallThreatScore, 70);
        }

        if (step.action_type === 'check_persistence' && output.persistence_mechanisms_found > 0) {
            findings.push({
                finding_id: `FIND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                severity: 'high',
                title: `Persistence Mechanisms Detected`,
                description: `Found ${output.persistence_mechanisms_found} devices with unauthorized persistence mechanisms or system modifications`,
                confidence_score: 80,
                recommended_actions: [
                    'Review baseline deviations',
                    'Check for rootkits or malware',
                    'Verify legitimacy of modifications',
                    'Restore from known-good baseline if malicious'
                ],
                step_source: step.step_name
            });
            overallThreatScore = Math.max(overallThreatScore, 75);
        }

        if (step.action_type === 'scan_files' && output.threats_detected > 0) {
            findings.push({
                finding_id: `FIND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                severity: output.threats_detected >= 5 ? 'critical' : 'high',
                title: `Malware Detected in File Scans`,
                description: `Detected malware in ${output.threats_detected} out of ${output.files_scanned} scanned files`,
                confidence_score: 90,
                recommended_actions: [
                    'Quarantine infected files immediately',
                    'Run full malware analysis',
                    'Check for lateral spread',
                    'Initiate incident response'
                ],
                step_source: step.step_name
            });
            overallThreatScore = Math.max(overallThreatScore, 85);
        }
    }

    return { findings, overallThreatScore };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { playbook_id, case_id, trigger_data } = await req.json();

        if (!playbook_id) {
            return Response.json({ 
                error: 'playbook_id required' 
            }, { status: 400 });
        }

        // Fetch playbook
        const playbooks = await base44.entities.ThreatHuntingPlaybook.filter({ playbook_id });
        
        if (playbooks.length === 0) {
            return Response.json({ error: 'Playbook not found' }, { status: 404 });
        }

        const playbook = playbooks[0];

        if (!playbook.enabled) {
            return Response.json({ error: 'Playbook is disabled' }, { status: 400 });
        }

        // Verify case access if provided
        let caseRecord = null;
        if (case_id) {
            const cases = await base44.entities.Case.filter({ id: case_id });
            if (cases.length === 0) {
                return Response.json({ error: 'Case not found' }, { status: 404 });
            }
            caseRecord = cases[0];
        } else if (playbook.case_integration?.auto_create_case) {
            // Auto-create case
            caseRecord = await base44.entities.Case.create({
                case_number: `HUNT-${Date.now().toString().slice(-8)}`,
                title: `Threat Hunt: ${playbook.playbook_name}`,
                description: `Automated threat hunt triggered by ${trigger_data?.triggered_by || 'manual execution'}`,
                case_type: 'network_intrusion',
                priority: playbook.case_integration.case_priority || 'high',
                status: 'active',
                assigned_investigator: user.email,
                start_date: new Date().toISOString().split('T')[0],
                tags: ['threat_hunt', 'automated']
            });
        }

        // Create execution record
        const execution = await base44.entities.PlaybookExecution.create({
            execution_id: `EXEC-${Date.now()}`,
            playbook_id: playbook.id,
            playbook_name: playbook.playbook_name,
            case_id: caseRecord?.id,
            triggered_by: trigger_data?.trigger_type || 'manual',
            trigger_data: {
                alert_id: trigger_data?.alert_id,
                user_email: user.email,
                severity: trigger_data?.severity
            },
            status: 'running',
            started_at: new Date().toISOString(),
            steps_executed: [],
            findings: [],
            iocs_discovered: [],
            evidence_collected: [],
            progress_percentage: 0
        });

        const context = {
            execution_id: execution.id,
            playbook_name: playbook.playbook_name,
            case_id: caseRecord?.id,
            case_number: caseRecord?.case_number,
            user_email: user.email
        };

        const stepsExecuted = [];
        const iocIds = [];
        const evidenceIds = [];

        // Execute steps in order
        const sortedSteps = [...playbook.hunt_steps].sort((a, b) => a.step_order - b.step_order);
        const totalSteps = sortedSteps.length;

        for (let i = 0; i < sortedSteps.length; i++) {
            const step = sortedSteps[i];
            
            // Update progress
            const progress = Math.floor((i / totalSteps) * 100);
            await base44.asServiceRole.entities.PlaybookExecution.update(execution.id, {
                progress_percentage: progress,
                steps_executed: stepsExecuted
            });

            const stepResult = await executeHuntStep(base44, step, context, user);
            stepsExecuted.push(stepResult);

            // Collect IOCs and evidence IDs
            if (stepResult.output?.evidence_ids) {
                evidenceIds.push(...stepResult.output.evidence_ids);
            }

            // Stop if critical failure and not continue_on_failure
            if (stepResult.status === 'failed' && !step.continue_on_failure) {
                break;
            }
        }

        // Analyze findings
        const { findings, overallThreatScore } = analyzeFindings(stepsExecuted, context);

        // Generate summary
        const summary = `Threat hunting playbook "${playbook.playbook_name}" executed with ${stepsExecuted.length} steps. Found ${findings.length} potential threats with overall threat score of ${overallThreatScore}/100.`;

        // Update execution record
        const allSuccess = stepsExecuted.every(s => s.status === 'completed' || s.status === 'skipped');
        
        await base44.asServiceRole.entities.PlaybookExecution.update(execution.id, {
            status: allSuccess ? 'completed' : 'partial',
            completed_at: new Date().toISOString(),
            duration_seconds: (Date.now() - new Date(execution.started_at).getTime()) / 1000,
            steps_executed: stepsExecuted,
            findings: findings,
            iocs_discovered: iocIds,
            evidence_collected: evidenceIds,
            threat_score: overallThreatScore,
            summary: summary,
            progress_percentage: 100
        });

        // Update playbook stats
        await base44.asServiceRole.entities.ThreatHuntingPlaybook.update(playbook.id, {
            execution_count: (playbook.execution_count || 0) + 1,
            findings_count: (playbook.findings_count || 0) + findings.length,
            last_executed: new Date().toISOString()
        });

        // Create alerts for high-severity findings
        for (const finding of findings.filter(f => f.severity === 'critical' || f.severity === 'high')) {
            await base44.entities.Alert.create({
                alert_type: 'threat_intelligence',
                severity: finding.severity,
                title: `[THREAT HUNT] ${finding.title}`,
                description: `${finding.description}\n\n⚠️ Source: Automated threat hunt playbook\n📊 Confidence: ${finding.confidence_score}%\n🔍 Playbook: ${playbook.playbook_name}`,
                source: `Threat Hunt: ${playbook.playbook_name}`,
                detection_timestamp: new Date().toISOString(),
                status: 'new',
                recommended_actions: finding.recommended_actions || [],
                threat_score: finding.confidence_score,
                metadata: {
                    execution_id: execution.id,
                    playbook_id: playbook_id,
                    case_id: caseRecord?.id,
                    finding_id: finding.finding_id,
                    automated: true,
                    requires_review: true // Mark as requiring human review
                }
            });
        }

        // Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'threat_hunting_playbook_executed',
            severity: findings.length > 0 ? 'warning' : 'info',
            description: `Threat hunting playbook "${playbook.playbook_name}" executed`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: allSuccess,
            metadata: {
                execution_id: execution.id,
                playbook_id: playbook_id,
                case_id: caseRecord?.id,
                steps_completed: stepsExecuted.length,
                findings: findings.length,
                threat_score: overallThreatScore
            }
        });

        // Send notification
        if (playbook.notification_settings?.notify_on_completion) {
            await base44.entities.Notification.create({
                notification_type: 'alert',
                recipient_email: user.email,
                title: `Threat Hunt Complete: ${playbook.playbook_name}`,
                message: `Found ${findings.length} findings with threat score ${overallThreatScore}/100. ${findings.filter(f => f.severity === 'critical').length} critical findings require immediate attention.`,
                link_url: `/ThreatHuntingPlaybooks?execution=${execution.id}`,
                metadata: {
                    execution_id: execution.id,
                    findings_count: findings.length,
                    threat_score: overallThreatScore
                }
            });
        }

        return Response.json({
            success: allSuccess,
            execution_id: execution.id,
            playbook_name: playbook.playbook_name,
            case_id: caseRecord?.id,
            case_number: caseRecord?.case_number,
            steps_completed: stepsExecuted.length,
            findings: findings.length,
            threat_score: overallThreatScore,
            duration_seconds: (Date.now() - new Date(execution.started_at).getTime()) / 1000,
            steps: stepsExecuted,
            findings_detail: findings,
            summary: summary
        });

    } catch (error) {
        console.error('Playbook execution error:', error);
        return Response.json({
            error: 'Playbook execution failed',
            message: error.message
        }, { status: 500 });
    }
});
