import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { case_id, view_mode = 'legal' } = await req.json();

    if (!case_id) {
      return Response.json({ error: 'case_id required' }, { status: 400 });
    }

    // Fetch case
    const cases = await base44.entities.Case.filter({ id: case_id });
    if (!cases.length) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }
    const caseData = cases[0];

    // Fetch evidence
    const evidence = await base44.entities.EvidenceV2.filter({ case_id });
    
    // Fetch disclosure readiness
    const readiness = await base44.entities.DisclosureReadiness.filter(
      { case_id },
      '-assessed_at',
      1
    );

    // Fetch chain of custody logs
    const chainLogs = await base44.entities.ChainOfCustodyLog.filter({ case_id });

    // Fetch exhibit assignments
    const exhibits = await base44.entities.ExhibitAssignment.filter({ case_id });

    let summary;

    if (view_mode === 'legal') {
      // Legal-friendly summary - plain language, no technical jargon
      const prompt = `You are a legal assistant preparing a case summary for attorneys.

Case: ${caseData.title}
Description: ${caseData.description}
Status: ${caseData.status}
Evidence Count: ${evidence.length}
Verified Evidence: ${evidence.filter(e => e.integrity_verified).length}
Chain of Custody Complete: ${chainLogs.length > 0 ? 'Yes' : 'No'}
Exhibits Assigned: ${exhibits.length}

Disclosure Readiness: ${readiness[0] ? readiness[0].overall_score + '/100' : 'Not assessed'}

Instructions:
- Create a concise legal summary suitable for attorneys
- Use plain language, avoid technical forensic jargon
- Focus on evidentiary strength, chain of custody, and legal readiness
- Highlight any admissibility concerns
- Format for legal review

Provide summary in JSON:
{
  "executive_summary": "brief overview",
  "evidence_overview": "evidence count and reliability",
  "chain_of_custody_status": "custody integrity summary",
  "legal_readiness": "disclosure and court readiness",
  "admissibility_concerns": ["concern 1", "concern 2"],
  "recommended_actions": ["action 1", "action 2"]
}`;

      summary = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            executive_summary: { type: "string" },
            evidence_overview: { type: "string" },
            chain_of_custody_status: { type: "string" },
            legal_readiness: { type: "string" },
            admissibility_concerns: { type: "array", items: { type: "string" } },
            recommended_actions: { type: "array", items: { type: "string" } }
          }
        }
      });

    } else {
      // Technical summary - detailed forensic analysis
      const prompt = `You are a senior forensic analyst preparing a technical case summary.

Case: ${caseData.title}
Evidence: ${evidence.length} items
Types: ${[...new Set(evidence.map(e => e.evidence_type))].join(', ')}
Verified: ${evidence.filter(e => e.integrity_verified).length}/${evidence.length}

Instructions:
- Create detailed technical summary for forensic investigators
- Include methodology, tools, and technical findings
- Focus on forensic integrity and analysis depth
- Identify technical gaps or needed analysis

Provide summary in JSON:
{
  "technical_overview": "detailed technical summary",
  "evidence_analysis": "forensic analysis status",
  "integrity_status": "verification and hashing status",
  "identified_patterns": ["pattern 1", "pattern 2"],
  "recommended_forensic_actions": ["action 1", "action 2"]
}`;

      summary = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            technical_overview: { type: "string" },
            evidence_analysis: { type: "string" },
            integrity_status: { type: "string" },
            identified_patterns: { type: "array", items: { type: "string" } },
            recommended_forensic_actions: { type: "array", items: { type: "string" } }
          }
        }
      });
    }

    return Response.json({
      success: true,
      summary,
      view_mode
    });

  } catch (error) {
    console.error('Case summary generation error:', error);
    return Response.json({
      error: 'Summary generation failed',
      details: error.message
    }, { status: 500 });
  }
});