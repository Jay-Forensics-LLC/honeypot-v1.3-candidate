
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// Scoring function
function calculateReputationScore(indicator, enrichments) {
  let score = 50;

  const providerScores = enrichments
    .filter(e => e.summary?.threat_score !== undefined)
    .map(e => e.summary.threat_score);
  
  if (providerScores.length > 0) {
    const avgProviderScore = providerScores.reduce((a, b) => a + b, 0) / providerScores.length;
    score = score * 0.6 + avgProviderScore * 0.4;
  }

  const daysSinceFirstSeen = (Date.now() - new Date(indicator.first_seen)) / (1000 * 60 * 60 * 24);
  if (daysSinceFirstSeen < 7) {
    score += 10;
  }

  if (indicator.recurrence_count > 5) {
    score += 15;
  } else if (indicator.recurrence_count > 2) {
    score += 10;
  }

  const hasHighConfidence = enrichments.some(e => 
    e.summary?.reputation === 'malicious' || 
    e.summary?.threat_score > 75
  );
  if (hasHighConfidence) {
    score += 20;
  }

  return Math.min(100, Math.max(0, score));
}

function buildAttackGraph(indicators, enrichments, evidence) {
  const nodes = [];
  const edges = [];

  evidence.forEach(ev => {
    nodes.push({
      id: ev.id,
      type: 'evidence',
      label: ev.title,
      score: 0,
      metadata: {
        evidence_type: ev.evidence_type,
        created_at: ev.created_date
      }
    });
  });

  indicators.forEach(ind => {
    const enrichmentsForInd = enrichments.filter(e => e.indicator_id === ind.indicator_id);
    const score = calculateReputationScore(ind, enrichmentsForInd);

    nodes.push({
      id: ind.indicator_id,
      type: 'indicator',
      label: `${ind.indicator_type}: ${ind.value}`,
      score,
      metadata: {
        indicator_type: ind.indicator_type,
        value: ind.value,
        status: ind.status,
        recurrence: ind.recurrence_count
      }
    });

    edges.push({
      source: ind.evidence_id,
      target: ind.indicator_id,
      type: 'extracted_from',
      weight: ind.confidence,
      timestamp: ind.first_seen,
      metadata: {}
    });
  });

  const graph_score = nodes
    .filter(n => n.type === 'indicator')
    .reduce((sum, n) => sum + n.score, 0) / Math.max(1, indicators.length);

  return {
    nodes,
    edges,
    graph_score: Math.round(graph_score)
  };
}

function detectPatterns(graph, indicators, enrichments) {
  const patterns = [];

  indicators.forEach(ind => {
    if (ind.indicator_type === 'domain') {
      const daysSince = (Date.now() - new Date(ind.first_seen)) / (1000 * 60 * 60 * 24);
      const enrichmentsForInd = enrichments.filter(e => e.indicator_id === ind.indicator_id);
      const hasHighThreat = enrichmentsForInd.some(e => e.summary?.threat_score > 75);

      if (daysSince < 7 && hasHighThreat) {
        patterns.push({
          pattern_id: `PAT-${Date.now()}`,
          pattern_name: 'New Domain with High Threat',
          confidence: 0.85,
          explanation: `Domain "${ind.value}" is less than 7 days old and flagged by threat intel providers`,
          affected_nodes: [ind.indicator_id]
        });
      }
    }
  });

  const evidenceGroups = {};
  indicators.forEach(ind => {
    if (!evidenceGroups[ind.evidence_id]) {
      evidenceGroups[ind.evidence_id] = [];
    }
    evidenceGroups[ind.evidence_id].push(ind);
  });

  Object.entries(evidenceGroups).forEach(([evidenceId, inds]) => {
    if (inds.length >= 3) {
      const highScoreCount = inds.filter(i => {
        const node = graph.nodes.find(n => n.id === i.indicator_id);
        return node && node.score > 70;
      }).length;

      if (highScoreCount >= 2) {
        patterns.push({
          pattern_id: `PAT-${Date.now()}`,
          pattern_name: 'Multiple High-Score Indicators in Evidence',
          confidence: 0.9,
          explanation: `Evidence contains ${highScoreCount} indicators with threat scores > 70, suggesting compromise`,
          affected_nodes: inds.map(i => i.indicator_id)
        });
      }
    }
  });

  return patterns;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { case_id, evidence_id } = await req.json();

    if (!case_id) {
      return Response.json({ error: 'case_id required' }, { status: 400 });
    }

    // SECURITY FIX: Verify user has access to case using user-scoped client (RLS enforced)
    const userCases = await base44.entities.Case.filter({ id: case_id });
    
    if (!userCases || userCases.length === 0) {
      await base44.entities.AuditLog.create({
        event_type: 'unauthorized_access_attempt',
        severity: 'warning',
        description: `User attempted to correlate indicators for case they don't have access to`,
        user_id: user.email,
        timestamp: new Date().toISOString(),
        success: false,
        metadata: {
          case_id,
          reason: 'rls_denied'
        }
      });
      
      return Response.json({ 
        error: 'Forbidden',
        message: 'You do not have access to this case'
      }, { status: 403 });
    }

    // If evidence_id specified, verify access using user-scoped client (RLS enforced)
    if (evidence_id) {
      const userEvidence = await base44.entities.EvidenceV2.filter({ id: evidence_id });
      
      if (!userEvidence || userEvidence.length === 0) {
        return Response.json({ 
          error: 'Forbidden',
          message: 'You do not have access to this evidence'
        }, { status: 403 });
      }
    }

    // SECURITY FIX: Fetch data using user-scoped client (RLS enforced)
    // User can only access their own indicators, enrichments, and evidence
    const allIndicators = await base44.entities.IOCIndicator.list();
    let indicators = allIndicators.filter(i => i.case_id === case_id);
    
    if (evidence_id) {
      indicators = indicators.filter(i => i.evidence_id === evidence_id);
    }

    const allEnrichments = await base44.entities.EnrichmentResult.list();
    const indicatorIds = indicators.map(i => i.indicator_id);
    const enrichments = allEnrichments.filter(e => indicatorIds.includes(e.indicator_id));

    // Changed: Filter evidence directly by case_id using user-scoped client
    const evidence = await base44.entities.EvidenceV2.filter({ case_id });

    // Update reputation scores using user-scoped client (RLS enforced)
    for (const indicator of indicators) {
      const enrichmentsForInd = enrichments.filter(e => e.indicator_id === indicator.indicator_id);
      const score = calculateReputationScore(indicator, enrichmentsForInd);
      
      try {
        await base44.entities.IOCIndicator.update(indicator.id, {
          reputation_score: score
        });
      } catch (updateError) {
        console.error(`Failed to update indicator ${indicator.id}:`, updateError);
      }
    }

    const graph = buildAttackGraph(indicators, enrichments, evidence);
    const patterns = detectPatterns(graph, indicators, enrichments);

    // SECURITY FIX: Save graph using user-scoped client (RLS enforced)
    const correlationGraph = await base44.entities.CorrelationGraph.create({
      graph_id: `GRAPH-${Date.now()}`,
      case_id,
      evidence_id: evidence_id || null,
      nodes: graph.nodes,
      edges: graph.edges,
      graph_score: graph.graph_score,
      patterns_detected: patterns,
      computed_at: new Date().toISOString(),
      merkle_root: `hash:${Date.now()}`
    });

    // SECURITY FIX: Audit log with user-scoped client (RLS enforced)
    await base44.entities.AuditLog.create({
      event_type: 'correlation_completed',
      severity: 'info',
      description: `IOC correlation completed for case ${case_id}`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        case_id,
        indicators_count: indicators.length,
        graph_score: graph.graph_score,
        patterns_count: patterns.length
      }
    });

    return Response.json({
      success: true,
      graph_id: correlationGraph.graph_id,
      graph: {
        nodes: graph.nodes,
        edges: graph.edges,
        graph_score: graph.graph_score
      },
      patterns: patterns,
      summary: {
        indicators_analyzed: indicators.length,
        enrichments_used: enrichments.length,
        patterns_detected: patterns.length,
        avg_reputation_score: Math.round(
          indicators.reduce((sum, i) => sum + (i.reputation_score || 50), 0) / Math.max(1, indicators.length)
        )
      }
    });

  } catch (error) {
    console.error('Correlation error:', error);
    return Response.json({ 
      error: 'Correlation failed', 
      message: error.message 
    }, { status: 500 });
  }
});
