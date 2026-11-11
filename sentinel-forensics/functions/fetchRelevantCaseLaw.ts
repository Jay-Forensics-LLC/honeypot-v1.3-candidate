import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_issue, jurisdiction, evidence_context } = await req.json();

    // Use AI with web search to find relevant case law
    const prompt = `Find relevant case law for this legal issue: ${legal_issue}

Jurisdiction: ${jurisdiction || 'Federal'}
Evidence context: ${evidence_context}

Provide 5-7 relevant cases with:
1. Citation (realistic format)
2. Holding
3. Relevance to this issue
4. Key quotations`;

    const caseLawResults = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          cases: {
            type: "array",
            items: {
              type: "object",
              properties: {
                citation: { type: "string" },
                case_name: { type: "string" },
                holding: { type: "string" },
                relevance: { type: "string" },
                key_quotes: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    });

    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'case_law_research',
      resource_type: 'legal_research',
      timestamp: new Date().toISOString(),
      details: { legal_issue, jurisdiction }
    });

    return Response.json({ success: true, cases: caseLawResults.cases });

  } catch (error) {
    console.error('Case law fetch error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});