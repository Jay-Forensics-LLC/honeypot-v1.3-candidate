import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id, communication_type, context, recipient_name } = await req.json();

    if (!legal_case_id || !communication_type) {
      return Response.json({ 
        error: 'Missing required fields: legal_case_id, communication_type' 
      }, { status: 400 });
    }

    const caseData = await base44.asServiceRole.entities.LegalCase.filter({ id: legal_case_id });
    if (caseData.length === 0) {
      return Response.json({ error: 'Legal case not found' }, { status: 404 });
    }

    const legalCase = caseData[0];

    let prompt = '';

    if (communication_type === 'status_update') {
      prompt = `Draft a professional status update letter to client ${recipient_name || 'the client'} regarding ${legalCase.matter_title}.

Case Type: ${legalCase.case_type}
Current Status: ${legalCase.procedural_status}

Context and Recent Developments:
${context || 'General case status update'}

The communication should:
1. Provide clear, jargon-free updates on case progress
2. Explain any recent developments and their significance
3. Outline next steps and upcoming deadlines
4. Request any needed information or documents
5. Maintain professional but accessible tone

Format as a professional client letter.`;

    } else if (communication_type === 'document_request') {
      prompt = `Draft a document request letter to client ${recipient_name || 'the client'} for ${legalCase.matter_title}.

Case Type: ${legalCase.case_type}

Documents/Information Needed:
${context || 'Specify required documents'}

The request should:
1. Clearly identify each document or category of documents needed
2. Explain why each item is necessary for the case
3. Provide a reasonable deadline for production
4. Offer guidance on how to locate/organize the materials
5. Include confidentiality/privilege reminders

Format as a professional client document request letter.`;

    } else if (communication_type === 'demand_letter') {
      prompt = `Draft a demand letter regarding ${legalCase.matter_title}.

Case Type: ${legalCase.case_type}
Recipient: ${recipient_name || 'Opposing Party'}

Facts and Basis for Demand:
${context || 'State the factual basis and legal grounds'}

The demand letter should:
1. State the factual background clearly and persuasively
2. Identify legal violations or breaches
3. Specify damages or relief sought
4. Include deadline for response/compliance
5. Reference potential litigation if unresolved
6. Maintain professional but firm tone

Format as a formal demand letter.`;
    }

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false
    });

    // Save as attorney work product
    await base44.asServiceRole.entities.AttorneyWorkProduct.create({
      organization_id: user.organization_id,
      legal_case_id,
      attorney_email: user.email,
      document_type: communication_type === 'demand_letter' ? 'legal_memo' : 'witness_prep',
      title: `Client Communication - ${communication_type}`,
      content: response,
      privilege_asserted: communication_type !== 'demand_letter'
    });

    return Response.json({ 
      success: true,
      communication: response,
      message: 'Client communication generated and saved'
    });

  } catch (error) {
    console.error('Client communication generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});