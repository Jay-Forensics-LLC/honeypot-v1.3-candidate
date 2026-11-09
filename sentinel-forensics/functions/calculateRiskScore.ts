/**
 * PHASE 5: Risk Scoring Engine
 * 
 * Calculates risk score based on source reliability, recency, match strength, and case context.
 * Formula: (source_weight * 0.3) + (recency_score * 0.2) + (match_strength * 0.3) + (case_criticality * 0.2)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { indicator_id, case_id } = await req.json();
    
    if (!indicator_id) {
      return Response.json({ error: 'Missing indicator_id' }, { status: 400 });
    }
    
    const indicator = await base44.entities.Indicator.get(indicator_id);
    
    if (!indicator) {
      return Response.json({ error: 'Indicator not found' }, { status: 404 });
    }
    
    // Calculate source reliability (0-100)
    const sourceWeight = calculateSourceWeight(indicator.source);
    
    // Calculate recency score (0-100)
    const recencyScore = calculateRecencyScore(indicator.last_seen);
    
    // Calculate match strength (0-100)
    const matchStrength = indicator.confidence || 50;
    
    // Calculate case criticality (0-100)
    let caseCriticality = 50;
    if (case_id) {
      const caseData = await base44.entities.Case.get(case_id);
      if (caseData) {
        const priorityMap = { low: 25, medium: 50, high: 75, critical: 100 };
        caseCriticality = priorityMap[caseData.priority] || 50;
      }
    }
    
    // Calculate composite risk score
    const riskScore = Math.round(
      (sourceWeight * 0.3) + 
      (recencyScore * 0.2) + 
      (matchStrength * 0.3) + 
      (caseCriticality * 0.2)
    );
    
    // Calculate confidence band
    const confidenceBand = calculateConfidenceBand(riskScore, {
      sourceWeight,
      recencyScore,
      matchStrength
    });
    
    // Generate explanation
    const explanation = generateExplanation({
      riskScore,
      sourceWeight,
      recencyScore,
      matchStrength,
      caseCriticality,
      confidenceBand
    });
    
    return Response.json({ 
      success: true,
      risk_score: riskScore,
      confidence_band: confidenceBand,
      explanation,
      components: {
        source_reliability: sourceWeight,
        recency: recencyScore,
        match_strength: matchStrength,
        case_criticality: caseCriticality
      }
    });
    
  } catch (error) {
    console.error('Risk score calculation failed:', error);
    return Response.json({ 
      error: error.message || 'Failed to calculate risk score' 
    }, { status: 500 });
  }
});

function calculateSourceWeight(source) {
  const weights = {
    'alienvault_otx': 85,
    'virustotal': 90,
    'abuseipdb': 80,
    'misp': 95,
    'opencti': 95,
    'manual': 60,
    'unknown': 30
  };
  return weights[source?.toLowerCase()] || 50;
}

function calculateRecencyScore(lastSeen) {
  if (!lastSeen) return 30;
  
  const daysSince = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSince < 7) return 100;
  if (daysSince < 30) return 80;
  if (daysSince < 90) return 60;
  if (daysSince < 180) return 40;
  return 20;
}

function calculateConfidenceBand(score, components) {
  const variance = Math.max(
    Math.abs(components.sourceWeight - score),
    Math.abs(components.recencyScore - score),
    Math.abs(components.matchStrength - score)
  );
  
  if (variance < 15) return 'high';
  if (variance < 30) return 'medium';
  return 'low';
}

function generateExplanation(data) {
  const parts = [];
  
  if (data.sourceWeight > 80) {
    parts.push('High-confidence source');
  } else if (data.sourceWeight < 40) {
    parts.push('Low-confidence source');
  }
  
  if (data.recencyScore > 80) {
    parts.push('recently observed');
  } else if (data.recencyScore < 40) {
    parts.push('older intelligence');
  }
  
  if (data.caseCriticality > 75) {
    parts.push('critical case context');
  }
  
  return `Risk score ${data.riskScore}/100 (${data.confidenceBand} confidence): ${parts.join(', ')}.`;
}