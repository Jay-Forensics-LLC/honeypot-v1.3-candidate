import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caseId, analysisType } = await req.json();
    
    // Get case data
    const cases = await base44.entities.Case.filter({ id: caseId });
    const caseData = cases[0];
    
    if (!caseData) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }

    // Get existing evidence for the case
    const evidence = await base44.entities.Evidence.filter({ case_id: caseId });
    
    // Get all cases for historical analysis
    const allCases = await base44.entities.Case.list('-created_date', 100);

    let result = {};

    if (analysisType === 'suggest_evidence') {
      // AI-powered evidence suggestions
      const prompt = `You are a forensic investigation expert. Analyze this case and suggest specific evidence types that should be collected.

Case Details:
- Title: ${caseData.title}
- Type: ${caseData.case_type}
- Priority: ${caseData.priority}
- Description: ${caseData.description || 'No description'}

Already Collected Evidence:
${evidence.map(e => `- ${e.title} (${e.evidence_type})`).join('\n') || 'None yet'}

Provide 5 specific evidence items that should be collected for this case. For each suggestion, provide:
1. Evidence title (specific and actionable)
2. Evidence type (from: file, network_capture, device_log, screenshot, metadata, forensic_image, memory_dump, other)
3. Why it's important (1 sentence)
4. Collection priority (high, medium, low)

Format as JSON array.`;

      const aiResult = await base44.asServiceRole.functions.invoke('aiOrchestrator', {
        orgId: user.organization_id,
        userId: user.email,
        taskType: 'evidence_suggestion',
        sensitivity: 'medium',
        costTier: user.subscription_tier || 'free',
        latencyToleranceMs: 10000,
        input: {
          prompt,
          context: { caseData, evidence },
          rawDataRefs: evidence.map(e => e.id)
        },
        response_json_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  evidence_type: { type: "string" },
                  rationale: { type: "string" },
                  priority: { type: "string" }
                }
              }
            }
          }
        }
      });

      const aiResponse = aiResult.data.response;

      result.suggestions = aiResponse.suggestions || [];
    }

    if (analysisType === 'predict_timeline') {
      // AI-powered timeline prediction
      const historicalData = allCases
        .filter(c => c.status === 'closed' && c.case_type === caseData.case_type)
        .map(c => {
          const start = new Date(c.start_date || c.created_date);
          const end = new Date(c.end_date || c.updated_date);
          const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
          return { priority: c.priority, days };
        });

      const prompt = `You are a forensic case analyst. Based on historical case data, predict the closure timeline for this case.

Current Case:
- Type: ${caseData.case_type}
- Priority: ${caseData.priority}
- Status: ${caseData.status}
- Evidence Collected: ${evidence.length} items
- Created: ${caseData.start_date || caseData.created_date}

Historical Data for ${caseData.case_type} cases:
${historicalData.length > 0 ? historicalData.map(h => `Priority: ${h.priority}, Days to close: ${h.days}`).join('\n') : 'No historical data available'}

Provide:
1. Estimated days to completion
2. Confidence level (high/medium/low)
3. Key milestones (array of milestone objects with name and estimated_days)
4. Risk factors that could delay closure (array of strings)

Format as JSON.`;

      const aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            estimated_days: { type: "number" },
            confidence: { type: "string" },
            milestones: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  estimated_days: { type: "number" }
                }
              }
            },
            risk_factors: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      });

      result.timeline = aiResponse;
    }

    if (analysisType === 'generate_report') {
      // AI-powered incident report generation
      if (caseData.status !== 'closed' && caseData.status !== 'archived') {
        return Response.json({ error: 'Case must be closed to generate report' }, { status: 400 });
      }

      const prompt = `You are a forensic investigator writing an incident report. Generate a professional incident report for this case.

Case Information:
- Case Number: ${caseData.case_number}
- Title: ${caseData.title}
- Type: ${caseData.case_type}
- Priority: ${caseData.priority}
- Status: ${caseData.status}
- Description: ${caseData.description || 'No description'}
- Start Date: ${caseData.start_date || caseData.created_date}
- End Date: ${caseData.end_date || caseData.updated_date}
- Investigator: ${caseData.assigned_investigator}

Evidence Collected:
${evidence.map(e => `- ${e.title} (${e.evidence_type}): ${e.description || 'No description'}`).join('\n')}

Generate a comprehensive incident report with these sections:
1. Executive Summary (2-3 paragraphs)
2. Incident Overview (timeline, scope, impact)
3. Investigation Methodology (how the case was investigated)
4. Findings (key discoveries from evidence)
5. Technical Analysis (detailed technical findings)
6. Conclusions (what was determined)
7. Recommendations (specific actions to prevent future incidents)

Format as structured JSON with each section as a property.`;

      const aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            executive_summary: { type: "string" },
            incident_overview: { type: "string" },
            methodology: { type: "string" },
            findings: { type: "string" },
            technical_analysis: { type: "string" },
            conclusions: { type: "string" },
            recommendations: { type: "string" }
          }
        }
      });

      // Create audit log for report generation
      await base44.entities.AuditLog.create({
        event_type: 'report_generated',
        severity: 'info',
        description: `AI-generated incident report for case ${caseData.case_number}`,
        user_id: user.email,
        success: true,
        metadata: { case_id: caseId }
      });

      result.report = aiResponse;
    }

    return Response.json(result);
  } catch (error) {
    console.error('AI Case Analysis Error:', error);
    return Response.json({ 
      error: error.message || 'Analysis failed',
      details: error.toString()
    }, { status: 500 });
  }
});