/**
 * PHASE 4: Refresh and Correlate Threat Intel → ProactiveRiskAlert
 * 
 * Reuses existing ThreatIntelFeed, Indicator, IntelIngestRun infrastructure.
 * Extends correlateIndicators logic to produce alert-ready matches.
 * Upserts ProactiveRiskAlert with deterministic evidence and policy posture gaps.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAdmin, logBlockedAttempt } from './helpers/rbacHelpers.js';
import { writeAuditLog } from './helpers/auditLogger.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      organization_id, 
      lookback_days = 14, 
      dry_run = true,
      scope = 'ALL',
      device_id = null
    } = await req.json();

    const orgId = organization_id || user.organization_id || 'default';

    // Gate: non-admin cannot run dry_run=false (using shared helper)
    if (!dry_run) {
      const authCheck = requireAdmin(user);
      if (!authCheck.allowed) {
        // Log blocked attempt
        await logBlockedAttempt(base44, {
          organization_id: orgId,
          actor: user.email,
          event_type: 'threat_intel_correlation',
          blocked_reason: authCheck.blocked_reason,
          metadata: { dry_run, scope, device_id }
        });

        return Response.json({ 
          error: authCheck.message,
          blocked_reason: authCheck.blocked_reason
        }, { status: authCheck.status });
      }
    }

    const evaluated_at = new Date().toISOString();
    const lookbackDate = new Date(Date.now() - lookback_days * 24 * 60 * 60 * 1000).toISOString();

    // Step A: Pull recent indicators within lookback window
    const allIndicators = await base44.entities.Indicator.list();
    const recentIndicators = allIndicators.filter(ind => 
      ind.created_date >= lookbackDate && 
      (ind.organization_id === orgId || !ind.organization_id)
    );

    // Step B: Pull mobile devices for correlation context
    const devices = scope === 'MOBILE_DEVICE' || scope === 'ALL' 
      ? await base44.entities.MobileDevice.filter({ organization_id: orgId })
      : [];

    // Step C: Correlate indicators against devices
    const correlationMatches = [];
    
    for (const indicator of recentIndicators) {
      // Platform/CVE matching
      const platformTags = indicator.tags?.filter(t => 
        t.toLowerCase().includes('ios') || 
        t.toLowerCase().includes('android') ||
        t.toLowerCase().includes('mobile')
      ) || [];
      
      const cveTags = indicator.tags?.filter(t => t.startsWith('CVE-')) || [];
      const ttpTags = indicator.ttps || [];

      for (const device of devices) {
        // Filter by device_id if specified
        if (device_id && device.id !== device_id) continue;

        const matchReasons = [];
        let matched = false;

        // Platform match
        if (platformTags.some(tag => tag.toLowerCase().includes(device.platform?.toLowerCase()))) {
          matchReasons.push({
            type: 'platform',
            expected: platformTags.join(', '),
            observed: device.platform,
            source: 'MobileDevice.platform'
          });
          matched = true;
        }

        // CVE tag presence (indicator suggests vulnerability)
        if (cveTags.length > 0) {
          matchReasons.push({
            type: 'cve_tag',
            expected: cveTags.join(', '),
            observed: 'Indicator.tags',
            source: 'Indicator'
          });
          matched = true;
        }

        if (matched) {
          // Step D: Check effective policy posture gaps
          let policyGaps = [];
          
          try {
            // Fetch effective policy for device (reuse existing function pattern)
            const effectivePolicies = await base44.entities.EffectivePolicyResolution.filter({
              organization_id: orgId,
              device_id: device.id
            });

            if (effectivePolicies.length > 0) {
              const effectivePolicy = effectivePolicies[0];
              const policyPayload = effectivePolicy.resolved_policy_payload_json || {};

              // Deterministic gap detection for credential/spyware threats
              if (ttpTags.some(ttp => ttp.includes('T1056') || ttp.includes('T1539'))) {
                // Credential access TTPs
                if (policyPayload.hardening_checklist?.items) {
                  const passcodeRequired = policyPayload.hardening_checklist.items.find(
                    item => item.control_id === 'passcode_required'
                  );
                  if (!passcodeRequired || passcodeRequired.validation !== 'AUTOMATED_CHECK') {
                    policyGaps.push('passcode.required=unchecked');
                  }
                }
              }

              // Check firewall for network-based threats
              if (indicator.indicator_type === 'ip' || indicator.indicator_type === 'domain') {
                if (!policyPayload.firewall_config || policyPayload.firewall_config.profile === 'OFF') {
                  policyGaps.push('firewall.profile=OFF');
                }
              }
            }
          } catch (policyError) {
            console.warn('Failed to fetch effective policy:', policyError);
          }

          // Calculate risk score (deterministic base)
          let riskScore = 50;
          if (indicator.threat_level === 'critical') riskScore = 90;
          else if (indicator.threat_level === 'high') riskScore = 75;
          else if (indicator.threat_level === 'medium') riskScore = 60;
          else if (indicator.threat_level === 'low') riskScore = 40;

          // Boost for policy gaps
          riskScore += policyGaps.length * 10;
          riskScore = Math.min(100, riskScore);

          const severity = riskScore >= 80 ? 'CRITICAL' : 
                          riskScore >= 70 ? 'HIGH' : 
                          riskScore >= 50 ? 'MEDIUM' : 'LOW';

          correlationMatches.push({
            indicator,
            device,
            match_reasons: matchReasons,
            policy_gaps: policyGaps,
            risk_score: riskScore,
            severity,
            cve_tags: cveTags,
            ttp_tags: ttpTags
          });
        }
      }
    }

    // Step E: Upsert ProactiveRiskAlert (dedupe by key)
    let alertsCreated = 0;
    let alertsUpdated = 0;
    const topAlerts = [];

    for (const match of correlationMatches) {
      if (dry_run) {
        // Dry run: just count, don't persist
        alertsCreated++;
        continue;
      }

      // Dedupe key: (org, source_intel_id, scope, device_id)
      const existingAlerts = await base44.entities.ProactiveRiskAlert.filter({
        organization_id: orgId,
        source_intel_id: match.indicator.id,
        scope: 'MOBILE_DEVICE',
        device_id: match.device.id
      });

      const alertData = {
        organization_id: orgId,
        source_intel_id: match.indicator.id,
        scope: 'MOBILE_DEVICE',
        device_id: match.device.id,
        policy_id: null,
        severity: match.severity,
        risk_score: match.risk_score,
        title: `${match.severity} threat detected: ${match.indicator.value}`,
        summary: `Indicator ${match.indicator.indicator_type} "${match.indicator.value}" matches device ${match.device.model} (${match.device.platform})`,
        evidence: {
          matching_fields: match.match_reasons.map(r => r.type),
          cve_tags: match.cve_tags,
          ttp_tags: match.ttp_tags,
          observed_exposure: {
            device_platform: match.device.platform,
            device_model: match.device.model,
            policy_gaps: match.policy_gaps,
            match_details: match.match_reasons
          }
        },
        recommendations: buildRecommendations(match),
        suggested_policy_changes: buildPolicyChanges(match),
        status: existingAlerts.length > 0 ? existingAlerts[0].status : 'OPEN',
        generated_at: evaluated_at
      };

      if (existingAlerts.length > 0) {
        // Update existing alert
        await base44.asServiceRole.entities.ProactiveRiskAlert.update(existingAlerts[0].id, {
          ...alertData,
          updated_date: evaluated_at
        });
        alertsUpdated++;
      } else {
        // Create new alert
        const newAlert = await base44.asServiceRole.entities.ProactiveRiskAlert.create(alertData);
        alertsCreated++;
        
        if (topAlerts.length < 5) {
          topAlerts.push({
            id: newAlert.id,
            severity: newAlert.severity,
            risk_score: newAlert.risk_score,
            title: newAlert.title,
            status: newAlert.status
          });
        }
      }
    }

    // Step F: Audit log (dual-sink guaranteed persistence)
    await writeAuditLog(base44, {
      organization_id: orgId,
      event_type: 'threat_intel_correlation_run',
      severity: 'info',
      description: `Threat intel correlation completed (dry_run=${dry_run})`,
      actor: user.email,
      success: true,
      metadata: {
        dry_run,
        lookback_days,
        scope,
        device_id,
        intel_items_scanned: recentIndicators.length,
        indicators_correlated: correlationMatches.length,
        alerts_created: alertsCreated,
        alerts_updated: alertsUpdated
      },
      entity_type: 'ProactiveRiskAlert'
    });

    return Response.json({
      organization_id: orgId,
      evaluated_at,
      dry_run,
      lookback_days,
      scope,
      device_id,
      intel_items_scanned: recentIndicators.length,
      indicators_correlated: correlationMatches.length,
      alerts_created: alertsCreated,
      alerts_updated: alertsUpdated,
      top_alerts: topAlerts,
      warnings: []
    });

  } catch (error) {
    console.error('Threat intel correlation failed:', error);
    return Response.json({ 
      error: error.message || 'Correlation failed',
      warnings: [error.message]
    }, { status: 500 });
  }
});

function buildRecommendations(match) {
  const recommendations = [];

  if (match.policy_gaps.includes('passcode.required=unchecked')) {
    recommendations.push({
      action: 'Enable and enforce device passcode requirement',
      priority: 1,
      rationale: 'Mitigates credential theft risk for devices exposed to credential access TTPs'
    });
  }

  if (match.policy_gaps.includes('firewall.profile=OFF')) {
    recommendations.push({
      action: 'Enable firewall protection with STRICT profile',
      priority: 1,
      rationale: 'Blocks malicious network connections to known threat IPs/domains'
    });
  }

  if (match.cve_tags.length > 0) {
    recommendations.push({
      action: 'Review device OS version and apply security patches',
      priority: 1,
      rationale: `CVE tags present: ${match.cve_tags.join(', ')}`
    });
  }

  return recommendations;
}

function buildPolicyChanges(match) {
  const changes = [];

  if (match.policy_gaps.includes('passcode.required=unchecked')) {
    changes.push({
      path: 'policy_config.hardening_checklist.items[passcode_required].validation',
      from: 'MANUAL_ATTESTATION',
      to: 'AUTOMATED_CHECK',
      rationale: 'Mitigate credential theft risk'
    });
  }

  if (match.policy_gaps.includes('firewall.profile=OFF')) {
    changes.push({
      path: 'policy_config.firewall_config.profile',
      from: 'OFF',
      to: 'STRICT',
      rationale: 'Block malicious network connections'
    });
  }

  return {
    policy_domain: 'security_posture',
    changes
  };
}