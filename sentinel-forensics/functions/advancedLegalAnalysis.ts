import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { analysis_type, content, case_type, evidence_gaps } = await req.json();

    let prompt, schema;

    switch (analysis_type) {
      case 'extract_terms':
        prompt = `Extract all defined terms from this legal document. Identify terms that are explicitly defined (e.g., "hereinafter referred to as", "means", "shall mean"). Return each term with its definition.\n\nDocument:\n${content}`;
        schema = {
          type: "object",
          properties: {
            defined_terms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  term: { type: "string" },
                  definition: { type: "string" },
                  first_appearance: { type: "string" }
                }
              }
            }
          }
        };
        break;

      case 'summarize_deposition':
        prompt = `Summarize this deposition transcript. Identify: 1) Key witness statements, 2) Admissions or damaging statements, 3) Inconsistencies or evasions, 4) Critical evidence references.\n\nTranscript:\n${content}`;
        schema = {
          type: "object",
          properties: {
            summary: { type: "string" },
            key_statements: { type: "array", items: { type: "string" } },
            admissions: { type: "array", items: { type: "string" } },
            inconsistencies: { type: "array", items: { type: "string" } },
            evidence_references: { type: "array", items: { type: "string" } }
          }
        };
        break;

      case 'generate_discovery':
        prompt = `Generate discovery requests for a ${case_type} case. Address these evidence gaps: ${evidence_gaps.join(', ')}. Include: 1) Interrogatories, 2) Document requests, 3) Requests for admission.\n\nProvide specific, targeted requests.`;
        schema = {
          type: "object",
          properties: {
            interrogatories: { type: "array", items: { type: "string" } },
            document_requests: { type: "array", items: { type: "string" } },
            requests_for_admission: { type: "array", items: { type: "string" } }
          }
        };
        break;

      case 'sentiment_analysis':
        prompt = `Analyze the tone and confidence level of opposing counsel's arguments. Identify: 1) Confidence level (high/medium/low), 2) Weak points or hedging language, 3) Aggressive vs. defensive posture, 4) Potential vulnerabilities.\n\nArgument:\n${content}`;
        schema = {
          type: "object",
          properties: {
            confidence_level: { type: "string" },
            tone: { type: "string" },
            weak_points: { type: "array", items: { type: "string" } },
            hedging_language: { type: "array", items: { type: "string" } },
            posture: { type: "string" },
            vulnerabilities: { type: "array", items: { type: "string" } }
          }
        };
        break;

      default:
        return Response.json({ error: 'Invalid analysis type' }, { status: 400 });
    }

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: schema
    });

    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'advanced_legal_analysis',
      resource_type: 'legal_analysis',
      timestamp: new Date().toISOString(),
      details: { analysis_type }
    });

    return Response.json({ success: true, result });

  } catch (error) {
    console.error('Advanced legal analysis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});