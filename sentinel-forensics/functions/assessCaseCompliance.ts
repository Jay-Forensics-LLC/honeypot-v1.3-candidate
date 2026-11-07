import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { case_id, framework_name = 'GDPR' } = await req.json();

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
    const verifiedEvidence = evidence.filter(e => e.integrity_verified);

    // Fetch chain of custody logs
    const chainLogs = await base44.entities.ChainOfCustodyLog.filter({ case_id });

    // Fetch activities
    const activities = await base44.entities.CaseActivity.filter({ case_id });

    // Get case timeline
    const caseCreated = new Date(caseData.created_date);
    const now = new Date();
    const hoursSinceCreation = (now - caseCreated) / (1000 * 60 * 60);

    // Define GDPR requirements
    const gdprRequirements = [
      {
        requirement_id: 'GDPR-ART33-1',
        category: 'Breach Notification',
        title: 'Notify supervisory authority within 72 hours',
        description: 'Personal data breach must be reported to supervisory authority within 72h of becoming aware',
        deadline_hours: 72,
        evidence_required: ['breach_detection_timestamp', 'notification_evidence']
      },
      {
        requirement_id: 'GDPR-ART34',
        category: 'Data Subject Notification',
        title: 'Notify affected individuals without delay',
        description: 'If breach likely to result in high risk, notify data subjects',
        deadline_hours: 72,
        evidence_required: ['affected_users_list', 'notification_logs']
      },
      {
        requirement_id: 'GDPR-ART32',
        category: 'Security Measures',
        title: 'Implement appropriate technical measures',
        description: 'Demonstrate encryption, pseudonymization, and security controls',
        evidence_required: ['security_controls', 'encryption_evidence']
      },
      {
        requirement_id: 'GDPR-ART5-1F',
        category: 'Integrity & Confidentiality',
        title: 'Ensure integrity and confidentiality of data',
        description: 'Evidence of data protection measures',
        evidence_required: ['access_logs', 'encryption_status']
      },
      {
        requirement_id: 'GDPR-ART30',
        category: 'Records of Processing',
        title: 'Maintain records of processing activities',
        description: 'Document what data was affected and how',
        evidence_required: ['data_inventory', 'processing_records']
      }
    ];

    const detailedResults = [];
    let requirementsMet = 0;
    let requirementsFailed = 0;

    for (const req of gdprRequirements) {
      let status = 'failed';
      let notes = '';
      let evidenceRefs = [];
      let timeRemainingHours = null;
      let deadline = null;

      if (req.requirement_id === 'GDPR-ART33-1') {
        // Check 72-hour notification
        if (req.deadline_hours) {
          deadline = new Date(caseCreated.getTime() + req.deadline_hours * 60 * 60 * 1000).toISOString();
          timeRemainingHours = req.deadline_hours - hoursSinceCreation;
        }

        const notificationActivity = activities.find(a => 
          a.activity_type === 'report_generated' || 
          a.description?.toLowerCase().includes('notification')
        );

        if (notificationActivity) {
          status = 'met';
          notes = 'Notification documented in case activity';
          evidenceRefs = [notificationActivity.id];
          requirementsMet++;
        } else if (hoursSinceCreation > 72) {
          status = 'failed';
          notes = 'CRITICAL: 72-hour deadline exceeded without notification';
          requirementsFailed++;
        } else {
          status = 'partial';
          notes = `${Math.floor(timeRemainingHours)} hours remaining to notify`;
        }
      } else if (req.requirement_id === 'GDPR-ART34') {
        // Data subject notification
        const notificationEvidence = evidence.filter(e => 
          e.title?.toLowerCase().includes('notification') ||
          e.description?.toLowerCase().includes('data subject')
        );

        if (notificationEvidence.length > 0) {
          status = 'met';
          notes = 'Data subject notification evidence collected';
          evidenceRefs = notificationEvidence.map(e => e.id);
          requirementsMet++;
        } else {
          status = 'failed';
          notes = 'No evidence of data subject notification';
          requirementsFailed++;
        }
      } else if (req.requirement_id === 'GDPR-ART32') {
        // Technical measures
        const securityEvidence = evidence.filter(e => 
          e.evidence_type === 'config_state' ||
          e.title?.toLowerCase().includes('encryption') ||
          e.title?.toLowerCase().includes('security')
        );

        if (securityEvidence.length > 0 || verifiedEvidence.length > 0) {
          status = 'met';
          notes = 'Security controls evidenced (verified evidence + configs)';
          evidenceRefs = securityEvidence.map(e => e.id);
          requirementsMet++;
        } else {
          status = 'partial';
          notes = 'Limited security control evidence';
        }
      } else if (req.requirement_id === 'GDPR-ART5-1F') {
        // Integrity & confidentiality
        if (chainLogs.length > 0 && verifiedEvidence.length > 0) {
          status = 'met';
          notes = 'Chain of custody and verified evidence demonstrate integrity';
          requirementsMet++;
        } else {
          status = 'failed';
          notes = 'Insufficient chain-of-custody or unverified evidence';
          requirementsFailed++;
        }
      } else if (req.requirement_id === 'GDPR-ART30') {
        // Records of processing
        if (evidence.length > 0 && caseData.description) {
          status = 'met';
          notes = 'Case documentation and evidence inventory maintained';
          requirementsMet++;
        } else {
          status = 'failed';
          notes = 'Incomplete records of processing activities';
          requirementsFailed++;
        }
      }

      detailedResults.push({
        requirement_id: req.requirement_id,
        requirement_title: req.title,
        category: req.category,
        status,
        evidence_references: evidenceRefs,
        notes,
        deadline,
        time_remaining_hours: timeRemainingHours
      });
    }

    const totalRequirements = gdprRequirements.length;
    const overallScore = Math.round((requirementsMet / totalRequirements) * 100);
    const complianceStatus = overallScore >= 90 ? 'compliant' :
                              overallScore >= 60 ? 'partially_compliant' :
                              'non_compliant';

    const criticalGaps = detailedResults
      .filter(r => r.status === 'failed' && (r.time_remaining_hours !== null && r.time_remaining_hours < 0))
      .map(r => r.requirement_title);

    const recommendations = [];
    if (requirementsFailed > 0) {
      recommendations.push('Complete missing evidence documentation');
      recommendations.push('Ensure all evidence is forensically verified');
    }
    if (hoursSinceCreation < 72 && !detailedResults.find(r => r.requirement_id === 'GDPR-ART33-1' && r.status === 'met')) {
      recommendations.push('URGENT: Complete breach notification before 72-hour deadline');
    }

    const report = await base44.asServiceRole.entities.ComplianceReport.create({
      organization_id: user.organization_id,
      case_id,
      framework_name,
      overall_score: overallScore,
      compliance_status: complianceStatus,
      requirements_assessed: totalRequirements,
      requirements_met: requirementsMet,
      requirements_failed: requirementsFailed,
      detailed_results: detailedResults,
      critical_gaps: criticalGaps,
      recommendations,
      assessed_at: new Date().toISOString(),
      assessed_by: user.email
    });

    return Response.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Compliance assessment error:', error);
    return Response.json({
      error: 'Assessment failed',
      details: error.message
    }, { status: 500 });
  }
});