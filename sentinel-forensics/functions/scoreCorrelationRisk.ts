/**
 * AI-DRIVEN RISK SCORING FOR CORRELATED IOCs
 * 
 * Computes risk score (0-100) and confidence band for a correlation.
 * Creates immutable CorrelationRiskAssessment record (append-only).
 * 
 * Scoring formula:
 * (source_reliability * 0.25) + (recency * 0.2) + (match_strength * 0.25) + (case_criticality * 0.15) + (feed_signals * 0.15)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { correlation_id } = await req.json();
    
    if (!correlation_id) {
      return Response.json({ error: 'Missing correlation_id' }, { status: 400 });
    }
    
    // Fetch correlation
    const correlation = await base44.entities.CorrelationGraph.get(correlation_id);
    
    if (!correlation) {
      return Response.json({ error: 'Correlation not found' }, { status: 404 });
    }
    
    // Fetch linked indicator
    const indicator = await base44.entities.Indicator.get(correlation.target_id);
    
    if (!indicator) {
      return Response.json({ error: 'Indicator not found' }, { status: 404 });
    }
    
    // Fetch case for criticality
    const caseData = await base44.entities.Case.filter({ id: correlation.metadata?.case_id });
    const caseRecord = caseData[0];
    
    // Build normalized inputs
    const normalizedInputs = {
      indicator_type: indicator.indicator_type,
      indicator_value: indicator.value,
      source: indicator.source,
      confidence: indicator.confidence,
      last_seen: indicator.last_seen,
      threat_level: indicator.threat_level,
      case_priority: caseRecord?.priority || 'medium',
      feed_matches: indicator.feed_id ? 1 : 0,
      ttps_count: indicator.ttps?.length || 0,
      threat_actor_count: indicator.threat_actor_refs?.length || 0,
      scoring_timestamp: new Date().toISOString()
    };
    
    // Hash inputs
    const inputString = JSON.stringify(normalizedInputs, Object.keys(normalizedInputs).sort());
    const encoder = new TextEncoder();
    const data = encoder.encode(inputString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Calculate components
    const sourceReliability = calculateSourceReliability(indicator.source);
    const recency = calculateRecency(indicator.last_seen);
    const matchStrength = indicator.confidence || 50;
    const caseCriticality = calculateCaseCriticality(caseRecord?.priority);
    const feedSignals = calculateFeedSignals(indicator);
    
    // Composite score
    const riskScore = Math.round(
      (sourceReliability * 0.25) + 
      (recency * 0.2) + 
      (matchStrength * 0.25) + 
      (caseCriticality * 0.15) + 
      (feedSignals * 0.15)
    );
    
    // Confidence band
    const variance = calculateVariance([sourceReliability, recency, matchStrength, caseCriticality, feedSignals], riskScore);
    const confidenceBand = variance < 15 ? 'high' : variance < 30 ? 'medium' : 'low';
    
    // Explanation
    const explanation = {
      top_factors: generateTopFactors({ sourceReliability, recency, matchStrength, caseCriticality, feedSignals }),
      matched_feeds: indicator.feed_id ? [indicator.source] : [],
      decay_applied: recency < 80,
      explanation_text: generateExplanationText(riskScore, confidenceBand, { sourceReliability, recency, feedSignals })
    };
    
    // Create immutable assessment
    const assessment = await base44.asServiceRole.entities.CorrelationRiskAssessment.create({
      organization_id: user.organization_id || 'default',
      correlation_id,
      case_id: correlation.metadata?.case_id,
      risk_score: riskScore,
      risk_confidence_band: confidenceBand,
      risk_model_version: 'risk-v1',
      risk_inputs_hash: inputHash,
      risk_components: {
        source_reliability: sourceReliability,
        recency,
        match_strength: matchStrength,
        case_criticality: caseCriticality,
        feed_signals: feedSignals
      },
      risk_explain: explanation,
      scored_at: new Date().toISOString()
    });
    
    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id || 'default',
      event_type: 'correlation_risk_scored',
      severity: riskScore > 75 ? 'warning' : 'info',
      description: `Risk score computed: ${riskScore}/100 (${confidenceBand} confidence)`,
      user_id: user.email,
      resource_type: 'CorrelationRiskAssessment',
      resource_id: assessment.id,
      case_id: correlation.metadata?.case_id,
      action_performed: 'score',
      metadata: {
        correlation_id,
        risk_score: riskScore,
        confidence_band: confidenceBand
      },
      success: true,
      blockchain_hash: '',
      timestamp: new Date().toISOString()
    });
    
    return Response.json({ 
      success: true,
      assessment
    });
    
  } catch (error) {
    console.error('Risk scoring failed:', error);
    return Response.json({ 
      error: error.message || 'Failed to score correlation risk' 
    }, { status: 500 });
  }
});

function calculateSourceReliability(source) {
  const weights = {
    'misp': 95,
    'opencti': 95,
    'virustotal': 90,
    'alienvault_otx': 85,
    'abuseipdb': 80,
    'urlscan': 75,
    'shodan': 70,
    'manual': 60,
    'unknown': 30
  };
  return weights[source?.toLowerCase()] || 50;
}

function calculateRecency(lastSeen) {
  if (!lastSeen) return 30;
  
  const daysSince = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSince < 7) return 100;
  if (daysSince < 30) return 80;
  if (daysSince < 90) return 60;
  if (daysSince < 180) return 40;
  return 20;
}

function calculateCaseCriticality(priority) {
  const map = { critical: 100, high: 75, medium: 50, low: 25 };
  return map[priority] || 50;
}

function calculateFeedSignals(indicator) {
  let score = 0;
  
  // Feed match bonus
  if (indicator.feed_id) score += 40;
  
  // TTP enrichment bonus
  if (indicator.ttps && indicator.ttps.length > 0) {
    score += Math.min(30, indicator.ttps.length * 10);
  }
  
  // Threat actor attribution bonus
  if (indicator.threat_actor_refs && indicator.threat_actor_refs.length > 0) {
    score += 30;
  }
  
  return Math.min(100, score);
}

function calculateVariance(components, mean) {
  const sumSquares = components.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  return Math.sqrt(sumSquares / components.length);
}

function generateTopFactors(components) {
  const factors = [];
  
  if (components.sourceReliability > 80) factors.push('High-confidence source');
  if (components.recency > 80) factors.push('Recently observed');
  if (components.feedSignals > 50) factors.push('Feed-enriched');
  if (components.caseCriticality > 75) factors.push('Critical case');
  
  return factors.slice(0, 3);
}

function generateExplanationText(score, confidence, components) {
  const parts = [];
  
  if (components.sourceReliability > 80) {
    parts.push('reliable source');
  }
  
  if (components.recency > 80) {
    parts.push('recent activity');
  } else if (components.recency < 40) {
    parts.push('older intelligence');
  }
  
  if (components.feedSignals > 50) {
    parts.push('feed-corroborated');
  }
  
  return `Risk ${score}/100 (${confidence} confidence): ${parts.join(', ')}.`;
}