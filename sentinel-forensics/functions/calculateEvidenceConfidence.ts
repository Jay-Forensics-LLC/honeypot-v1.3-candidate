import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Evidence Confidence Scoring Engine
 * Calculates defensible confidence scores for evidence items
 */

const SCORING_VERSION = '1.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evidenceId } = await req.json();

    // Get evidence
    const evidence = await base44.entities.EvidenceV2.filter({ id: evidenceId });
    if (!evidence || evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }
    const evidenceItem = evidence[0];

    // Get chain of custody logs
    const custodyLogs = await base44.asServiceRole.entities.ChainOfCustodyLog.filter({
      evidence_id: evidenceId
    });

    // Get related evidence (for corroboration)
    const relatedEvidence = await base44.entities.EvidenceV2.filter({
      case_id: evidenceItem.case_id
    });

    // Calculate component scores
    const sourceReliability = calculateSourceReliability(evidenceItem);
    const collectionMethod = calculateCollectionMethod(evidenceItem);
    const chainOfCustody = calculateChainOfCustody(evidenceItem, custodyLogs);
    const corroboration = calculateCorroboration(evidenceItem, relatedEvidence);

    const overallScore = sourceReliability.score + collectionMethod.score + chainOfCustody.score + corroboration.score;

    // Determine confidence level
    let confidenceLevel;
    if (overallScore >= 85) confidenceLevel = 'very_high';
    else if (overallScore >= 70) confidenceLevel = 'high';
    else if (overallScore >= 50) confidenceLevel = 'moderate';
    else if (overallScore >= 30) confidenceLevel = 'low';
    else confidenceLevel = 'very_low';

    // Aggregate risk flags and strengths
    const riskFlags = [
      ...sourceReliability.risks,
      ...collectionMethod.risks,
      ...chainOfCustody.risks,
      ...corroboration.risks
    ];

    const strengths = [
      ...sourceReliability.strengths,
      ...collectionMethod.strengths,
      ...chainOfCustody.strengths,
      ...corroboration.strengths
    ];

    // Generate recommendations
    const recommendations = generateRecommendations({
      sourceReliability,
      collectionMethod,
      chainOfCustody,
      corroboration
    });

    // Create or update confidence score
    const existingScores = await base44.entities.EvidenceConfidenceScore.filter({
      evidence_id: evidenceId
    });

    const scoreData = {
      organization_id: user.organization_id,
      evidence_id: evidenceId,
      overall_score: Math.round(overallScore),
      confidence_level: confidenceLevel,
      component_scores: {
        source_reliability: Math.round(sourceReliability.score),
        collection_method: Math.round(collectionMethod.score),
        chain_of_custody: Math.round(chainOfCustody.score),
        corroboration: Math.round(corroboration.score)
      },
      scoring_factors: {
        source_reliability: sourceReliability.factors,
        collection_method: collectionMethod.factors,
        chain_of_custody: chainOfCustody.factors,
        corroboration: corroboration.factors
      },
      risk_flags: riskFlags,
      strengths: strengths,
      recommendations: recommendations,
      scored_at: new Date().toISOString(),
      scored_by: user.email,
      scoring_version: SCORING_VERSION
    };

    let confidenceScore;
    if (existingScores.length > 0) {
      confidenceScore = await base44.entities.EvidenceConfidenceScore.update(
        existingScores[0].id,
        scoreData
      );
    } else {
      confidenceScore = await base44.entities.EvidenceConfidenceScore.create(scoreData);
    }

    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'EVIDENCE_CONFIDENCE_SCORED',
      severity: 'info',
      description: `Confidence score calculated for evidence ${evidenceItem.title}`,
      user_id: user.email,
      success: true,
      metadata: {
        evidence_id: evidenceId,
        score: overallScore,
        confidence_level: confidenceLevel
      }
    });

    return Response.json({
      success: true,
      confidence_score: confidenceScore
    });

  } catch (error) {
    console.error('Confidence scoring error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function calculateSourceReliability(evidence) {
  let score = 15; // Base score
  const factors = {};
  const risks = [];
  const strengths = [];

  // Collection method bonus
  if (evidence.collection_method) {
    factors.collection_method_documented = true;
    if (evidence.collection_method.includes('automated') || evidence.collection_method.includes('agent')) {
      score += 5;
      strengths.push('Automated collection reduces human error');
    } else if (evidence.collection_method.includes('manual')) {
      score += 3;
      factors.manual_collection = true;
    }
  } else {
    risks.push('Collection method not documented');
    score -= 3;
  }

  // Collector identity
  if (evidence.collected_by) {
    score += 3;
    factors.collector_identified = true;
    strengths.push('Collector identity documented');
  } else {
    risks.push('Collector identity unknown');
    score -= 2;
  }

  // Original source flag
  if (evidence.is_original) {
    score += 4;
    factors.is_original = true;
    strengths.push('Original evidence (not derivative)');
  } else {
    factors.is_derivative = true;
    risks.push('Derivative evidence - relies on source chain');
  }

  return {
    score: Math.max(0, Math.min(25, score)),
    factors,
    risks,
    strengths
  };
}

function calculateCollectionMethod(evidence) {
  let score = 12; // Base score
  const factors = {};
  const risks = [];
  const strengths = [];

  // Tool version tracking
  if (evidence.tool_version) {
    score += 4;
    factors.tool_version = evidence.tool_version;
    strengths.push('Collection tool version documented');
  } else {
    risks.push('Collection tool version not tracked');
    score -= 2;
  }

  // Metadata completeness
  const metadataFields = evidence.metadata ? Object.keys(evidence.metadata).length : 0;
  if (metadataFields > 5) {
    score += 5;
    factors.rich_metadata = true;
    strengths.push('Rich metadata captured');
  } else if (metadataFields > 0) {
    score += 2;
    factors.basic_metadata = true;
  } else {
    risks.push('Minimal metadata captured');
  }

  // Collection timestamp
  if (evidence.collection_timestamp) {
    score += 4;
    factors.collection_timestamp = true;
    strengths.push('Collection timestamp recorded');
  } else {
    risks.push('Collection timestamp missing');
    score -= 3;
  }

  return {
    score: Math.max(0, Math.min(25, score)),
    factors,
    risks,
    strengths
  };
}

function calculateChainOfCustody(evidence, custodyLogs) {
  let score = 10; // Base score
  const factors = {};
  const risks = [];
  const strengths = [];

  // Hash verification
  if (evidence.sha256_hash) {
    score += 7;
    factors.cryptographic_hash = true;
    strengths.push('Cryptographic hash provides integrity proof');
  } else {
    risks.push('No cryptographic hash - integrity unverifiable');
    score -= 5;
  }

  // Chain of custody logs
  const logCount = custodyLogs.length;
  factors.custody_log_count = logCount;

  if (logCount >= 3) {
    score += 6;
    strengths.push(`${logCount} chain-of-custody events logged`);
  } else if (logCount >= 1) {
    score += 3;
    factors.minimal_custody_trail = true;
  } else {
    risks.push('No chain-of-custody logs found');
    score -= 4;
  }

  // Integrity verification
  if (evidence.integrity_verified) {
    score += 2;
    factors.integrity_verified = true;
    strengths.push('Hash integrity verified');
  }

  return {
    score: Math.max(0, Math.min(25, score)),
    factors,
    risks,
    strengths
  };
}

function calculateCorroboration(evidence, relatedEvidence) {
  let score = 8; // Base score
  const factors = {};
  const risks = [];
  const strengths = [];

  // Related evidence count
  const relatedCount = relatedEvidence.length - 1; // Exclude self
  factors.related_evidence_count = relatedCount;

  if (relatedCount >= 5) {
    score += 8;
    strengths.push(`${relatedCount} related evidence items for corroboration`);
  } else if (relatedCount >= 2) {
    score += 5;
    factors.some_corroboration = true;
  } else if (relatedCount === 1) {
    score += 2;
    factors.minimal_corroboration = true;
  } else {
    risks.push('No related evidence for corroboration');
  }

  // Hash matching (potential duplicates or related artifacts)
  const matchingHashes = relatedEvidence.filter(
    e => e.sha256_hash === evidence.sha256_hash && e.id !== evidence.id
  );
  if (matchingHashes.length > 0) {
    score += 4;
    factors.duplicate_artifacts = matchingHashes.length;
    strengths.push('Duplicate artifacts found (strengthens authenticity)');
  }

  // Derived evidence
  const derivedFrom = relatedEvidence.filter(e => e.derived_from === evidence.id);
  if (derivedFrom.length > 0) {
    score += 5;
    factors.derived_analysis_count = derivedFrom.length;
    strengths.push('Analysis artifacts derived from this evidence');
  }

  return {
    score: Math.max(0, Math.min(25, score)),
    factors,
    risks,
    strengths
  };
}

function generateRecommendations(components) {
  const recommendations = [];

  if (components.sourceReliability.score < 15) {
    recommendations.push('Document collection method and collector identity');
  }

  if (components.collectionMethod.score < 15) {
    recommendations.push('Capture richer metadata and tool version information');
  }

  if (components.chainOfCustody.score < 15) {
    recommendations.push('Implement cryptographic hashing and regular integrity checks');
    recommendations.push('Log all custody transfers and access events');
  }

  if (components.corroboration.score < 15) {
    recommendations.push('Collect additional corroborating evidence');
    recommendations.push('Cross-reference with other case evidence');
  }

  if (recommendations.length === 0) {
    recommendations.push('Evidence meets high confidence standards - maintain current practices');
  }

  return recommendations;
}