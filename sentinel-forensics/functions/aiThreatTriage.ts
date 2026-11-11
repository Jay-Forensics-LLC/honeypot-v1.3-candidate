import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI THREAT TRIAGE BACKEND
 * Automated threat analysis and prioritization
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { threatId, threatData } = await req.json();

    // AI-powered analysis
    const analysis = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this cybersecurity threat and provide triage assessment:

Threat: ${JSON.stringify(threatData, null, 2)}

Provide comprehensive analysis including:
1. Confidence level (low/medium/high)
2. Immediate risks and potential impact
3. Investigation priority (critical/high/medium/low)
4. Containment recommendations
5. MITRE ATT&CK techniques
6. Estimated time to compromise`,
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          confidence: { type: 'string' },
          immediate_risks: { type: 'array', items: { type: 'string' } },
          potential_impact: { type: 'string' },
          investigation_priority: { type: 'string' },
          containment_actions: { type: 'array', items: { type: 'string' } },
          mitre_techniques: { type: 'array', items: { type: 'string' } },
          recommendation: { type: 'string' },
          estimated_ttc: { type: 'string' }
        }
      }
    });

    // Calculate priority score
    const severityScores = { critical: 40, high: 30, medium: 20, low: 10, info: 5 };
    let score = severityScores[threatData.severity] || 20;
    score += (threatData.threatScore || 0) * 0.3;
    
    const confidenceMultipliers = { high: 1.3, medium: 1.0, low: 0.7 };
    score *= confidenceMultipliers[analysis.confidence] || 1.0;
    
    const priorityScore = Math.min(100, Math.max(0, Math.round(score)));

    const triageResult = {
      threatId,
      timestamp: new Date().toISOString(),
      priorityScore,
      severity: priorityScore >= 80 ? 'critical' : priorityScore >= 60 ? 'high' : 
                priorityScore >= 40 ? 'medium' : 'low',
      confidence: analysis.confidence,
      recommendation: analysis.recommendation,
      containmentActions: analysis.containment_actions || [],
      investigationPriority: priorityScore >= 80 ? 'immediate' : 
                            priorityScore >= 60 ? 'urgent' : 'normal',
      aiAnalysis: analysis
    };

    // Log triage decision
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'threat_triaged',
      severity: triageResult.severity,
      description: `AI threat triage completed: ${threatId}`,
      user_id: user.email,
      resource_type: 'ThreatIntelligence',
      resource_id: threatId,
      action_performed: 'triage',
      success: true,
      metadata: {
        priorityScore: triageResult.priorityScore,
        confidence: triageResult.confidence,
        containmentActions: triageResult.containmentActions.length
      },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      timestamp: new Date().toISOString(),
      blockchain_hash: crypto.randomUUID()
    });

    return Response.json(triageResult);
  } catch (error) {
    console.error('Triage error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});