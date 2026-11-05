import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id, filing_content, filing_type } = await req.json();

    if (!legal_case_id || !filing_content) {
      return Response.json({ 
        error: 'Missing required fields: legal_case_id, filing_content' 
      }, { status: 400 });
    }

    const caseData = await base44.asServiceRole.entities.LegalCase.filter({ id: legal_case_id });
    if (caseData.length === 0) {
      return Response.json({ error: 'Legal case not found' }, { status: 404 });
    }

    const legalCase = caseData[0];

    const prompt = `Analyze opposing counsel's ${filing_type || 'filing'} in ${legalCase.matter_title}.

Case Type: ${legalCase.case_type}

Filing Content:
${filing_content}

Provide a comprehensive analysis including:

1. KEY ARGUMENTS
   - Identify the core legal arguments made
   - Summarize factual assertions

2. LEGAL AUTHORITIES CITED
   - Note significant cases, statutes, or rules cited
   - Assess relevance and strength of citations

3. WEAKNESSES AND VULNERABILITIES
   - Identify logical gaps or inconsistencies
   - Note unsupported factual claims
   - Highlight potentially distinguishable case law
   - Identify procedural defects

4. EVIDENTIARY ISSUES
   - Flag inadmissible evidence relied upon
   - Note missing foundation for key assertions
   - Identify hearsay or authentication problems

5. STRATEGIC ASSESSMENT
   - Evaluate overall strength of the filing
   - Suggest priority areas for response
   - Recommend counter-arguments

6. DISCOVERY IMPLICATIONS
   - Identify documents/witnesses they've revealed
   - Suggest targeted discovery requests

Format as a detailed legal memorandum with clear sections.`;

    const analysis = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false
    });

    // Parse structured analysis
    const structuredAnalysis = {
      key_arguments: [],
      legal_authorities: [],
      weaknesses: [],
      evidentiary_issues: [],
      strategic_assessment: '',
      discovery_implications: []
    };

    // Simple parsing - extract sections
    const sections = analysis.split(/\d+\.\s+[A-Z\s]+\n/);
    if (sections.length >= 6) {
      structuredAnalysis.key_arguments = sections[1]?.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().substring(1).trim()) || [];
      structuredAnalysis.legal_authorities = sections[2]?.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().substring(1).trim()) || [];
      structuredAnalysis.weaknesses = sections[3]?.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().substring(1).trim()) || [];
      structuredAnalysis.evidentiary_issues = sections[4]?.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().substring(1).trim()) || [];
      structuredAnalysis.strategic_assessment = sections[5]?.trim() || '';
      structuredAnalysis.discovery_implications = sections[6]?.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().substring(1).trim()) || [];
    }

    // Save as attorney work product
    await base44.asServiceRole.entities.AttorneyWorkProduct.create({
      organization_id: user.organization_id,
      legal_case_id,
      attorney_email: user.email,
      document_type: 'strategy_note',
      title: `Analysis - Opposing Counsel ${filing_type || 'Filing'}`,
      content: analysis,
      privilege_asserted: true
    });

    return Response.json({ 
      success: true,
      full_analysis: analysis,
      structured_analysis: structuredAnalysis,
      message: 'Filing analyzed and saved as privileged work product'
    });

  } catch (error) {
    console.error('Filing analysis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});