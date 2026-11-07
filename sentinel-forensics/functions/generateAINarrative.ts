import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { case_id, audience = 'technical', sections = [] } = await req.json();

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
    
    // Fetch timeline events
    const timelineResults = await base44.entities.TimelineEvent.filter({ case_id }, 'event_timestamp').catch(() => []);
    const timeline = timelineResults || [];

    // Fetch IOCs
    const iocResults = await base44.entities.IOCIndicator.filter({ case_id }).catch(() => []);
    const iocs = iocResults || [];

    // Fetch AI findings
    const findingsResults = await base44.entities.AIFinding.filter({ case_id }, '-detected_at').catch(() => []);
    const findings = findingsResults || [];

    // Fetch chain of custody
    const chainResults = await base44.entities.ChainOfCustodyLog.filter({ case_id }).catch(() => []);
    const chainLogs = chainResults || [];

    // Fetch compliance reports
    const compliance = await base44.entities.ComplianceReport.filter(
      { case_id },
      '-assessed_at',
      1
    );

    // Build audience-specific prompt
    let audienceInstructions = '';
    if (audience === 'executive') {
      audienceInstructions = `
      - Write for C-level executives
      - Use plain business language, avoid technical jargon
      - Focus on impact, risk, and recommendations
      - Keep technical details minimal
      - Emphasize business continuity and compliance
      `;
    } else if (audience === 'legal') {
      audienceInstructions = `
      - Write for attorneys and legal counsel
      - Use formal legal language
      - Emphasize chain of custody, admissibility, and statutory compliance
      - Reference relevant statutes (F.S. 90.803, FRE 803)
      - Include exhibits and evidence references
      - Focus on defensibility and courtroom readiness
      `;
    } else {
      audienceInstructions = `
      - Write for forensic investigators and technical analysts
      - Use technical terminology appropriately
      - Include methodology, tools, and technical findings
      - Provide detailed analysis and technical depth
      - Reference IOCs, hashes, and forensic artifacts
      `;
    }

    const prompt = `You are an expert forensic investigator writing a professional investigation report.

**CASE INFORMATION:**
- Case: ${caseData.title}
- Case Number: ${caseData.case_number}
- Type: ${caseData.case_type}
- Status: ${caseData.status}
- Priority: ${caseData.priority}
- Description: ${caseData.description}
- Created: ${caseData.created_date}

**EVIDENCE COLLECTED:**
- Total Evidence Items: ${evidence.length}
- Verified Evidence: ${evidence.filter(e => e.integrity_verified || e.is_verified).length}
- Evidence Types: ${[...new Set(evidence.map(e => e.evidence_type))].join(', ')}

**KEY EVIDENCE:**
${evidence.slice(0, 5).map(e => `- ${e.title} (${e.evidence_type}): ${e.description || 'No description'}`).join('\n')}

**TIMELINE:**
${timeline.slice(0, 10).map(t => `- ${t.event_timestamp}: ${t.event_title} (${t.event_type})`).join('\n')}

**THREAT INTELLIGENCE:**
- IOCs Detected: ${iocs.length}
- Malicious Indicators: ${iocs.filter(i => i.threat_classification === 'malicious').length}
${iocs.filter(i => i.threat_classification === 'malicious').slice(0, 3).map(i => 
  `- ${i.indicator_type}: ${i.indicator_value} (${i.threat_names?.join(', ') || 'Unknown threat'})`
).join('\n')}

**AI FINDINGS:**
${findings.slice(0, 5).map(f => `- [${f.severity}] ${f.title}: ${f.description}`).join('\n')}

**CHAIN OF CUSTODY:**
- Total Custody Events: ${chainLogs.length}
- Chain Integrity: ${chainLogs.length > 0 ? 'Maintained' : 'No events logged'}

${compliance[0] ? `**COMPLIANCE STATUS:**
- Framework: ${compliance[0].framework_name}
- Score: ${compliance[0].overall_score}/100
- Status: ${compliance[0].compliance_status}
- Critical Gaps: ${compliance[0].critical_gaps?.join('; ') || 'None'}
` : ''}

**AUDIENCE:** ${audience.toUpperCase()}

**INSTRUCTIONS:**
${audienceInstructions}

Generate a comprehensive investigative report with the following sections:
1. Executive Summary
2. Incident Overview
3. Investigation Methodology
4. Key Findings
5. Evidence Analysis
6. Timeline of Events
7. Threat Attribution (if applicable)
8. Conclusions
9. Recommendations

Format as professional report with clear section headers. Be thorough but concise.

Return JSON format:
{
  "executive_summary": "brief overview",
  "incident_overview": "what happened",
  "methodology": "investigation approach",
  "key_findings": "major discoveries",
  "evidence_analysis": "evidence evaluation",
  "timeline_narrative": "chronological narrative",
  "threat_attribution": "threat actor/malware info",
  "conclusions": "final assessment",
  "recommendations": ["rec 1", "rec 2", "rec 3"]
}`;

    const report = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          executive_summary: { type: "string" },
          incident_overview: { type: "string" },
          methodology: { type: "string" },
          key_findings: { type: "string" },
          evidence_analysis: { type: "string" },
          timeline_narrative: { type: "string" },
          threat_attribution: { type: "string" },
          conclusions: { type: "string" },
          recommendations: { type: "array", items: { type: "string" } }
        }
      }
    });

    // Generate exhibit list
    const exhibits = await base44.entities.ExhibitAssignment.filter({ case_id });
    const exhibitList = exhibits.map(ex => {
      const ev = evidence.find(e => e.id === ex.evidence_id);
      return {
        exhibit_number: ex.exhibit_number,
        title: ev?.title || 'Unknown',
        hash: ev?.sha256_hash || 'N/A',
        collection_date: ev?.collection_timestamp
      };
    });

    // Create report record
    const generatedReport = await base44.asServiceRole.entities.Report.create({
      organization_id: user.organization_id,
      case_id,
      report_type: 'ai_narrative',
      title: `${audience.toUpperCase()} Report: ${caseData.title}`,
      content: report,
      generated_by: user.email,
      generated_at: new Date().toISOString(),
      metadata: {
        audience,
        evidence_count: evidence.length,
        ioc_count: iocs.length,
        exhibit_list: exhibitList
      }
    });

    // Log activity
    await base44.asServiceRole.entities.CaseActivity.create({
      organization_id: user.organization_id,
      case_id,
      activity_type: 'report_generated',
      actor_email: user.email,
      actor_role: 'analyst',
      description: `Generated AI narrative report (${audience} audience)`,
      target_entity_type: 'Report',
      target_entity_id: generatedReport.id,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      report: {
        ...report,
        exhibit_list: exhibitList,
        metadata: {
          case_number: caseData.case_number,
          generated_at: new Date().toISOString(),
          audience
        }
      }
    });

  } catch (error) {
    console.error('AI narrative generation error:', error);
    return Response.json({
      error: 'Report generation failed',
      details: error.message
    }, { status: 500 });
  }
});