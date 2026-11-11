import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

/**
 * RUN IP ENRICHMENT
 * Scores IPs with proxy/VPN/Tor detection, bot flags, abuse velocity,
 * connection type classification, and policy overrides
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
      inputIndicatorIds, 
      parametersJson = {},
      courtAdmissibleMode = false
    } = await req.json();

    if (!caseId || !inputIndicatorIds || inputIndicatorIds.length === 0) {
      return Response.json({ 
        error: 'caseId and inputIndicatorIds required' 
      }, { status: 400 });
    }

    const params = {
      strictness: parametersJson.strictness || 1,
      allowPublicAccessPoints: parametersJson.allowPublicAccessPoints !== false,
      includeGeo: parametersJson.includeGeo !== false,
      includeASN: parametersJson.includeASN !== false,
      includeTorList: parametersJson.includeTorList !== false,
      cacheTtlHours: parametersJson.cacheTtlHours || 24,
      scoringModel: parametersJson.scoringModel || 'heuristic_v1'
    };

    // Create enrichment run
    const { data: runData } = await base44.functions.invoke('createEnrichmentRun', {
      caseId,
      runType: 'ip_enrichment',
      provider: 'internal',
      inputIndicatorIds,
      parametersJson: params,
      courtAdmissibleMode,
      promptVersion: '1.0.0'
    });

    const run = runData.run;

    // Fetch policy list entries
    const policyEntries = await base44.asServiceRole.entities.PolicyListEntry.filter({
      case_id: caseId,
      indicator_type: 'ip'
    });

    const allowlist = policyEntries.filter(p => p.list_type === 'allow');
    const blocklist = policyEntries.filter(p => p.list_type === 'block');

    // Process each indicator
    const results = [];
    for (const indicatorId of inputIndicatorIds) {
      const indicators = await base44.asServiceRole.entities.Indicator.filter({ id: indicatorId });
      if (indicators.length === 0) continue;
      
      const indicator = indicators[0];
      if (indicator.indicator_type !== 'ip') {
        console.warn(`Skipping non-IP indicator: ${indicatorId}`);
        continue;
      }

      const ip = indicator.value;
      const scoringBreakdown = [];
      let baseScore = 0;
      let confidence = 0.7;
      const flags = {
        isProxy: false,
        isVPN: false,
        isTor: false,
        isBot: false,
        isCrawler: false,
        recentAbuse: false,
        frequentAbuser: false,
        highRiskAttacks: false
      };
      const tags = [];

      // Policy override checks
      const allowEntry = allowlist.find(e => matchesPattern(ip, e.pattern));
      const blockEntry = blocklist.find(e => matchesPattern(ip, e.pattern));

      if (allowEntry) {
        baseScore = 5;
        confidence = 1.0;
        tags.push('Allowlisted');
        scoringBreakdown.push({
          ruleId: 'policy_allowlist',
          points: -95,
          reason: `Allowlisted: ${allowEntry.reason}`,
          evidenceRefs: []
        });
      } else if (blockEntry) {
        baseScore = 95;
        confidence = 1.0;
        tags.push('Blocklisted');
        scoringBreakdown.push({
          ruleId: 'policy_blocklist',
          points: 95,
          reason: `Blocklisted: ${blockEntry.reason}`,
          evidenceRefs: []
        });
      } else {
        // Heuristic scoring
        const events = await base44.asServiceRole.entities.NormalizedEvent.filter({
          case_id: caseId,
          $or: [{ src_ip: ip }, { dst_ip: ip }]
        });

        // Tor detection (basic check against known exit nodes - simplified)
        if (params.includeTorList && isKnownTorExit(ip)) {
          flags.isTor = true;
          baseScore += 40;
          tags.push('Tor Exit Node');
          scoringBreakdown.push({
            ruleId: 'tor_exit_node',
            points: 40,
            reason: 'IP is known Tor exit node',
            evidenceRefs: []
          });
        }

        // Connection type heuristic
        const connectionType = classifyConnectionType(ip);
        if (connectionType === 'Hosting') {
          baseScore += 15;
          tags.push('Hosting Provider');
          scoringBreakdown.push({
            ruleId: 'hosting_provider',
            points: 15,
            reason: 'IP belongs to hosting/cloud provider',
            evidenceRefs: []
          });
        }

        // Bot/crawler detection from event patterns
        if (events.length > 0) {
          const timeSpan = getTimeSpan(events);
          const requestRate = events.length / (timeSpan || 1);
          const uniquePorts = new Set(events.map(e => e.dst_port).filter(Boolean)).size;

          if (requestRate > 10 && uniquePorts > 5) {
            flags.isBot = true;
            baseScore += 25;
            tags.push('Bot-like Behavior');
            scoringBreakdown.push({
              ruleId: 'bot_behavior',
              points: 25,
              reason: `High request rate (${requestRate.toFixed(1)}/hr) across ${uniquePorts} ports`,
              evidenceRefs: events.slice(0, 10).map(e => e.id)
            });
          }

          // Abuse velocity
          const abuseVelocity = calculateAbuseVelocity(events);
          if (abuseVelocity === 'high') {
            flags.frequentAbuser = true;
            baseScore += 30;
            tags.push('High Abuse Velocity');
            scoringBreakdown.push({
              ruleId: 'abuse_velocity',
              points: 30,
              reason: 'High frequency of suspicious events',
              evidenceRefs: events.slice(0, 10).map(e => e.id)
            });
          } else if (abuseVelocity === 'medium') {
            flags.recentAbuse = true;
            baseScore += 15;
            tags.push('Recent Abuse');
            scoringBreakdown.push({
              ruleId: 'recent_abuse',
              points: 15,
              reason: 'Recent suspicious activity detected',
              evidenceRefs: events.slice(0, 5).map(e => e.id)
            });
          }
        }

        // Cap score
        baseScore = Math.min(100, Math.max(0, baseScore));
      }

      // Build normalized JSON
      const normalizedJson = {
        ip,
        riskScore: baseScore,
        confidence,
        flags,
        abuseVelocity: baseScore >= 50 ? 'high' : baseScore >= 25 ? 'medium' : 'low',
        connectionType: classifyConnectionType(ip),
        geo: params.includeGeo ? getGeoData(ip) : null,
        asn: params.includeASN ? getASNData(ip) : null,
        scoringBreakdown,
        requestId: crypto.randomUUID()
      };

      // Store result
      const { data: resultData } = await base44.functions.invoke('storeEnrichmentResult', {
        runId: run.id,
        indicatorId: indicator.id,
        normalizedJson,
        riskScore: baseScore,
        confidence,
        tags,
        summary: buildSummary(normalizedJson, tags),
        traceability: indicator.derived_from || {
          source_artifact_ids: [],
          source_event_ids: []
        }
      });

      results.push(resultData.result);

      // Update/create IPRiskProfile
      const profiles = await base44.asServiceRole.entities.IPRiskProfile.filter({
        case_id: caseId,
        indicator_id: indicator.id
      });

      if (profiles.length > 0) {
        await base44.asServiceRole.entities.IPRiskProfile.update(profiles[0].id, {
          latest_result_id: resultData.result.id,
          current_risk_score: baseScore,
          current_confidence: confidence,
          current_tags: tags
        });
      } else {
        await base44.asServiceRole.entities.IPRiskProfile.create({
          organization_id: user.organization_id,
          case_id: caseId,
          schema_version: '1.0.0',
          indicator_id: indicator.id,
          latest_result_id: resultData.result.id,
          current_risk_score: baseScore,
          current_confidence: confidence,
          current_tags: tags,
          analyst_verdict: 'unknown'
        });
      }
    }

    return Response.json({
      run,
      results,
      stats: {
        total: results.length,
        high_risk: results.filter(r => r.risk_score >= 70).length,
        medium_risk: results.filter(r => r.risk_score >= 40 && r.risk_score < 70).length,
        low_risk: results.filter(r => r.risk_score < 40).length
      }
    });

  } catch (error) {
    console.error('runIpEnrichment error:', error);
    return Response.json({ 
      error: 'IP enrichment failed', 
      details: error.message 
    }, { status: 500 });
  }
});

// Helper functions
function matchesPattern(ip, pattern) {
  if (pattern === ip) return true;
  // CIDR matching (simplified)
  if (pattern.includes('/')) {
    const [network, bits] = pattern.split('/');
    // Simplified CIDR check - production should use proper library
    return ip.startsWith(network.split('.').slice(0, Math.floor(parseInt(bits) / 8)).join('.'));
  }
  return false;
}

function isKnownTorExit(ip) {
  // Simplified Tor exit node check
  // Production should use actual Tor exit list
  const knownTorExits = ['185.220.100.', '185.220.101.'];
  return knownTorExits.some(prefix => ip.startsWith(prefix));
}

function classifyConnectionType(ip) {
  // Cloud/hosting provider detection (simplified)
  const cloudPrefixes = {
    'aws': ['3.', '18.', '52.', '54.'],
    'gcp': ['34.', '35.'],
    'azure': ['40.', '52.'],
    'digitalocean': ['159.', '167.']
  };

  for (const [provider, prefixes] of Object.entries(cloudPrefixes)) {
    if (prefixes.some(p => ip.startsWith(p))) {
      return 'Hosting';
    }
  }

  return 'Unknown';
}

function getTimeSpan(events) {
  if (events.length < 2) return 1;
  const times = events.map(e => new Date(e.event_time).getTime()).sort();
  return (times[times.length - 1] - times[0]) / (1000 * 60 * 60); // hours
}

function calculateAbuseVelocity(events) {
  if (events.length > 100) return 'high';
  if (events.length > 20) return 'medium';
  return 'low';
}

function getGeoData(ip) {
  // Placeholder - production should use MaxMind or similar
  return {
    country: 'Unknown',
    region: null,
    city: null,
    lat: null,
    lon: null,
    timezone: null
  };
}

function getASNData(ip) {
  // Placeholder - production should use ASN database
  return {
    asn: null,
    isp: 'Unknown',
    org: 'Unknown'
  };
}

function buildSummary(normalized, tags) {
  const parts = [];
  parts.push(`Risk Score: ${normalized.riskScore}/100`);
  if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);
  if (normalized.flags.isTor) parts.push('Tor exit node');
  if (normalized.flags.isBot) parts.push('Bot-like behavior');
  if (normalized.connectionType !== 'Unknown') parts.push(`Type: ${normalized.connectionType}`);
  return parts.join(' | ');
}