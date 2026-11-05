import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Court-Ready Report Generator
 * Generates forensically defensible reports with mandatory sections
 */

const REPORT_TEMPLATES = {
  data_breach: {
    name: 'Data Breach Investigation',
    default_scope: 'Investigation of unauthorized data access and potential exfiltration',
    default_methodology: 'Timeline analysis, network log correlation, access pattern evaluation',
    default_limitations: 'Analysis limited to available logs and evidence. Cannot determine intent without admission.'
  },
  device_compromise: {
    name: 'Device Compromise / Malware Analysis',
    default_scope: 'Forensic examination of compromised device for indicators of malware infection',
    default_methodology: 'File system analysis, memory dump examination, persistence mechanism identification',
    default_limitations: 'Analysis based on static artifacts. Active malware behavior may differ.'
  },
  network_intrusion: {
    name: 'Network Intrusion Analysis',
    default_scope: 'Investigation of unauthorized network access and lateral movement',
    default_methodology: 'Network traffic analysis, endpoint log correlation, IOC matching',
    default_limitations: 'Analysis limited to captured network traffic. Encrypted channels not fully analyzable.'
  },
  chain_of_custody: {
    name: 'Chain-of-Custody Summary',
    default_scope: 'Documentation of evidence handling and integrity verification',
    default_methodology: 'Cryptographic hash verification, timestamp validation, custodian tracking',
    default_limitations: 'Custody chain documented from point of platform ingestion forward.'
  },
  expert_declaration: {
    name: 'Expert Declaration / Affidavit',
    default_scope: 'Professional opinion based on forensic analysis of digital evidence',
    default_methodology: 'Systematic examination per industry standards (NIST, ISO/IEC 27037)',
    default_limitations: 'Opinions based on available evidence. Conclusions subject to new information.'
  },
  custom: {
    name: 'Custom Report',
    default_scope: 'Custom forensic analysis as specified',
    default_methodology: 'Methodology tailored to investigation requirements',
    default_limitations: 'Limitations specific to scope and available evidence'
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      caseId,
      template,
      title,
      selectedEvidence,
      selectedTags,
      tagMatchMode,
      includedSections,
      customNotes,
      exportFormat,
      includeExhibitNumbers,
      autoAssignExhibits,
      snapshotId,
      courtProfileId,
      includeConfidenceScores
    } = await req.json();

    // Get case data
    const cases = await base44.entities.Case.filter({ id: caseId });
    const caseData = cases[0];

    if (!caseData) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }

    // Get court profile if specified
    let courtProfile = null;
    if (courtProfileId) {
      const profiles = await base44.entities.CourtExportProfile.filter({ id: courtProfileId });
      courtProfile = profiles[0];
    }

    // Get evidence - from snapshot or live
    let evidence = [];
    let snapshotData = null;
    
    if (snapshotId) {
      const { data } = await base44.asServiceRole.functions.invoke('manageEvidenceSnapshots', {
        action: 'get_snapshot',
        snapshotId
      });
      snapshotData = data;
      evidence = data.items.map(item => ({
        id: item.evidence_id,
        ...item.frozen_state,
        sha256_hash: item.evidence_hash,
        exhibit_number: item.exhibit_number,
        tags: item.tags_at_freeze,
        _from_snapshot: true
      }));
    } else {
      // Get evidence based on filters
      evidence = await base44.entities.EvidenceV2.filter({ case_id: caseId });
    }

    // Filter by selected evidence if specified
    if (selectedEvidence && selectedEvidence.length > 0) {
      evidence = evidence.filter(e => selectedEvidence.includes(e.id));
    }

    // Filter by tags if specified
    if (selectedTags && selectedTags.length > 0) {
      const evidenceTags = await base44.entities.EvidenceTag.filter({
        organization_id: user.organization_id,
        is_active: true
      });

      const evidenceTagMap = {};
      evidenceTags.forEach(et => {
        if (!evidenceTagMap[et.evidence_id]) {
          evidenceTagMap[et.evidence_id] = [];
        }
        evidenceTagMap[et.evidence_id].push(et.tag_id);
      });

      evidence = evidence.filter(e => {
        const eTags = evidenceTagMap[e.id] || [];
        if (tagMatchMode === 'ALL') {
          return selectedTags.every(tagId => eTags.includes(tagId));
        } else {
          return selectedTags.some(tagId => eTags.includes(tagId));
        }
      });
    }

    // Auto-assign exhibits if requested (and not using snapshot)
    if (autoAssignExhibits && includeExhibitNumbers && !snapshotId) {
      const evidenceIds = evidence.map(e => e.id);
      await base44.asServiceRole.functions.invoke('manageExhibits', {
        action: 'bulk_assign',
        caseId,
        evidenceIds,
        method: 'report_generation'
      });
    }

    // Get exhibit assignments (unless from snapshot)
    let exhibitAssignments = {};
    if (includeExhibitNumbers && !snapshotId) {
      const { data } = await base44.asServiceRole.functions.invoke('manageExhibits', {
        action: 'list_assignments',
        caseId
      });
      (data.assignments || []).forEach(a => {
        exhibitAssignments[a.evidence_id] = a.exhibit_number;
      });
    }

    // Get confidence scores if requested
    let confidenceScores = {};
    if (includeConfidenceScores) {
      const scores = await base44.entities.EvidenceConfidenceScore.filter({
        organization_id: user.organization_id
      });
      scores.forEach(s => {
        confidenceScores[s.evidence_id] = s;
      });
    }

    // Get template config
    const templateConfig = REPORT_TEMPLATES[template] || REPORT_TEMPLATES.custom;

    // Apply court profile formatting
    const effectiveExhibitPrefix = courtProfile?.exhibit_prefix || 'Exhibit';
    const dateFormatStyle = courtProfile?.date_format || 'MM/DD/YYYY';

    // Build report structure
    const report = {
      metadata: {
        report_id: crypto.randomUUID(),
        title,
        template: templateConfig.name,
        case_number: caseData.case_number,
        case_title: caseData.title,
        generated_at: new Date().toISOString(),
        generated_by: user.email,
        platform_version: 'Sentinel-Forensics v1.0',
        evidence_count: evidence.length,
        evidence_snapshot_ref: snapshotData ? {
          snapshot_id: snapshotData.snapshot.id,
          snapshot_name: snapshotData.snapshot.snapshot_name,
          frozen_at: snapshotData.snapshot.frozen_at,
          snapshot_hash: snapshotData.snapshot.snapshot_hash
        } : null,
        court_profile: courtProfile ? {
          profile_id: courtProfile.id,
          profile_name: courtProfile.profile_name,
          jurisdiction: courtProfile.jurisdiction,
          court_name: courtProfile.court_name,
          version: courtProfile.version
        } : null
      },
      mandatory_sections: {
        scope: {
          title: 'Scope of Analysis',
          content: templateConfig.default_scope,
          locked: true
        },
        methodology: {
          title: 'Methodology Disclosure',
          content: templateConfig.default_methodology + '\\n\\nAll evidence processed through Sentinel-Forensics platform with cryptographic integrity verification.',
          locked: true
        },
        limitations: {
          title: 'Limitations and Assumptions',
          content: templateConfig.default_limitations + '\\n\\nAnalysis assumes evidence integrity maintained per documented chain of custody.',
          locked: true
        },
        toolchain: {
          title: 'Toolchain Disclosure',
          content: `Platform: Sentinel-Forensics v1.0\\nAI Components: ${includedSections.includes('ai_analysis') ? 'Anthropic Claude (summarization only)' : 'None'}\\nHashing: SHA-256\\nTimestamps: ISO 8601 UTC\\n\\nAll tool outputs preserved in audit log for independent verification.`,
          locked: true
        },
        ...(courtProfile?.required_disclosures && courtProfile.required_disclosures.length > 0 ? {
          jurisdiction_disclosures: {
            title: `${courtProfile.court_name || courtProfile.jurisdiction.toUpperCase()} Required Disclosures`,
            content: courtProfile.required_disclosures.join('\\n\\n'),
            locked: true
          }
        } : {})
      },
      optional_sections: {},
      evidence: evidence.map(e => {
        let exhibitNumber = e.exhibit_number || exhibitAssignments[e.id];
        if (exhibitNumber && courtProfile?.exhibit_prefix) {
          // Reformat exhibit number with court-specific prefix
          const numericPart = exhibitNumber.match(/\d+|[A-Z]+/)?.[0] || '';
          exhibitNumber = `${courtProfile.exhibit_prefix} ${numericPart}`;
        }
        const evidenceItem = {
          id: e.id,
          exhibit_number: exhibitNumber || null,
          title: e.title,
          type: e.evidence_type,
          collected: e.collection_timestamp || e.created_date,
          collected_by: e.collected_by,
          hash: e.sha256_hash,
          file_url: e.file_url,
          description: e.description
        };
        
        // Add confidence score if included
        if (includeConfidenceScores && confidenceScores[e.id]) {
          evidenceItem.confidence_score = {
            overall: confidenceScores[e.id].overall_score,
            level: confidenceScores[e.id].confidence_level,
            components: confidenceScores[e.id].component_scores
          };
        }
        
        return evidenceItem;
      }),
      custom_notes: customNotes || null
    };

    // Add optional sections
    if (includedSections.includes('executive_summary')) {
      report.optional_sections.executive_summary = {
        title: 'Executive Summary',
        content: `This ${templateConfig.name.toLowerCase()} report documents findings from Case ${caseData.case_number}: ${caseData.title}. Analysis includes ${evidence.length} evidence items collected between ${new Date(caseData.created_date).toLocaleDateString()} and present.`
      };
    }

    if (includedSections.includes('evidence_list')) {
      report.optional_sections.evidence_list = {
        title: 'Evidence Listing',
        items: evidence,
        include_exhibits: includeExhibitNumbers
      };
    }

    if (includeExhibitNumbers) {
      report.optional_sections.exhibit_index = {
        title: 'Exhibit Index',
        items: evidence
          .filter(e => e.exhibit_number)
          .map(e => ({
            exhibit_number: e.exhibit_number,
            evidence_id: e.id,
            title: e.title,
            hash: e.hash
          }))
      };
    }

    if (includedSections.includes('findings')) {
      report.optional_sections.findings = {
        title: 'Key Findings',
        content: 'Detailed findings documented in evidence annotations and analysis outputs.'
      };
    }

    if (includedSections.includes('audit_log')) {
      const auditLogs = await base44.entities.AuditLog.filter({
        organization_id: user.organization_id
      });
      const caseAuditLogs = auditLogs.filter(log => 
        log.metadata?.case_id === caseId || 
        log.description?.includes(caseData.case_number)
      );

      report.optional_sections.audit_log = {
        title: 'Case Audit Log',
        entries: caseAuditLogs.map(log => ({
          timestamp: log.timestamp || log.created_date,
          event_type: log.event_type,
          user: log.user_id,
          description: log.description,
          success: log.success
        }))
      };
    }

    // Generate hash of report content for integrity
    const reportContent = JSON.stringify(report);
    const reportHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reportContent));
    const reportHashHex = Array.from(new Uint8Array(reportHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    report.metadata.report_hash = reportHashHex;

    // Audit log the report generation
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'REPORT_GENERATED',
      severity: 'info',
      description: `Court-ready report generated: ${title}${snapshotData ? ' (using snapshot)' : ''}`,
      user_id: user.email,
      success: true,
      metadata: {
        report_id: report.metadata.report_id,
        case_id: caseId,
        template,
        evidence_count: evidence.length,
        export_format: exportFormat,
        report_hash: reportHashHex,
        snapshot_id: snapshotId || null
      }
    });

    // Return report based on format
    if (exportFormat === 'json') {
      return Response.json(report);
    }

    if (exportFormat === 'html') {
      const html = generateHTMLReport(report);
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="report-${report.metadata.report_id}.html"`
        }
      });
    }

    // For PDF, return JSON with instructions (PDF generation requires external lib)
    return Response.json({
      ...report,
      download_url: null,
      message: 'PDF generation available in production. Use HTML format for now.'
    });

  } catch (error) {
    console.error('Report generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function generateHTMLReport(report) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.metadata.title}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1, h2, h3 { color: #1a1a1a; }
    .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
    .metadata { background: #f1f5f9; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
    .section { margin: 30px 0; page-break-inside: avoid; }
    .mandatory { background: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin: 15px 0; }
    .evidence-item { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; margin: 10px 0; border-radius: 4px; }
    .hash { font-family: monospace; font-size: 11px; word-break: break-all; color: #64748b; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 2px solid #e2e8f0; font-size: 12px; color: #64748b; }
    @media print { body { margin: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${report.metadata.title}</h1>
    <div class="metadata">
      <p><strong>Report ID:</strong> ${report.metadata.report_id}</p>
      <p><strong>Case:</strong> ${report.metadata.case_number} - ${report.metadata.case_title}</p>
      <p><strong>Generated:</strong> ${new Date(report.metadata.generated_at).toLocaleString()}</p>
      <p><strong>Analyst:</strong> ${report.metadata.generated_by}</p>
      <p><strong>Evidence Items:</strong> ${report.metadata.evidence_count}</p>
      ${report.metadata.evidence_snapshot_ref ? `
        <p><strong>Evidence Source:</strong> Frozen Snapshot "${report.metadata.evidence_snapshot_ref.snapshot_name}"</p>
        <p><strong>Snapshot Frozen:</strong> ${new Date(report.metadata.evidence_snapshot_ref.frozen_at).toLocaleString()}</p>
        <p><strong>Snapshot Hash:</strong> <span class="hash">${report.metadata.evidence_snapshot_ref.snapshot_hash}</span></p>
      ` : '<p><strong>Evidence Source:</strong> Live evidence (current state)</p>'}
      <p><strong>Report Hash (SHA-256):</strong> <span class="hash">${report.metadata.report_hash}</span></p>
    </div>
  </div>

  <div class="section mandatory">
    <h2>⚖️ ${report.mandatory_sections.scope.title}</h2>
    <p>${report.mandatory_sections.scope.content}</p>
  </div>

  <div class="section mandatory">
    <h2>🔬 ${report.mandatory_sections.methodology.title}</h2>
    <p>${report.mandatory_sections.methodology.content}</p>
  </div>

  <div class="section mandatory">
    <h2>⚠️ ${report.mandatory_sections.limitations.title}</h2>
    <p>${report.mandatory_sections.limitations.content}</p>
  </div>

  <div class="section mandatory">
    <h2>🛠️ ${report.mandatory_sections.toolchain.title}</h2>
    <pre style="white-space: pre-wrap;">${report.mandatory_sections.toolchain.content}</pre>
  </div>

  ${Object.entries(report.optional_sections).map(([key, section]) => `
    <div class="section">
      <h2>${section.title}</h2>
      ${section.content ? `<p>${section.content}</p>` : ''}
      ${section.items ? section.items.map(item => `
        <div class="evidence-item">
          ${item.exhibit_number ? `<h3>${item.exhibit_number}: ${item.title}</h3>` : `<h3>${item.title}</h3>`}
          <p><strong>Type:</strong> ${item.type || item.evidence_type}</p>
          <p><strong>Collected:</strong> ${new Date(item.collected || item.collected_at).toLocaleString()} by ${item.collected_by}</p>
          <p><strong>SHA-256:</strong> <span class="hash">${item.hash}</span></p>
          ${item.description ? `<p>${item.description}</p>` : ''}
        </div>
      `).join('') : ''}
      ${section.entries ? `
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1;">Timestamp</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1;">Event</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1;">User</th>
            </tr>
          </thead>
          <tbody>
            ${section.entries.map(entry => `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${new Date(entry.timestamp).toLocaleString()}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${entry.description}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${entry.user}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>
  `).join('')}

  ${report.custom_notes ? `
    <div class="section">
      <h2>Additional Notes</h2>
      <p>${report.custom_notes}</p>
    </div>
  ` : ''}

  <div class="footer">
    <p><strong>Forensic Integrity Notice:</strong> This report was generated by Sentinel-Forensics platform. All evidence references include cryptographic hashes for independent verification. Report generation logged in case audit trail.</p>
    <p><strong>Platform:</strong> ${report.metadata.platform_version}</p>
    <p><strong>Generated:</strong> ${new Date(report.metadata.generated_at).toISOString()}</p>
  </div>
</body>
</html>
  `.trim();
}