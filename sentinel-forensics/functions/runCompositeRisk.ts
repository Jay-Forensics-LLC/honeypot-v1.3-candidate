import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

/**
 * RUN COMPOSITE RISK ANALYSIS
 * Combines IP risk, email risk, and behavioral signals
 * to produce session/user risk scores
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      caseId, 
      parametersJson = {},
      courtAdmissibleMode = false
    } = await req.json();

    if (!caseId) {
      return Response.json({ error: 'caseId required' }, { status: 400 });
    }

    const params = {
      timeRange: parametersJson.timeRange || null,
      includeIndicators: parametersJson.includeIndicators !== false,
      weightConfig: {
        ipWeight: parametersJson.weightConfig?.ipWeight || 0.45,
        emailWeight: parametersJson.weightConfig?.emailWeight || 0.25,
        behaviorWeight: parametersJson.weightConfig?.behaviorWeight || 0.30
      },
      thresholds: {
        high: parametersJson.thresholds?.high || 80,
        medium: parametersJson.thresholds?.medium || 50
      }
    };

    // Create enrichment run
    const { data: runData } = await base44.functions.invoke('createEnrichmentRun', {
      caseId,
      runType: 'composite_risk',
      provider: 'internal',
      inputIndicatorIds: [],
      parametersJson: params,
      courtAdmissibleMode,
      promptVersion: '1.0.0'
    });

    const run = runData.run;

    // Fetch enrichment results
    const ipResults = await base44.asServiceRole.entities.EnrichmentResult.filter({
      case_id: caseId,
      provider: 'internal'
    });

    const emailResults = ipResults.filter(r => {
      const indicators = r.normalized_json?.email;
      return !!indicators;
    });

    const ipResultsFiltered = ipResults.filter(r => {
      const indicators = r.normalized_json?.ip;
      return !!indicators;
    });

    // Fetch events
    let events = await base44.asServiceRole.entities.NormalizedEvent.filter({
      case_id: caseId
    });

    // Apply time range filter if specified
    if (params.timeRange) {
      const start = new Date(params.timeRange.start);
      const end = new Date(params.timeRange.end);
      events = events.filter(e => {
        const eventTime = new Date(e.event_time);
        return eventTime >= start && eventTime <= end;
      });
    }

    // Group events by actor_user
    const userSessions = new Map();
    for (const event of events) {
      const actor = event.actor_user || 'unknown';
      if (!userSessions.has(actor)) {
        userSessions.set(actor, []);
      }
      userSessions.get(actor).push(event);
    }

    const findings = [];

    // Process each user
    for (const [actor, userEvents] of userSessions.entries()) {
      if (actor === 'unknown' || userEvents.length === 0) continue;

      const evidenceRefs = {
        artifact_ids: [],
        event_ids: userEvents.map(e => e.id),
        fields_used: ['actor_user', 'src_ip', 'event_type', 'event_time'],
        time_range: {
          start: userEvents[0].event_time,
          end: userEvents[userEvents.length - 1].event_time
        }
      };

      // Calculate behavior score
      const behaviorScore = calculateBehaviorScore(userEvents);
      
      // Get IP risk scores for this user
      const userIps = [...new Set(userEvents.map(e => e.src_ip).filter(Boolean))];
      const ipScores = userIps.map(ip => {
        const result = ipResultsFiltered.find(r => r.normalized_json?.ip === ip);
        return result?.risk_score || 0;
      });
      const avgIpScore = ipScores.length > 0 
        ? ipScores.reduce((a, b) => a + b, 0) / ipScores.length 
        : 0;

      // Get email risk score
      const emailScore = emailResults.find(r => 
        r.normalized_json?.email === actor
      )?.risk_score || 0;

      // Weighted composite score
      const compositeScore = Math.round(
        (avgIpScore * params.weightConfig.ipWeight) +
        (emailScore * params.weightConfig.emailWeight) +
        (behaviorScore * params.weightConfig.behaviorWeight)
      );

      // Determine severity
      let severity = 'info';
      if (compositeScore >= params.thresholds.high) severity = 'critical';
      else if (compositeScore >= params.thresholds.medium) severity = 'high';
      else if (compositeScore >= 30) severity = 'medium';
      else if (compositeScore >= 15) severity = 'low';

      // Calculate confidence
      const confidence = calculateConfidence({
        hasIpData: ipScores.length > 0,
        hasEmailData: emailScore > 0,
        eventCount: userEvents.length,
        behaviorSignals: analyzeBehaviorSignals(userEvents)
      });

      const title = `${severity.toUpperCase()}: User ${actor} - Composite Risk Score ${compositeScore}/100`;
      
      const description = buildDescription({
        actor,
        compositeScore,
        ipScore: avgIpScore,
        emailScore,
        behaviorScore,
        eventCount: userEvents.length,
        ipCount: userIps.length,
        signals: analyzeBehaviorSignals(userEvents)
      });

      const rationale = buildRationale({
        ipWeight: params.weightConfig.ipWeight,
        emailWeight: params.weightConfig.emailWeight,
        behaviorWeight: params.weightConfig.behaviorWeight,
        ipScore: avgIpScore,
        emailScore,
        behaviorScore,
        signals: analyzeBehaviorSignals(userEvents)
      });

      const recommendedActions = buildRecommendedActions(compositeScore, severity);

      // Create finding
      const finding = await base44.asServiceRole.entities.CompositeRiskFinding.create({
        organization_id: user.organization_id,
        case_id: caseId,
        schema_version: '1.0.0',
        enrichment_run_id: run.id,
        finding_type: 'user_risk',
        title,
        description,
        severity,
        risk_score: compositeScore,
        confidence,
        confidence_explain: buildConfidenceExplanation(confidence, {
          hasIpData: ipScores.length > 0,
          hasEmailData: emailScore > 0,
          eventCount: userEvents.length
        }),
        rationale,
        recommended_actions: recommendedActions,
        evidence_refs: evidenceRefs,
        reviewed_status: 'unreviewed'
      });

      findings.push(finding);
    }

    return Response.json({
      run,
      findings,
      stats: {
        total: findings.length,
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        avgScore: findings.length > 0
          ? Math.round(findings.reduce((sum, f) => sum + f.risk_score, 0) / findings.length)
          : 0
      }
    });

  } catch (error) {
    console.error('runCompositeRisk error:', error);
    return Response.json({ 
      error: 'Composite risk analysis failed', 
      details: error.message 
    }, { status: 500 });
  }
});

function calculateBehaviorScore(events) {
  let score = 0;

  // Auth failure rate
  const authEvents = events.filter(e => e.event_type === 'auth');
  const failedAuth = authEvents.filter(e => 
    e.attributes_json?.auth_result === 'failed'
  ).length;
  
  if (authEvents.length > 0) {
    const failureRate = failedAuth / authEvents.length;
    if (failureRate > 0.5) score += 40;
    else if (failureRate > 0.3) score += 25;
    else if (failureRate > 0.1) score += 10;
  }

  // Unusual port activity
  const dstPorts = events.map(e => e.dst_port).filter(Boolean);
  const suspiciousPorts = [4444, 1337, 31337, 6667, 8080];
  const hasSuspiciousPorts = dstPorts.some(p => suspiciousPorts.includes(p));
  if (hasSuspiciousPorts) score += 20;

  // High event velocity
  if (events.length > 100) score += 15;
  else if (events.length > 50) score += 10;

  // Process spawning patterns
  const processEvents = events.filter(e => 
    e.event_type === 'process_start' || e.event_type === 'powershell'
  );
  if (processEvents.length > 10) score += 15;

  return Math.min(100, score);
}

function analyzeBehaviorSignals(events) {
  const signals = [];

  const authEvents = events.filter(e => e.event_type === 'auth');
  const failedAuth = authEvents.filter(e => 
    e.attributes_json?.auth_result === 'failed'
  ).length;
  
  if (failedAuth > 5) {
    signals.push(`${failedAuth} failed authentication attempts`);
  }

  const uniqueIps = new Set(events.map(e => e.src_ip).filter(Boolean)).size;
  if (uniqueIps > 5) {
    signals.push(`Activity from ${uniqueIps} different IP addresses`);
  }

  const dstPorts = events.map(e => e.dst_port).filter(Boolean);
  const uniquePorts = new Set(dstPorts).size;
  if (uniquePorts > 10) {
    signals.push(`Connected to ${uniquePorts} different ports`);
  }

  const processEvents = events.filter(e => 
    e.event_type === 'process_start' || e.event_type === 'powershell'
  );
  if (processEvents.length > 10) {
    signals.push(`${processEvents.length} process execution events`);
  }

  return signals;
}

function calculateConfidence(data) {
  let confidence = 0.5; // baseline

  if (data.hasIpData) confidence += 0.2;
  if (data.hasEmailData) confidence += 0.15;
  if (data.eventCount > 10) confidence += 0.1;
  if (data.eventCount > 50) confidence += 0.05;
  if (data.behaviorSignals.length > 2) confidence += 0.1;

  return Math.min(1.0, confidence);
}

function buildDescription(data) {
  const parts = [
    `User ${data.actor} exhibits composite risk score of ${data.compositeScore}/100.`,
    `Analysis based on ${data.eventCount} events across ${data.ipCount} IP addresses.`,
    `Component scores: IP=${data.ipScore.toFixed(1)}, Email=${data.emailScore.toFixed(1)}, Behavior=${data.behaviorScore.toFixed(1)}.`
  ];

  if (data.signals.length > 0) {
    parts.push(`Behavioral indicators: ${data.signals.join('; ')}.`);
  }

  return parts.join(' ');
}

function buildRationale(data) {
  const parts = [
    'Composite risk score calculated using weighted multi-vector analysis:',
    `- IP Risk (${(data.ipWeight * 100).toFixed(0)}%): ${data.ipScore.toFixed(1)}/100`,
    `- Email Risk (${(data.emailWeight * 100).toFixed(0)}%): ${data.emailScore.toFixed(1)}/100`,
    `- Behavior Risk (${(data.behaviorWeight * 100).toFixed(0)}%): ${data.behaviorScore.toFixed(1)}/100`
  ];

  if (data.signals.length > 0) {
    parts.push('Behavioral signals detected:');
    data.signals.forEach(signal => parts.push(`- ${signal}`));
  }

  return parts.join('\n');
}

function buildConfidenceExplanation(confidence, data) {
  const parts = [`Confidence: ${Math.round(confidence * 100)}%`];
  
  if (data.hasIpData) parts.push('IP enrichment data available');
  if (data.hasEmailData) parts.push('Email enrichment data available');
  if (data.eventCount > 50) parts.push('Substantial event sample');
  else if (data.eventCount > 10) parts.push('Adequate event sample');
  else parts.push('Limited event sample');

  return parts.join('. ') + '.';
}

function buildRecommendedActions(score, severity) {
  const actions = [];

  if (severity === 'critical' || severity === 'high') {
    actions.push('Investigate immediately - potential threat actor');
    actions.push('Review all associated events and artifacts');
    actions.push('Consider account suspension pending investigation');
  }

  if (severity === 'high' || severity === 'medium') {
    actions.push('Correlate with threat intelligence feeds');
    actions.push('Review authentication logs');
    actions.push('Check for lateral movement indicators');
  }

  if (severity === 'medium' || severity === 'low') {
    actions.push('Monitor for escalation');
    actions.push('Document findings in case notes');
  }

  actions.push('Update analyst verdict after review');

  return actions;
}