import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Execute Forensic Workflow
 * Runs multi-step forensic investigation with AI optimization
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { workflow_id, target_agent_ids, case_id } = await req.json();

        if (!workflow_id || !target_agent_ids || target_agent_ids.length === 0) {
            return Response.json({
                error: 'workflow_id and target_agent_ids are required'
            }, { status: 400 });
        }

        // Get workflow template
        const workflows = await base44.entities.ForensicWorkflowTemplate.filter({ 
            template_id: workflow_id 
        });

        if (!workflows || workflows.length === 0) {
            return Response.json({ error: 'Workflow not found' }, { status: 404 });
        }

        const workflow = workflows[0];

        // Create forensic evidence bundle
        const evidenceBundle = await base44.entities.ForensicEvidence.create({
            evidence_bundle_id: `WORKFLOW-${Date.now()}`,
            case_id: case_id || 'ADHOC',
            collection_trigger: 'workflow_automated',
            evidence_types: workflow.workflow_steps.map(s => s.step_type),
            collection_metadata: {
                workflow_id,
                workflow_name: workflow.template_name,
                target_agents: target_agent_ids,
                collection_start: new Date().toISOString(),
                initiated_by: user.email
            },
            chain_of_custody: [{
                timestamp: new Date().toISOString(),
                action: `Workflow "${workflow.template_name}" initiated`,
                actor_id: user.email,
                actor_name: user.full_name,
                actor_role: user.role
            }],
            artifacts: [],
            created_at: new Date().toISOString()
        });

        // Dispatch commands for each step on each agent
        const commands = [];
        
        for (const agent_id of target_agent_ids) {
            for (const step of workflow.workflow_steps) {
                try {
                    const command = await base44.entities.AgentCommand.create({
                        device_id: agent_id,
                        command_kind: 'snapshot.run',
                        params: {
                            collection_type: step.step_type,
                            step_name: step.step_name,
                            workflow_id,
                            evidence_bundle_id: evidenceBundle.evidence_bundle_id,
                            timeout: step.timeout_seconds,
                            retry: step.retry_on_failure,
                            action_config: step.action_config
                        },
                        issued_at: new Date().toISOString(),
                        expires_at: new Date(Date.now() + (step.timeout_seconds * 1000)).toISOString(),
                        counter: Date.now(),
                        status: 'queued',
                        issued_by: user.email
                    });

                    commands.push({
                        agent_id,
                        command_id: command.id,
                        step_name: step.step_name
                    });
                } catch (error) {
                    console.error(`Failed to create command for ${agent_id}, step ${step.step_name}:`, error);
                }
            }
        }

        // Update workflow execution count
        await base44.entities.ForensicWorkflowTemplate.update(workflow.id, {
            execution_count: (workflow.execution_count || 0) + 1,
            last_executed: new Date().toISOString()
        });

        // Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'forensic_workflow_executed',
            severity: 'warning',
            description: `Workflow "${workflow.template_name}" executed on ${target_agent_ids.length} agent(s)`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                workflow_id,
                agent_count: target_agent_ids.length,
                step_count: workflow.workflow_steps.length,
                evidence_bundle_id: evidenceBundle.evidence_bundle_id
            }
        });

        return Response.json({
            success: true,
            evidence_bundle_id: evidenceBundle.evidence_bundle_id,
            commands_dispatched: commands.length,
            agents_targeted: target_agent_ids.length,
            workflow_steps: workflow.workflow_steps.length,
            estimated_completion_minutes: Math.ceil((workflow.workflow_steps.length * workflow.workflow_steps[0]?.timeout_seconds || 300) / 60),
            commands
        });

    } catch (error) {
        console.error('Workflow execution error:', error);
        return Response.json({
            error: 'Workflow execution failed',
            message: error.message
        }, { status: 500 });
    }
});