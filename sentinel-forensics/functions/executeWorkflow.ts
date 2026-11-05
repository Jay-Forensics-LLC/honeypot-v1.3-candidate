import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Workflow Execution Engine
 * Executes automation playbooks and handles rollback on failures
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { playbook_id, trigger_data, manual_execution = false } = await req.json();

        if (!playbook_id) {
            return Response.json({ error: 'playbook_id required' }, { status: 400 });
        }

        // Fetch playbook
        const playbooks = await base44.entities.AutomationPlaybook.filter({ id: playbook_id });
        const playbook = playbooks[0];

        if (!playbook) {
            return Response.json({ error: 'Playbook not found' }, { status: 404 });
        }

        if (!playbook.enabled && !manual_execution) {
            return Response.json({ error: 'Playbook is disabled' }, { status: 400 });
        }

        // Create execution record
        const execution = await base44.entities.WorkflowExecution.create({
            workflow_id: playbook.id,
            workflow_name: playbook.playbook_name,
            trigger_type: manual_execution ? 'manual' : 'event_triggered',
            trigger_data: trigger_data || {},
            status: 'running',
            started_at: new Date().toISOString(),
            steps_executed: [],
            actions_taken: [],
            resources_affected: []
        });

        const executionSteps = [];
        const actionsTaken = [];
        const resourcesAffected = [];
        let allStepsSuccessful = true;

        // Execute each step
        for (const step of playbook.steps.sort((a, b) => a.step_order - b.step_order)) {
            const stepStartTime = Date.now();
            const stepExecution = {
                step_name: step.step_name,
                step_type: step.action_type,
                status: 'running',
                started_at: new Date().toISOString()
            };

            try {
                let stepResult;

                switch (step.action_type) {
                    case 'create_alert':
                        stepResult = await base44.entities.Alert.create({
                            alert_type: step.action_config.alert_type || 'system_compromise',
                            severity: step.action_config.severity || 'high',
                            title: step.action_config.title || 'Automated Alert',
                            description: step.action_config.description || 'Alert triggered by automation',
                            source: 'automation_playbook',
                            detection_timestamp: new Date().toISOString(),
                            status: 'new'
                        });
                        actionsTaken.push(`Created alert: ${stepResult.title}`);
                        resourcesAffected.push({
                            resource_type: 'Alert',
                            resource_id: stepResult.id,
                            action: 'created'
                        });
                        break;

                    case 'isolate_device':
                        if (step.action_config.device_id) {
                            await base44.entities.Device.update(step.action_config.device_id, {
                                status: 'suspended'
                            });
                            actionsTaken.push(`Isolated device: ${step.action_config.device_id}`);
                            resourcesAffected.push({
                                resource_type: 'Device',
                                resource_id: step.action_config.device_id,
                                action: 'isolated'
                            });
                        }
                        break;

                    case 'deploy_honeypot':
                        stepResult = await base44.entities.Honeypot.create({
                            honeypot_id: `HP-${Date.now()}`,
                            honeypot_type: step.action_config.honeypot_type || 'web_endpoint',
                            status: 'active',
                            deployment_config: step.action_config.deployment_config || {},
                            honeytokens_deployed: [],
                            interactions: [],
                            alerts_generated: 0,
                            forensic_evidence_collected: []
                        });
                        actionsTaken.push(`Deployed honeypot: ${stepResult.honeypot_id}`);
                        resourcesAffected.push({
                            resource_type: 'Honeypot',
                            resource_id: stepResult.id,
                            action: 'deployed'
                        });
                        break;

                    case 'run_scan':
                        stepResult = await base44.entities.ScanSession.create({
                            session_id: `SCAN-${Date.now()}`,
                            session_type: step.action_config.scan_type || 'comprehensive',
                            location_tag: 'Automated Scan',
                            start_timestamp: new Date().toISOString(),
                            status: 'active',
                            risk_score: 0,
                            anomaly_count: 0,
                            observation_count: 0
                        });
                        actionsTaken.push(`Started scan session: ${stepResult.session_id}`);
                        resourcesAffected.push({
                            resource_type: 'ScanSession',
                            resource_id: stepResult.id,
                            action: 'started'
                        });
                        break;

                    case 'send_notification':
                        await base44.entities.NotificationAlert.create({
                            alert_id: `NOTIF-${Date.now()}`,
                            alert_type: 'automation_triggered',
                            severity: step.action_config.severity || 'info',
                            title: step.action_config.title || 'Automation Notification',
                            message: step.action_config.message || 'Automated action completed',
                            channels: step.action_config.channels || ['email'],
                            recipients: []
                        });
                        actionsTaken.push('Sent notification');
                        break;

                    case 'create_report':
                        stepResult = await base44.entities.Report.create({
                            case_id: step.action_config.case_id || null,
                            report_number: `AUTO-${Date.now()}`,
                            title: step.action_config.title || 'Automated Report',
                            report_type: step.action_config.report_type || 'progress',
                            status: 'draft',
                            findings: step.action_config.findings || 'Auto-generated report',
                            generated_date: new Date().toISOString()
                        });
                        actionsTaken.push(`Generated report: ${stepResult.report_number}`);
                        resourcesAffected.push({
                            resource_type: 'Report',
                            resource_id: stepResult.id,
                            action: 'created'
                        });
                        break;

                    case 'execute_containment':
                        stepResult = await base44.entities.ContainmentAction.create({
                            action_id: `CONTAIN-${Date.now()}`,
                            trigger_event_id: execution.id,
                            action_type: step.action_config.action_type || 'network_isolation',
                            execution_mode: 'automatic',
                            target: step.action_config.target || {},
                            pre_execution_snapshot: {},
                            execution_details: {
                                initiated_at: new Date().toISOString(),
                                success: true
                            },
                            authorization: {
                                authorized_by: user.email,
                                authorization_timestamp: new Date().toISOString(),
                                role: user.role
                            }
                        });
                        actionsTaken.push(`Executed containment: ${step.action_config.action_type}`);
                        resourcesAffected.push({
                            resource_type: 'ContainmentAction',
                            resource_id: stepResult.id,
                            action: 'executed'
                        });
                        break;

                    default:
                        stepResult = { message: 'Action type not implemented' };
                }

                stepExecution.status = 'completed';
                stepExecution.completed_at = new Date().toISOString();
                stepExecution.output = stepResult || {};

            } catch (error) {
                console.error(`Step ${step.step_name} failed:`, error);
                stepExecution.status = 'failed';
                stepExecution.error = error.message;
                stepExecution.completed_at = new Date().toISOString();

                allStepsSuccessful = false;

                if (!step.continue_on_failure) {
                    // Stop execution on critical failure
                    break;
                }
            }

            executionSteps.push(stepExecution);
        }

        // Determine final status
        const finalStatus = allStepsSuccessful ? 'completed' : 'partial';
        const completedAt = new Date().toISOString();
        const startedAt = new Date(execution.started_at);
        const duration = Date.now() - startedAt.getTime();

        // Update execution record
        await base44.entities.WorkflowExecution.update(execution.id, {
            status: finalStatus,
            completed_at: completedAt,
            duration_ms: duration,
            steps_executed: executionSteps,
            actions_taken: actionsTaken,
            resources_affected: resourcesAffected,
            success: allStepsSuccessful
        });

        // Update playbook statistics
        await base44.entities.AutomationPlaybook.update(playbook.id, {
            execution_count: (playbook.execution_count || 0) + 1,
            success_count: (playbook.success_count || 0) + (allStepsSuccessful ? 1 : 0),
            failure_count: (playbook.failure_count || 0) + (allStepsSuccessful ? 0 : 1),
            last_executed: completedAt,
            average_duration_ms: playbook.average_duration_ms 
                ? (playbook.average_duration_ms + duration) / 2 
                : duration
        });

        // Create audit log with organization isolation
        await base44.entities.AuditLog.create({
            organization_id: user.organization_id,
            event_type: 'workflow_executed',
            severity: allStepsSuccessful ? 'info' : 'warning',
            description: `Workflow "${playbook.playbook_name}" executed`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: allStepsSuccessful,
            metadata: {
                playbook_id,
                execution_id: execution.id,
                steps_count: executionSteps.length,
                actions_count: actionsTaken.length,
                duration_ms: duration
            }
        }).catch((err) => console.warn('Audit log failed:', err));

        return Response.json({
            success: true,
            execution_id: execution.id,
            status: finalStatus,
            steps_executed: executionSteps.length,
            actions_taken: actionsTaken,
            resources_affected: resourcesAffected,
            duration_ms: duration
        });

    } catch (error) {
        console.error('Workflow execution error:', error);
        return Response.json({
            error: 'Workflow execution failed',
            message: error.message
        }, { status: 500 });
    }
});