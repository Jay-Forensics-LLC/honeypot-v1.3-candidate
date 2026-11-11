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

    // Fetch evidence
    const evidence = await base44.entities.EvidenceV2.filter({ case_id });

    // Fetch disclosure readiness
    const readiness = await base44.entities.DisclosureReadiness.filter(
      { case_id },
      '-assessed_at',
      1
    );

    // Fetch expert credentials
    const credentials = await base44.entities.ExpertCredential.filter({ 
      user_email: user.email 
    });

    // Fetch confidence scores
    const confidenceScores = await base44.entities.EvidenceConfidenceScore.filter({ 
      organization_id: user.organization_id 
    });

    const challenges = [];

    // Challenge 1: Evidence Admissibility (F.S. 90.803)
    const unverifiedEvidence = evidence.filter(e => !e.integrity_verified && !e.is_verified);
    if (unverifiedEvidence.length > 0) {
      challenges.push({
        challenge_type: 'evidence_admissibility',
        severity: 'critical',
        challenge_title: 'Business Records Exception Challenge',
        challenge_details: `Defense counsel will challenge admissibility of ${unverifiedEvidence.length} unverified digital evidence items under Florida Statute 90.803(6). Without proper authentication and verification, these items may be excluded as inadmissible hearsay.`,
        legal_basis: 'F.S. 90.803(6)(a) - business records must be made at or near the time of the event, by a person with knowledge, and kept in the regular course of business',
        affected_evidence_ids: unverifiedEvidence.map(e => e.id),
        defense_strategy: 'Complete forensic verification using industry-standard tools. Document chain of custody from collection. Prepare authenticating witness testimony.',
        mitigation_steps: [
          'Run SHA-256 hash verification on all evidence',
          'Document collection methodology and tools used',
          'Prepare custodian testimony establishing business records foundation',
          'Create timeline showing evidence collected contemporaneously'
        ],
        vulnerability_score: 85
      });
    }

    // Challenge 2: Chain of Custody
    const missingChain = evidence.filter(e => !e.chain_of_custody || e.chain_of_custody.length === 0);
    if (missingChain.length > 0) {
      challenges.push({
        challenge_type: 'chain_of_custody',
        severity: 'high',
        challenge_title: 'Chain of Custody Gap',
        challenge_details: `${missingChain.length} evidence items lack complete chain of custody documentation. Opposing counsel will argue spoliation and request adverse inference instruction.`,
        legal_basis: 'F.S. 90.901 - Requirement of authentication or identification. Webb v. State, 254 So. 3d 418 (Fla. 2018)',
        affected_evidence_ids: missingChain.map(e => e.id),
        defense_strategy: 'Reconstruct chain through audit logs, access logs, and witness testimony. Demonstrate secure storage and no opportunity for tampering.',
        mitigation_steps: [
          'Document all custodians who handled evidence',
          'Obtain affidavits from each custodian',
          'Demonstrate secure storage environment',
          'Show evidence remained sealed/encrypted between transfers'
        ],
        vulnerability_score: 75
      });
    }

    // Challenge 3: Expert Qualification (Daubert/Frye)
    const activeCredsCount = credentials.filter(c => c.status === 'active').length;
    if (activeCredsCount < 2) {
      challenges.push({
        challenge_type: 'expert_qualification',
        severity: 'high',
        challenge_title: 'Expert Qualification Challenge',
        challenge_details: 'Opposing counsel will challenge expert qualifications under Daubert standard. Insufficient professional certifications to establish specialized knowledge in digital forensics.',
        legal_basis: 'Daubert v. Merrell Dow Pharmaceuticals, 509 U.S. 579 (1993); F.S. 90.702',
        affected_evidence_ids: [],
        defense_strategy: 'Demonstrate relevant experience, training, and education. Present CV showing casework history, published research, and court testimony experience.',
        mitigation_steps: [
          'Add professional certifications (CISSP, EnCE, CFE)',
          'Document continuing education and training',
          'Prepare expert CV highlighting relevant experience',
          'Gather prior court qualification orders'
        ],
        vulnerability_score: activeCredsCount === 0 ? 80 : 50
      });
    }

    // Challenge 4: Hearsay within Hearsay
    const lowConfidenceEvidence = confidenceScores.filter(s => s.overall_score < 50);
    if (lowConfidenceEvidence.length > 0) {
      challenges.push({
        challenge_type: 'hearsay',
        severity: 'medium',
        challenge_title: 'Multiple Hearsay Layers',
        challenge_details: `${lowConfidenceEvidence.length} evidence items with low confidence scores may contain multiple levels of hearsay. Each layer must satisfy an exception.`,
        legal_basis: 'F.S. 90.805 - Hearsay within hearsay is not excluded if each part qualifies under an exception',
        affected_evidence_ids: lowConfidenceEvidence.map(s => s.evidence_id),
        defense_strategy: 'Identify each hearsay layer and establish separate exception for each. Consider bringing original declarants as witnesses when possible.',
        mitigation_steps: [
          'Map hearsay layers in evidence',
          'Identify applicable exceptions for each layer',
          'Improve evidence sourcing and corroboration',
          'Consider live testimony from original sources'
        ],
        vulnerability_score: 60
      });
    }

    // Challenge 5: Authentication of Digital Evidence
    const noHashEvidence = evidence.filter(e => !e.sha256_hash);
    if (noHashEvidence.length > 0) {
      challenges.push({
        challenge_type: 'authentication',
        severity: 'critical',
        challenge_title: 'Digital Evidence Authentication',
        challenge_details: `${noHashEvidence.length} items lack cryptographic hash verification. Cannot prove evidence is what it purports to be.`,
        legal_basis: 'F.S. 90.901(a) - Evidence must be authenticated by showing it is what the proponent claims',
        affected_evidence_ids: noHashEvidence.map(e => e.id),
        defense_strategy: 'Generate forensic hashes immediately. Use industry-standard tools (FTK, EnCase). Document methodology.',
        mitigation_steps: [
          'Generate SHA-256 hashes for all evidence',
          'Use NIST-approved forensic tools',
          'Document hash generation process',
          'Maintain hash registry with timestamps'
        ],
        vulnerability_score: 90
      });
    }

    // Challenge 6: Privilege Review
    const readinessData = readiness[0];
    if (!readinessData || readinessData.component_scores.privilege_review < 10) {
      challenges.push({
        challenge_type: 'privilege',
        severity: 'high',
        challenge_title: 'Attorney-Client Privilege Waiver',
        challenge_details: 'Incomplete privilege review risks inadvertent disclosure of privileged communications, constituting waiver and exposing all related communications.',
        legal_basis: 'F.S. 90.502 - Attorney-client privilege; waiver through disclosure',
        affected_evidence_ids: [],
        defense_strategy: 'Conduct immediate privilege review with privilege log. Consider claw-back agreement with opposing counsel.',
        mitigation_steps: [
          'Review all evidence for privileged content',
          'Create detailed privilege log',
          'Redact privileged portions before disclosure',
          'Execute Federal Rule 502(d) order'
        ],
        vulnerability_score: 70
      });
    }

    // Challenge 7: Spoliation
    const oldEvidence = evidence.filter(e => {
      const collected = new Date(e.collection_timestamp || e.created_date);
      const now = new Date();
      const daysDiff = (now - collected) / (1000 * 60 * 60 * 24);
      return daysDiff > 90;
    });
    if (oldEvidence.length > 5) {
      challenges.push({
        challenge_type: 'spoliation',
        severity: 'medium',
        challenge_title: 'Evidence Preservation Timing',
        challenge_details: 'Significant delay between incident and evidence collection. Opposing counsel may argue spoliation or failure to preserve.',
        legal_basis: 'F.S. 90.803(22) - Spoliation inference; duty to preserve evidence',
        affected_evidence_ids: oldEvidence.map(e => e.id),
        defense_strategy: 'Demonstrate reasonable preservation efforts. Show no evidence was destroyed. Document reasons for collection timing.',
        mitigation_steps: [
          'Document when preservation duty arose',
          'Show efforts to preserve evidence',
          'Explain any collection delays',
          'Demonstrate no evidence destruction occurred'
        ],
        vulnerability_score: 55
      });
    }

    // Challenge 8: Procedural Compliance
    if (!readinessData || (readinessData.component_scores && readinessData.component_scores.exhibit_preparation < 10)) {
      challenges.push({
        challenge_type: 'procedure',
        severity: 'low',
        challenge_title: 'Pre-Trial Procedure Compliance',
        challenge_details: 'Evidence not properly organized with exhibit numbers. May face procedural challenges or exclusion motions for non-compliance with local rules.',
        legal_basis: 'Local court rules require sequential exhibit numbering and pre-marking',
        affected_evidence_ids: [],
        defense_strategy: 'Comply with local rules immediately. Pre-mark all exhibits. Prepare exhibit list.',
        mitigation_steps: [
          'Assign sequential exhibit numbers',
          'Create exhibit list with descriptions',
          'Pre-mark physical exhibits',
          'Serve exhibit list per local rules'
        ],
        vulnerability_score: 30
      });
    }

    // Create challenge records
    const createdChallenges = [];
    for (const challenge of challenges) {
      const created = await base44.asServiceRole.entities.AdversarialChallenge.create({
        organization_id: user.organization_id,
        case_id,
        ...challenge,
        status: 'identified',
        simulated_at: new Date().toISOString(),
        simulated_by: user.email
      });
      createdChallenges.push(created);
    }

    return Response.json({
      success: true,
      challenges: createdChallenges,
      summary: {
        total_challenges: createdChallenges.length,
        critical: createdChallenges.filter(c => c.severity === 'critical').length,
        high: createdChallenges.filter(c => c.severity === 'high').length,
        medium: createdChallenges.filter(c => c.severity === 'medium').length,
        low: createdChallenges.filter(c => c.severity === 'low').length
      }
    });

  } catch (error) {
    console.error('Adversarial simulation error:', error);
    return Response.json({ 
      error: 'Simulation failed',
      details: error.message 
    }, { status: 500 });
  }
});