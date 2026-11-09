import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * AI-Driven Security Posture Analysis
 * Analyzes endpoint compliance, vulnerabilities, and configuration drift
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { agent_id } = await req.json();

        if (!agent_id) {
            return Response.json({ error: 'agent_id is required' }, { status: 400 });
        }

        // Get agent data
        const agents = await base44.entities.EndpointAgent.filter({ agent_id });
        
        if (!agents || agents.length === 0) {
            return Response.json({ error: 'Agent not found' }, { status: 404 });
        }

        const agent = agents[0];

        // Gather security data
        const securityPosture = agent.security_posture || {};
        const healthMetrics = agent.health_metrics || {};
        const anomalies = agent.anomalies_detected || [];

        // Calculate compliance score (CIS benchmarks simulation)
        let complianceScore = 100;
        const complianceIssues = [];

        if (!securityPosture.firewall_enabled) {
            complianceScore -= 15;
            complianceIssues.push({
                benchmark: 'CIS 9.1',
                issue: 'Firewall disabled',
                severity: 'high',
                fix: 'Enable host-based firewall'
            });
        }

        if (!securityPosture.antivirus_enabled) {
            complianceScore -= 20;
            complianceIssues.push({
                benchmark: 'CIS 8.1',
                issue: 'Antivirus/EDR not active',
                severity: 'critical',
                fix: 'Install and enable endpoint protection'
            });
        }

        if (!securityPosture.encryption_enabled) {
            complianceScore -= 10;
            complianceIssues.push({
                benchmark: 'CIS 1.1',
                issue: 'Disk encryption disabled',
                severity: 'medium',
                fix: 'Enable BitLocker/FileVault/LUKS'
            });
        }

        if (!securityPosture.auto_updates_enabled) {
            complianceScore -= 10;
            complianceIssues.push({
                benchmark: 'CIS 2.3',
                issue: 'Automatic updates disabled',
                severity: 'medium',
                fix: 'Enable automatic security updates'
            });
        }

        if (securityPosture.known_vulnerabilities > 0) {
            complianceScore -= Math.min(25, securityPosture.known_vulnerabilities * 5);
        }

        // Determine risk level
        const riskLevel = complianceScore < 50 ? 'critical' :
                         complianceScore < 70 ? 'high' :
                         complianceScore < 85 ? 'medium' : 'low';

        // Use AI to generate remediation recommendations
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
        let aiRecommendations = [];

        if (anthropicKey) {
            const prompt = `As a cybersecurity expert, analyze this endpoint security posture and provide prioritized remediation recommendations:

ENDPOINT: ${agent.hostname} (${agent.platform} ${agent.os_version})
COMPLIANCE SCORE: ${complianceScore}/100
RISK LEVEL: ${riskLevel}

CURRENT STATE:
- Firewall: ${securityPosture.firewall_enabled ? 'Enabled' : 'DISABLED'}
- Antivirus: ${securityPosture.antivirus_enabled ? 'Enabled' : 'DISABLED'}
- Encryption: ${securityPosture.encryption_enabled ? 'Enabled' : 'DISABLED'}
- Auto-updates: ${securityPosture.auto_updates_enabled ? 'Enabled' : 'DISABLED'}
- Known Vulnerabilities: ${securityPosture.known_vulnerabilities || 0}
- Anomalies Detected: ${anomalies.length}

COMPLIANCE ISSUES:
${complianceIssues.map(issue => `- [${issue.severity.toUpperCase()}] ${issue.benchmark}: ${issue.issue}`).join('\n')}

TASK: Provide 5-7 prioritized, actionable remediation steps. For each step:
1. Explain WHY it's critical
2. Provide SPECIFIC commands/configuration changes
3. Estimate implementation time
4. Assess risk if not fixed

Return JSON array: [{priority, action, reasoning, implementation_steps, estimated_time_minutes, risk_if_ignored}]`;

            try {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': anthropicKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: 'claude-3-5-sonnet-20241022',
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
                    const jsonMatch = content.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        aiRecommendations = JSON.parse(jsonMatch[0]);
                    }
                }
            } catch (error) {
                console.error('AI recommendations failed:', error);
            }
        }

        // Update agent with posture analysis
        await base44.entities.EndpointAgent.update(agent.id, {
            security_posture: {
                ...securityPosture,
                compliance_score: complianceScore,
                risk_level: riskLevel,
                compliance_issues: complianceIssues,
                last_assessment: new Date().toISOString()
            },
            ai_posture_recommendations: aiRecommendations.length > 0 ? {
                analyzed_at: new Date().toISOString(),
                recommendations: aiRecommendations,
                compliance_score: complianceScore,
                risk_level: riskLevel
            } : null
        });

        return Response.json({
            success: true,
            agent_id,
            hostname: agent.hostname,
            compliance_score: complianceScore,
            risk_level: riskLevel,
            compliance_issues: complianceIssues,
            vulnerabilities: securityPosture.known_vulnerabilities || 0,
            ai_recommendations: aiRecommendations,
            benchmark: 'CIS Benchmarks',
            analyzed_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Posture analysis error:', error);
        return Response.json({
            error: 'Analysis failed',
            message: error.message
        }, { status: 500 });
    }
});