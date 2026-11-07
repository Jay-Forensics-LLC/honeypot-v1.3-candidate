import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { case_id } = await req.json();

    if (!case_id) {
      return Response.json({ error: 'case_id required' }, { status: 400 });
    }

    // Fetch case data
    const cases = await base44.entities.Case.filter({ id: case_id });
    if (!cases.length) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }
    const caseData = cases[0];

    // Fetch evidence
    const evidence = await base44.entities.EvidenceV2.filter({ case_id });

    // Fetch expert credentials for the organization
    const credentials = await base44.entities.ExpertCredential.filter({ 
      organization_id: user.organization_id
    });

    // Fetch reports for this case
    const reportDefinitions = await base44.entities.ReportDefinition.filter({ case_id });
    const reportDefIds = reportDefinitions.map(d => d.id);
    const reports = reportDefIds.length > 0 
      ? await base44.entities.ReportRun.filter({ 
          definition_id: { $in: reportDefIds }
        })
      : [];

    // Fetch exhibits
    const exhibits = await base44.entities.ExhibitAssignment.filter({ case_id });

    // Calculate component scores
    const scores = {
      evidence_integrity: 0,
      chain_of_custody: 0,
      expert_qualifications: 0,
      documentation_completeness: 0,
      privilege_review: 0,
      exhibit_preparation: 0
    };

    const deficiencies = [];
    const recommendations = [];
    const riskFactors = [];

    // Evidence Integrity (0-25)
    if (evidence.length === 0) {
      deficiencies.push({
        category: 'Evidence',
        severity: 'critical',
        description: 'No evidence items in case',
        remediation: 'Upload and verify evidence artifacts'
      });
    } else {
      const verifiedCount = evidence.filter(e => e.integrity_verified || e.is_verified).length;
      const verifiedRatio = verifiedCount / evidence.length;
      scores.evidence_integrity = Math.round(verifiedRatio * 25);

      if (verifiedRatio < 1) {
        deficiencies.push({
          category: 'Evidence Integrity',
          severity: 'critical',
          description: `${evidence.length - verifiedCount} evidence items not verified`,
          remediation: 'Run integrity verification on all evidence'
        });
      }

      // Check for missing hashes
      const missingHashes = evidence.filter(e => !e.sha256_hash && !e.file_hash_sha256).length;
      if (missingHashes > 0) {
        deficiencies.push({
          category: 'Evidence Integrity',
          severity: 'critical',
          description: `${missingHashes} evidence items missing hash`,
          remediation: 'Generate SHA-256 hashes for all evidence'
        });
      }
    }

    // Chain of Custody (0-20)
    const evidenceWithChain = evidence.filter(e => 
      e.chain_of_custody && e.chain_of_custody.length > 0
    ).length;
    if (evidence.length > 0) {
      const chainRatio = evidenceWithChain / evidence.length;
      scores.chain_of_custody = Math.round(chainRatio * 20);

      if (chainRatio < 1) {
        deficiencies.push({
          category: 'Chain of Custody',
          severity: 'high',
          description: `${evidence.length - evidenceWithChain} items missing chain logs`,
          remediation: 'Document chain of custody for all evidence'
        });
      }
    }

    // Expert Qualifications (0-15)
    const activeCredentials = credentials.filter(c => c.status === 'active');
    if (activeCredentials.length === 0) {
      deficiencies.push({
        category: 'Expert Qualifications',
        severity: 'high',
        description: 'No expert credentials on file',
        remediation: 'Add professional certifications to profile'
      });
      recommendations.push('Add certifications (CISSP, EnCE, CFE) to strengthen testimony');
    } else if (activeCredentials.length < 2) {
      scores.expert_qualifications = 8;
      recommendations.push('Additional certifications will strengthen expert status');
    } else {
      scores.expert_qualifications = 15;
    }

    // Check for expired credentials
    const expiredCreds = credentials.filter(c => {
      if (!c.expiration_date) return false;
      return new Date(c.expiration_date) < new Date();
    });
    if (expiredCreds.length > 0) {
      deficiencies.push({
        category: 'Expert Qualifications',
        severity: 'medium',
        description: `${expiredCreds.length} expired credentials`,
        remediation: 'Renew or remove expired certifications'
      });
    }

    // Documentation Completeness (0-20)
    const finalizedReports = reports.filter(r => r.is_locked_final).length;
    if (finalizedReports === 0) {
      deficiencies.push({
        category: 'Documentation',
        severity: 'critical',
        description: 'No finalized reports',
        remediation: 'Generate and finalize forensic report'
      });
    } else {
      scores.documentation_completeness = Math.min(finalizedReports * 10, 20);
    }

    // Privilege Review (0-10)
    // Check if case has been reviewed for privileged content
    if (!caseData.privilege_review_complete) {
      deficiencies.push({
        category: 'Privilege Review',
        severity: 'high',
        description: 'Privilege review not completed',
        remediation: 'Review all materials for attorney-client privilege'
      });
      riskFactors.push('Inadvertent disclosure of privileged information');
    } else {
      scores.privilege_review = 10;
    }

    // Exhibit Preparation (0-10)
    if (exhibits.length === 0 && evidence.length > 0) {
      deficiencies.push({
        category: 'Exhibit Preparation',
        severity: 'medium',
        description: 'Evidence not assigned exhibit numbers',
        remediation: 'Assign sequential exhibit numbers'
      });
    } else if (exhibits.length > 0) {
      scores.exhibit_preparation = 10;
    }

    // Calculate overall score
    const overall_score = Object.values(scores).reduce((sum, score) => sum + score, 0);

    // Determine readiness level
    let readiness_level;
    if (overall_score >= 90) {
      readiness_level = 'court_ready';
    } else if (overall_score >= 70) {
      readiness_level = 'disclosure_ready';
    } else if (overall_score >= 40) {
      readiness_level = 'partially_ready';
    } else {
      readiness_level = 'not_ready';
    }

    // Additional recommendations based on score
    if (overall_score < 70) {
      recommendations.push('Complete all critical deficiencies before disclosure');
    }
    if (scores.evidence_integrity < 20) {
      recommendations.push('Verify all evidence integrity before proceeding');
    }
    if (scores.documentation_completeness < 15) {
      recommendations.push('Generate comprehensive forensic report');
    }

    // Create assessment record
    const assessment = await base44.asServiceRole.entities.DisclosureReadiness.create({
      organization_id: user.organization_id,
      case_id,
      overall_score,
      readiness_level,
      component_scores: scores,
      deficiencies,
      risk_factors: riskFactors,
      recommendations,
      assessed_at: new Date().toISOString(),
      assessed_by: user.email,
      assessment_version: '1.0'
    });

    return Response.json({
      success: true,
      assessment
    });

  } catch (error) {
    console.error('Disclosure readiness assessment error:', error);
    return Response.json({ 
      error: 'Assessment failed',
      details: error.message 
    }, { status: 500 });
  }
});