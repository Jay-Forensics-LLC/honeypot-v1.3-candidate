
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * AI Playbook Performance Analyzer
 * Analyzes past executions to identify bottlenecks and suggest optimizations
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { playbook_id } = await req.json();

        if (!playbook_id) {
            return Response.json({ 
                error: 'playbook_id is required' 
            }, { status: 400 });
        }

        // Get playbook and its executions
        const playbooks = await base44.entities.AutomationPlaybook.filter({ id: playbook_id });
        const playbook = playbooks[0];

        if (!playbook) {
            return Response.json({ error: 'Playbook not found' }, { status: 404 });
        }

        // Get recent executions
        const executions = await base44.entities.WorkflowExecution.filter(
            { workflow_id: playbook_id },
            '-started_at',
            50
        );

        if (executions.length < 3) {
            return Response.json({
                success: true,
                message: 'Insufficient execution history for analysis',
                min_executions_required: 3,
                current_executions: executions.length
            });
        }

        // Calculate performance metrics
        const stepPerformance = {};
        const stepFailures = {};
        
        executions.forEach(exec => {
            if (!exec.steps_executed) return;
            
            exec.steps_executed.forEach(step => {
                if (!stepPerformance[step.step_name]) {
                    stepPerformance[step.step_name] = {
                        total_duration: 0,
                        count: 0,
                        failures: 0,
                        successes: 0,
                        durations: []
                    };
                }
                
                const duration = new Date(step.completed_at) - new Date(step.started_at);
                stepPerformance[step.step_name].total_duration += duration;
                stepPerformance[step.step_name].count += 1;
                stepPerformance[step.step_name].durations.push(duration);
                
                if (step.status === 'failed') {
                    stepPerformance[step.step_name].failures += 1;
                } else if (step.status === 'completed') {
                    stepPerformance[step.step_name].successes += 1;
                }
            });
        });

        // Identify bottlenecks
        const bottlenecks = [];
        Object.entries(stepPerformance).forEach(([stepName, metrics]) => {
            const avgDuration = metrics.total_duration / metrics.count;
            const failureRate = metrics.failures / metrics.count;
            
            // Calculate standard deviation
            const mean = avgDuration;
            const variance = metrics.durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / metrics.count;
            const stdDev = Math.sqrt(variance);
            
            if (avgDuration > 30000 || failureRate > 0.2 || stdDev > mean * 0.5) {
                let optimization = '';
                
                if (avgDuration > 30000) {
                    optimization = 'Consider parallelizing or caching results for this step';
                } else if (failureRate > 0.2) {
                    optimization = 'High failure rate detected - add retry logic or error handling';
                } else if (stdDev > mean * 0.5) {
                    optimization = 'Inconsistent performance - investigate external dependencies';
                }
                
                bottlenecks.push({
                    step_name: stepName,
                    avg_duration_ms: Math.round(avgDuration),
                    failure_rate: parseFloat((failureRate * 100).toFixed(2)),
                    suggested_optimization: optimization,
                    variance_coefficient: parseFloat((stdDev / mean).toFixed(2))
                });
            }
        });

        // Use AI to suggest alternatives
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
        let aiSuggestions = [];
        
        if (anthropicKey && bottlenecks.length > 0) {
            const prompt = `Analyze this incident response playbook and suggest optimizations:

Playbook Type: ${playbook.playbook_type}
Steps: ${JSON.stringify(playbook.steps, null, 2)}
Execution Count: ${playbook.execution_count}
Success Rate: ${(playbook.success_count / playbook.execution_count * 100).toFixed(1)}%
Bottlenecks: ${JSON.stringify(bottlenecks, null, 2)}

Recent Execution Patterns:
${executions.slice(0, 10).map(e => `- ${e.status} in ${e.duration_ms}ms (${e.actions_taken?.length || 0} actions)`).join('\n')}

Suggest specific optimizations and alternative action sequences that would:
1. Reduce execution time
2. Improve success rate
3. Better handle similar incident types
4. Leverage real-time threat intelligence

Format as JSON array with: {original_action, suggested_action, reasoning, confidence, expected_improvement}`;

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-sonnet-20240620',
                    max_tokens: 2048,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const content = data.content[0].text;
                
                try {
                    const jsonMatch = content.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        aiSuggestions = JSON.parse(jsonMatch[0]);
                    }
                } catch (e) {
                    console.error('Failed to parse AI suggestions:', e);
                }
            }
        }

        // Calculate success patterns
        const successPatterns = executions
            .filter(e => e.status === 'completed')
            .map(e => ({
                incident_type: e.trigger_data?.incident_type,
                severity: e.trigger_data?.severity,
                actions: e.actions_taken,
                duration: e.duration_ms
            }));

        const insights = [];
        if (playbook.success_count > playbook.failure_count * 2) {
            insights.push('High success rate - current configuration is effective');
        }
        if (playbook.average_duration_ms && playbook.average_duration_ms < 60000) {
            insights.push('Fast execution time - playbook is efficient');
        }
        if (bottlenecks.length === 0) {
            insights.push('No significant bottlenecks detected');
        }

        // Update playbook with AI analysis
        await base44.entities.AutomationPlaybook.update(playbook.id, {
            ai_optimization: {
                last_analyzed: new Date().toISOString(),
                bottleneck_steps: bottlenecks,
                suggested_alternatives: aiSuggestions,
                success_pattern_insights: insights
            }
        });

        return Response.json({
            success: true,
            playbook_id,
            analysis: {
                executions_analyzed: executions.length,
                overall_success_rate: parseFloat((playbook.success_count / playbook.execution_count * 100).toFixed(2)),
                average_duration_ms: playbook.average_duration_ms,
                bottlenecks,
                ai_suggestions: aiSuggestions,
                success_patterns: insights
            },
            recommendations: {
                should_enable_auto_adjust: bottlenecks.length > 0,
                should_enable_learning: true,
                priority_fixes: bottlenecks.slice(0, 3).map(b => b.step_name)
            }
        });

    } catch (error) {
        console.error('Playbook analysis error:', error);
        return Response.json({ 
            error: 'Analysis failed', 
            message: error.message 
        }, { status: 500 });
    }
});
