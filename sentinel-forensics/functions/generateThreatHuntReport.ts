
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Generate AI-powered threat hunting report
 * Summarizes findings and recommends actions
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { huntId } = await req.json();

    // Get hunt details
    const hunts = await base44.asServiceRole.entities.ThreatHunt.filter({ hunt_id: huntId });
    if (!hunts || hunts.length === 0) {
      return Response.json({ error: 'Hunt not found' }, { status: 404 });
    }
    const hunt = hunts[0];

    // Build report context
    const context = {
      hunt_name: hunt.hunt_name,
      hunt_type: hunt.hunt_type,
      status: hunt.status,
      findings: hunt.findings || [],
      scope: hunt.scope,
      execution_metrics: hunt.execution_metrics
    };

    // Generate comprehensive report using AI
    const prompt = `You are a cybersecurity analyst. Generate a comprehensive threat hunting report based on the following hunt results.

Hunt Details:
- Name: ${context.hunt_name}
- Type: ${context.hunt_type}
- Status: ${context.status}
- Findings: ${context.findings.length}

Findings Summary:
${context.findings.map((f, i) => `
${i + 1}. ${f.description}
   Severity: ${f.severity}
   Confidence: ${f.confidence_score}%
   IOCs: ${f.iocs?.length || 0}
`).join('\n')}

Execution Metrics:
- Duration: ${context.execution_metrics?.duration_seconds} seconds
- Data Processed: ${context.execution_metrics?.data_processed_bytes} bytes
- Alerts Generated: ${context.execution_metrics?.alerts_generated}
- False Positives: ${context.execution_metrics?.false_positives}

Generate a professional threat hunting report with:
1. Executive Summary (2-3 sentences)
2. Key Findings (prioritized by severity)
3. IOC Summary (categorized by type)
4. Threat Assessment (what was discovered)
5. Recommended Actions (immediate and long-term)
6. MITRE ATT&CK Mapping (techniques observed)
7. Conclusion and Next Steps

Format as structured JSON.`;

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          executive_summary: { type: 'string' },
          key_findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                severity: { type: 'string' },
                description: { type: 'string' },
                impact: { type: 'string' }
              }
            }
          },
          ioc_summary: {
            type: 'object',
            properties: {
              total_iocs: { type: 'number' },
              by_type: { type: 'object' },
              critical_iocs: { type: 'array', items: { type: 'string' } }
            }
          },
          threat_assessment: {
            type: 'object',
            properties: {
              overall_risk: { type: 'string' },
              compromised_systems: { type: 'number' },
              attack_vectors: { type: 'array', items: { type: 'string' } },
              persistence_found: { type: 'boolean' }
            }
          },
          recommended_actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                priority: { type: 'string' },
                timeframe: { type: 'string' },
                responsible_team: { type: 'string' }
              }
            }
          },
          mitre_mapping: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                technique_id: { type: 'string' },
                technique_name: { type: 'string' },
                tactic: { type: 'string' }
              }
            }
          },
          conclusion: { type: 'string' },
          next_steps: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    });

    // Store report
    const reportId = `HUNT-REPORT-${Date.now()}`;
    await base44.asServiceRole.entities.Report.create({
      case_id: hunt.hunt_id,
      report_number: reportId,
      title: `Threat Hunt Report: ${hunt.hunt_name}`,
      report_type: 'expert_testimony',
      status: 'draft',
      findings: JSON.stringify(response, null, 2),
      methodology: `AI-powered threat hunting analysis using ${hunt.hunt_type} methodology`,
      conclusions: response.conclusion,
      recommendations: response.next_steps?.join('\n') || '',
      generated_date: new Date().toISOString().split('T')[0]
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'threat_hunt_report_generated',
      severity: 'info',
      description: `AI threat hunting report generated for hunt ${hunt.hunt_name}`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        hunt_id: huntId,
        report_id: reportId,
        findings_count: context.findings.length
      }
    });

    return Response.json({
      success: true,
      report_id: reportId,
      report: response
    });
  } catch (error) {
    console.error('Report generation error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});
