import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { query, case_id } = await req.json();

    // Fetch all evidence and work products for the case
    const evidence = await base44.entities.EvidenceV2.filter({ case_id });
    const legalCase = await base44.entities.LegalCase.filter({ organization_id: user.organization_id });
    const workProducts = [];
    
    for (const lc of legalCase) {
      if (lc.forensic_case_ids?.includes(case_id)) {
        const wp = await base44.entities.AttorneyWorkProduct.filter({ legal_case_id: lc.id });
        workProducts.push(...wp);
      }
    }

    // Build context for AI search
    const searchContext = evidence.map(e => ({
      id: e.id,
      type: 'evidence',
      name: e.evidence_name,
      description: e.description,
      tags: e.tags
    })).concat(workProducts.map(wp => ({
      id: wp.id,
      type: 'work_product',
      title: wp.title,
      content: wp.content?.substring(0, 1000)
    })));

    const aiPrompt = `Given this natural language query: "${query}"
    
Search through these documents and return the most relevant matches with reasons:

${JSON.stringify(searchContext, null, 2)}

Return matches with relevance scores and explanations.`;

    const results = await base44.integrations.Core.InvokeLLM({
      prompt: aiPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                type: { type: "string" },
                relevance_score: { type: "number" },
                reason: { type: "string" }
              }
            }
          }
        }
      }
    });

    return Response.json({ success: true, results: results.matches });

  } catch (error) {
    console.error('Document search error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});