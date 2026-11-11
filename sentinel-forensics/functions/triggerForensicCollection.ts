
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Trigger Automated Forensic Collection
 * Collects forensic data from endpoints based on incident criteria
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { 
            agent_ids,
            incident_id,
            collection_profile 
        } = await req.json();

        if (!agent_ids || agent_ids.length === 0) {
            return Response.json({
                error: 'agent_ids is required',
                example: {
                    agent_ids: ['agent_123', 'agent_456'],
                    incident_id: 'incident_789',
                    collection_profile: 'comprehensive'
                }
            }, { status: 400 });
        }

        // Get incident details for AI suggestions
        let incidentType = 'unknown';
        let incidentSeverity = 'medium';
        
        if (incident_id) {
            const incidents = await base44.entities.IncidentResponse.filter({ 
                incident_id 
            });
            
            if (incidents.length > 0) {
                incidentType = incidents[0].incident_type;
                incidentSeverity = incidents[0].severity;
            }
        }

        // AI suggests forensic steps based on incident
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
        let suggestedSteps = [];
        
        if (anthropicKey) {
            const prompt = `As a digital forensics expert, suggest the most relevant forensic data to collect for this incident:

Incident Type: ${incidentType}
Severity: ${incidentSeverity}
Collection Profile: ${collection_profile || 'standard'}
Target Platform: Mixed (Windows, macOS, Linux)

Return JSON array of steps with: {step_type, priority, reasoning, data_to_collect}
Focus on: memory dumps, process lists, network connections, file artifacts, registry/config, logs`;

            try {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': anthropicKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: 'claude-3-5-sonnet-20240620', // Changed model from 20241022 to 20240620
                        max_tokens: 1024,
                        messages: [{
                            role: 'user',
                            content: prompt
                        }]
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const content = data.content[0].text;
                    const jsonMatch = content.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        suggestedSteps = JSON.parse(jsonMatch[0]);
                    }
                }
            } catch (error) {
                console.error('AI suggestion failed:', error);
            }
        }

        // Default forensic steps if AI unavailable
        if (suggestedSteps.length === 0) {
            const profiles = {
                quick: ['process_list', 'network_connections'],
                standard: ['process_list', 'network_connections', 'running_services', 'system_logs'],
                comprehensive: ['memory_dump', 'process_list', 'network_connections', 'disk_snapshot', 'system_logs', 'registry_export']
            };
            
            const steps = profiles[collection_profile] || profiles.standard;
            suggestedSteps = steps.map(step => ({
                step_type: step,
                priority: 'high',
                reasoning: 'Default collection profile',
                data_to_collect: step
            }));
        }

        // Dispatch collection commands to agents
        const commands = [];
        
        for (const agentId of agent_ids) {
            for (const step of suggestedSteps) {
                try {
                    const command = await base44.entities.AgentCommand.create({
                        device_id: agentId,
                        command_kind: 'snapshot.run',
                        params: {
                            collection_type: step.step_type,
                            priority: step.priority,
                            incident_id: incident_id || null,
                            ai_suggested: true
                        },
                        issued_at: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
                        counter: Date.now(),
                        status: 'queued',
                        issued_by: user.email
                    });
                    
                    commands.push({
                        agent_id: agentId,
                        command_id: command.id,
                        collection_type: step.step_type
                    });
                } catch (error) {
                    console.error(`Failed to create command for ${agentId}:`, error);
                }
            }
        }

        // Create forensic evidence bundle
        const evidenceBundle = await base44.entities.ForensicEvidence.create({
            evidence_bundle_id: `BUNDLE-${Date.now()}`,
            case_id: incident_id || 'ADHOC',
            collection_trigger: 'automated',
            evidence_types: suggestedSteps.map(s => s.step_type),
            collection_metadata: {
                agent_ids,
                collection_start: new Date().toISOString(),
                collection_profile: collection_profile || 'standard',
                ai_suggested_steps: suggestedSteps.length,
                incident_type: incidentType
            },
            chain_of_custody: [{
                timestamp: new Date().toISOString(),
                action: 'Automated forensic collection initiated',
                actor_id: user.email,
                actor_name: user.full_name,
                actor_role: user.role
            }],
            artifacts: [],
            legal_hold_status: incidentSeverity === 'critical',
            created_at: new Date().toISOString()
        });

        // Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'forensic_collection_triggered',
            severity: 'warning',
            description: `Automated forensic collection on ${agent_ids.length} agent(s)`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                agent_count: agent_ids.length,
                incident_id,
                evidence_bundle_id: evidenceBundle.id,
                ai_suggested_steps: suggestedSteps.length
            }
        });

        return Response.json({
            success: true,
            evidence_bundle_id: evidenceBundle.id,
            commands_dispatched: commands.length,
            agents_targeted: agent_ids.length,
            ai_suggested_steps: suggestedSteps,
            commands,
            estimated_collection_time_minutes: suggestedSteps.length * 5,
            message: `Forensic collection initiated on ${agent_ids.length} agent(s)`
        });

    } catch (error) {
        console.error('Forensic collection error:', error);
        return Response.json({
            error: 'Collection failed',
            message: error.message
        }, { status: 500 });
    }
});
