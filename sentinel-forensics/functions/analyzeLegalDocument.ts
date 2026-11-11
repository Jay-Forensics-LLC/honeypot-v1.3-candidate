import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id, document_name, document_type, document_content } = await req.json();

    const analysisPrompt = `You are a legal AI assistant analyzing a ${document_type}. Analyze the following legal document and provide:

1. Key Arguments: Identify the main legal arguments presented
2. Evidence Gaps: Highlight areas where evidence is weak or missing
3. Discovery Issues: Identify potential discovery problems or opportunities
4. Relevant Case Law: Suggest relevant legal precedents (provide realistic citation format)
5. Suggested Responses: Provide strategic response recommendations

Document:
${document_content}

Provide a structured JSON response with these exact keys: key_arguments, evidence_gaps, discovery_issues, relevant_case_law (array of objects with citation and relevance), suggested_responses`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          key_arguments: { type: "array", items: { type: "string" } },
          evidence_gaps: { type: "array", items: { type: "string" } },
          discovery_issues: { type: "array", items: { type: "string" } },
          relevant_case_law: { 
            type: "array", 
            items: { 
              type: "object",
              properties: {
                citation: { type: "string" },
                relevance: { type: "string" }
              }
            }
          },
          suggested_responses: { type: "array", items: { type: "string" } }
        }
      }
    });

    const analysis = await base44.entities.LegalDocumentAnalysis.create({
      organization_id: user.organization_id,
      legal_case_id,
      document_name,
      document_type,
      analysis_results: aiResponse,
      ai_confidence_score: 85
    });

    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'legal_document_analyzed',
      resource_type: 'legal_document',
      timestamp: new Date().toISOString(),
      details: { legal_case_id, document_name, document_type }
    });

    return Response.json({
      success: true,
      analysis_id: analysis.id,
      results: aiResponse
    });

  } catch (error) {
    console.error('Legal document analysis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});