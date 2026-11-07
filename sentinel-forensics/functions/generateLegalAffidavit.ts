import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id, affiant_name, affiant_title, findings } = await req.json();

    const legalCase = await base44.entities.LegalCase.filter({ id: legal_case_id });
    if (!legalCase || legalCase.length === 0) {
      return Response.json({ error: 'Legal case not found' }, { status: 404 });
    }

    const caseData = legalCase[0];

    // Generate affidavit content
    const affidavit = `
AFFIDAVIT OF ${affiant_name.toUpperCase()}

STATE OF [STATE]
COUNTY OF [COUNTY]

I, ${affiant_name}, being first duly sworn, depose and state as follows:

1. QUALIFICATIONS AND BACKGROUND

I am currently employed as ${affiant_title}. I have personal knowledge of the facts stated in this affidavit and, if called as a witness, I could and would testify competently to them.

2. NATURE OF INVESTIGATION

This affidavit is submitted in support of ${caseData.matter_title}, Case No. ${caseData.case_number || 'pending'}.

3. FORENSIC METHODOLOGY

All digital evidence referenced herein was collected, preserved, and analyzed using forensically sound methods in accordance with:
- National Institute of Standards and Technology (NIST) Special Publication 800-86
- Scientific Working Group on Digital Evidence (SWGDE) best practices
- ISO/IEC 27037 standards for digital evidence identification, collection, and preservation

4. FINDINGS

${findings.map((finding, idx) => `${idx + 1}. ${finding}`).join('\n\n')}

5. CHAIN OF CUSTODY

All evidence referenced in this affidavit has been maintained under strict chain of custody protocols. Hash values and timestamps are available for verification.

6. DECLARATION

I declare under penalty of perjury that the foregoing is true and correct.

Executed this ___ day of _________, 20__.


_______________________________
${affiant_name}
${affiant_title}


Subscribed and sworn to before me this ___ day of _________, 20__.


_______________________________
Notary Public
My Commission Expires: __________
`;

    // Store as report
    const report = await base44.entities.Report.create({
      organization_id: user.organization_id,
      case_id: caseData.forensic_case_ids?.[0] || legal_case_id,
      report_number: `AFF-${Date.now()}`,
      title: `Affidavit of ${affiant_name}`,
      report_type: 'expert_testimony',
      status: 'draft',
      findings: affidavit,
      generated_date: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      affidavit_id: report.id,
      content: affidavit
    });

  } catch (error) {
    console.error('Affidavit generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});