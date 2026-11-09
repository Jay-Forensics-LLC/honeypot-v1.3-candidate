import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id, motion_type, facts } = await req.json();

    const legalCase = await base44.entities.LegalCase.filter({ id: legal_case_id });
    if (!legalCase || legalCase.length === 0) {
      return Response.json({ error: 'Legal case not found' }, { status: 404 });
    }

    const caseData = legalCase[0];

    const evidenceGaps = facts.includes('Evidence Gaps:') 
      ? '\n\nKey Evidence Gaps to Address:\n' + facts.split('Evidence Gaps:')[1] 
      : '';

    const motionPrompts = {
      motion_to_compel: `Draft a comprehensive Motion to Compel Discovery for ${caseData.matter_title}.

Case Type: ${caseData.case_type}
Jurisdiction: ${caseData.jurisdiction?.court_name || 'District Court'}

Facts and Context:
${facts}
${evidenceGaps}

Include the following sections with proper legal formatting:
1. NOTICE OF MOTION
2. MEMORANDUM OF POINTS AND AUTHORITIES
   - Introduction
   - Statement of Facts
   - Legal Argument (cite FRCP 37 or state equivalent)
   - Addressing Evidence Gaps
3. DECLARATION OF COUNSEL
4. PROPOSED ORDER

Use realistic legal citations and formatting. Be specific about what discovery is being compelled and why it's relevant.`,

      motion_for_continuance: `Draft a Motion for Continuance for ${caseData.matter_title}.

Case Type: ${caseData.case_type}
Jurisdiction: ${caseData.jurisdiction?.court_name || 'District Court'}

Facts and Good Cause Showing:
${facts}
${evidenceGaps}

Include:
1. NOTICE OF MOTION
2. MEMORANDUM IN SUPPORT
   - Good cause showing
   - Prejudice analysis
   - Impact on case timeline
3. DECLARATION OF COUNSEL
4. PROPOSED ORDER

Demonstrate good cause and absence of prejudice to opposing party.`,

      motion_in_limine: `Draft a Motion in Limine for ${caseData.matter_title}.

Case Type: ${caseData.case_type}
Facts and Basis for Exclusion:
${facts}

Include:
1. NOTICE OF MOTION
2. MEMORANDUM OF POINTS AND AUTHORITIES
   - Evidence sought to be excluded
   - Legal basis (FRE 401, 402, 403, hearsay, etc.)
   - Prejudicial impact
   - Supporting case law
3. PROPOSED ORDER

Be specific about what evidence should be excluded and why it fails admissibility requirements.`,

      motion_for_summary_judgment: `Draft a Motion for Summary Judgment for ${caseData.matter_title}.

Case Type: ${caseData.case_type}
Facts and Undisputed Material Facts:
${facts}
${evidenceGaps}

Include:
1. NOTICE OF MOTION
2. STATEMENT OF UNDISPUTED MATERIAL FACTS
3. MEMORANDUM OF POINTS AND AUTHORITIES
   - Standard for summary judgment (FRCP 56)
   - No genuine dispute of material fact
   - Entitlement to judgment as a matter of law
   - Supporting authorities
4. PROPOSED ORDER

Demonstrate absence of genuine dispute and entitlement to judgment as a matter of law.`
    };

    const prompt = motionPrompts[motion_type] || `Draft a ${motion_type} for ${caseData.matter_title}. Facts: ${facts}`;

    const draftContent = await base44.integrations.Core.InvokeLLM({
      prompt: `${prompt}

Format as a professional legal document with proper sections, citations (use realistic format), and supporting arguments. Include placeholder fields for court name, case number, and dates.`
    });

    const workProduct = await base44.entities.AttorneyWorkProduct.create({
      organization_id: user.organization_id,
      legal_case_id,
      attorney_email: user.email,
      document_type: 'motion_draft',
      title: `Draft ${motion_type.replace(/_/g, ' ')}`,
      content: draftContent,
      privilege_asserted: true
    });

    return Response.json({
      success: true,
      work_product_id: workProduct.id,
      draft_preview: draftContent.substring(0, 500) + '...'
    });

  } catch (error) {
    console.error('Motion drafting error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});