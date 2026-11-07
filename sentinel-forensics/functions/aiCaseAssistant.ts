import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { case_id, query, mode = 'chat' } = await req.json();

    if (!case_id) {
      return Response.json({ error: 'case_id required' }, { status: 400 });
    }

    // Fetch case context
    const cases = await base44.entities.Case.filter({ id: case_id });
    if (!cases.length) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }
    const caseData = cases[0];

    // Fetch evidence for context
    const evidence = await base44.entities.EvidenceV2.filter({ case_id }, '-collection_timestamp', 50);
    const tags = await base44.entities.Tag.filter({ case_id });
    const existingFindings = await base44.entities.AIFinding.filter({ case_id }, '-detected_at', 20);
    const recommendations = await base44.entities.AIRecommendation.filter({ case_id }, '-generated_at', 10);

    // Build context for AI
    const evidenceSummary = evidence.map(e => ({
      id: e.id,
      title: e.title,
      type: e.evidence_type,
      description: e.description,
      collection_date: e.collection_timestamp,
      hash: e.sha256_hash,
      verified: e.integrity_verified,
      tags: e.tags || []
    }));

    const contextPayload = {
      case: {
        number: caseData.case_number,
        title: caseData.title,
        description: caseData.description,
        status: caseData.status,
        priority: caseData.priority
      },
      evidence_count: evidence.length,
      evidence_summary: evidenceSummary.slice(0, 10), // Limit for token efficiency
      tags: tags.map(t => t.name),
      existing_findings: existingFindings.map(f => ({
        type: f.finding_type,
        title: f.title,
        severity: f.severity
      })),
      recent_recommendations: recommendations.map(r => r.title)
    };

    let aiResponse;
    let citations = [];
    let suggestedActions = [];

    if (mode === 'chat') {
      // Chat query mode
      const prompt = `You are an expert digital forensics AI assistant analyzing case "${caseData.title}".

Case Context:
${JSON.stringify(contextPayload, null, 2)}

User Query: ${query}

Instructions:
- Answer the query based on available evidence
- Cite specific evidence IDs when relevant
- Be concise but thorough
- If evidence is insufficient, suggest what to collect
- Format response in clear sections

Provide your analysis in JSON format with:
{
  "answer": "your detailed response",
  "evidence_citations": ["evidence_id1", "evidence_id2"],
  "suggested_actions": ["action 1", "action 2"],
  "confidence": 85
}`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            answer: { type: "string" },
            evidence_citations: { type: "array", items: { type: "string" } },
            suggested_actions: { type: "array", items: { type: "string" } },
            confidence: { type: "number" }
          }
        }
      });

      aiResponse = result.answer;
      citations = result.evidence_citations || [];
      suggestedActions = result.suggested_actions || [];

    } else if (mode === 'analyze') {
      // Auto-analysis mode - find patterns and anomalies
      const prompt = `You are an expert digital forensics AI performing automated analysis on case "${caseData.title}".

Case Context:
${JSON.stringify(contextPayload, null, 2)}

Instructions:
- Identify suspicious patterns, anomalies, or critical findings
- Suggest investigative actions based on evidence
- Cross-reference MITRE ATT&CK techniques where applicable
- Prioritize findings by severity and confidence

Provide analysis in JSON format with:
{
  "findings": [
    {
      "finding_type": "anomaly|malware_signature|suspicious_pattern|exfiltration|etc",
      "severity": "critical|high|medium|low|info",
      "title": "brief title",
      "description": "detailed description",
      "evidence_ids": ["id1", "id2"],
      "confidence_score": 85,
      "indicators": ["IP: 1.2.3.4", "Hash: abc123"],
      "mitre_techniques": ["T1566.001"],
      "suggested_actions": ["action1", "action2"]
    }
  ],
  "recommendations": [
    {
      "recommendation_type": "evidence_collection|analysis|correlation|next_steps|legal_action|threat_hunt",
      "title": "recommendation title",
      "description": "detailed description",
      "rationale": "why this matters",
      "confidence_score": 90,
      "priority": "critical|high|medium|low"
    }
  ]
}`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            findings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  finding_type: { type: "string" },
                  severity: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                  evidence_ids: { type: "array", items: { type: "string" } },
                  confidence_score: { type: "number" },
                  indicators: { type: "array", items: { type: "string" } },
                  mitre_techniques: { type: "array", items: { type: "string" } },
                  suggested_actions: { type: "array", items: { type: "string" } }
                }
              }
            },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  recommendation_type: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                  rationale: { type: "string" },
                  confidence_score: { type: "number" },
                  priority: { type: "string" }
                }
              }
            }
          }
        }
      });

      // Save findings
      for (const finding of result.findings || []) {
        await base44.asServiceRole.entities.AIFinding.create({
          organization_id: user.organization_id,
          case_id,
          ...finding,
          detected_at: new Date().toISOString(),
          auto_tagged: true
        });
      }

      // Save recommendations
      for (const rec of result.recommendations || []) {
        await base44.asServiceRole.entities.AIRecommendation.create({
          organization_id: user.organization_id,
          case_id,
          ...rec,
          related_evidence_ids: [],
          generated_at: new Date().toISOString()
        });
      }

      return Response.json({
        success: true,
        findings: result.findings || [],
        recommendations: result.recommendations || []
      });
    }

    // Save conversation message
    const conversations = await base44.entities.CaseAIConversation.filter(
      { case_id, user_email: user.email, is_active: true },
      '-created_date',
      1
    );

    let conversation = conversations[0];
    if (!conversation) {
      conversation = await base44.asServiceRole.entities.CaseAIConversation.create({
        organization_id: user.organization_id,
        case_id,
        user_email: user.email,
        messages: [],
        context_snapshot: contextPayload,
        is_active: true
      });
    }

    const updatedMessages = [
      ...conversation.messages,
      {
        role: 'user',
        content: query,
        timestamp: new Date().toISOString(),
        evidence_citations: []
      },
      {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
        evidence_citations: citations
      }
    ];

    await base44.asServiceRole.entities.CaseAIConversation.update(conversation.id, {
      messages: updatedMessages
    });

    return Response.json({
      success: true,
      answer: aiResponse,
      citations,
      suggested_actions: suggestedActions,
      conversation_id: conversation.id
    });

  } catch (error) {
    console.error('AI assistant error:', error);
    return Response.json({
      error: 'AI assistant failed',
      details: error.message
    }, { status: 500 });
  }
});