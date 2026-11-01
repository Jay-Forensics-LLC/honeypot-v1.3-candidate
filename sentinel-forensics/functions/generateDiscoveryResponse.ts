import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id, discovery_type, requests, case_facts } = await req.json();

    if (!legal_case_id || !discovery_type || !requests) {
      return Response.json({ 
        error: 'Missing required fields: legal_case_id, discovery_type, requests' 
      }, { status: 400 });
    }

    const caseData = await base44.asServiceRole.entities.LegalCase.filter({ id: legal_case_id });
    if (caseData.length === 0) {
      return Response.json({ error: 'Legal case not found' }, { status: 404 });
    }

    const legalCase = caseData[0];

    const prompt = `Generate professional responses to discovery requests for ${legalCase.matter_title}.

Case Type: ${legalCase.case_type}
Jurisdiction: ${legalCase.jurisdiction?.court_name || 'District Court'}
Discovery Type: ${discovery_type}

Requests to Respond To:
${requests}

${case_facts ? `Case Facts and Context:\n${case_facts}\n` : ''}

Generate comprehensive, professional responses that:
1. Include appropriate objections where applicable (relevance, overbroad, privileged, etc.)
2. Provide substantive responses where no valid objection exists
3. Use proper legal formatting and citation where needed
4. Include standard protective language (without waiving objections, subject to protective order, etc.)

Format each response with the request number followed by objections (if any) and substantive response.`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false
    });

    // Save as attorney work product
    await base44.asServiceRole.entities.AttorneyWorkProduct.create({
      organization_id: user.organization_id,
      legal_case_id,
      attorney_email: user.email,
      document_type: 'legal_memo',
      title: `Discovery Responses - ${discovery_type}`,
      content: response,
      privilege_asserted: true
    });

    return Response.json({ 
      success: true,
      responses: response,
      message: 'Discovery responses generated and saved as privileged work product'
    });

  } catch (error) {
    console.error('Discovery response generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});