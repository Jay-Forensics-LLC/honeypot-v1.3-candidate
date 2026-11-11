import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

/**
 * RUN EMAIL ENRICHMENT
 * Validates emails, detects disposable/temporary providers,
 * scores domain reputation, and applies policy overrides
 */

// Built-in disposable email domains
const BUILT_IN_DISPOSABLE = [
  'tempmail.com', 'guerrillamail.com', 'mailinator.com', '10minutemail.com',
  'throwaway.email', 'temp-mail.org', 'maildrop.cc', 'getnada.com',
  'trashmail.com', 'fakeinbox.com', 'yopmail.com', 'sharklasers.com'
];

const FREE_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
  'protonmail.com', 'aol.com', 'mail.com', 'zoho.com'
];

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
      cacheTtlHours: parametersJson.cacheTtlHours || 24,
      disposableDomainListMode: parametersJson.disposableDomainListMode || 'built_in_plus_user',
      allowFreeProviders: parametersJson.allowFreeProviders !== false
    };

    // Create enrichment run
    const { data: runData } = await base44.functions.invoke('createEnrichmentRun', {
      caseId,
      runType: 'email_enrichment',
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
      indicator_type: 'email'
    });

    const allowlist = policyEntries.filter(p => p.list_type === 'allow');
    const blocklist = policyEntries.filter(p => p.list_type === 'block');

    // Fetch disposable email domains
    let disposableDomains = [...BUILT_IN_DISPOSABLE];
    if (params.disposableDomainListMode === 'built_in_plus_user') {
      const userDomains = await base44.asServiceRole.entities.DisposableEmailDomain.filter({
        case_id: caseId
      });
      disposableDomains = [...disposableDomains, ...userDomains.map(d => d.domain)];
    }

    // Process each indicator
    const results = [];
    for (const indicatorId of inputIndicatorIds) {
      const indicators = await base44.asServiceRole.entities.Indicator.filter({ id: indicatorId });
      if (indicators.length === 0) continue;
      
      const indicator = indicators[0];
      if (indicator.indicator_type !== 'email') {
        console.warn(`Skipping non-email indicator: ${indicatorId}`);
        continue;
      }

      const email = indicator.value;
      const [localPart, domain] = email.split('@');
      
      if (!localPart || !domain) {
        console.warn(`Invalid email format: ${email}`);
        continue;
      }

      const scoringBreakdown = [];
      let baseScore = 0;
      let confidence = 0.7;
      const tags = [];

      // Hash local part for privacy
      const encoder = new TextEncoder();
      const localPartData = encoder.encode(localPart);
      const hashBuffer = await crypto.subtle.digest('SHA-256', localPartData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const localPartHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Syntax validation
      const syntaxValid = validateEmailSyntax(email);
      if (!syntaxValid) {
        baseScore += 30;
        tags.push('Invalid Syntax');
        scoringBreakdown.push({
          ruleId: 'invalid_syntax',
          points: 30,
          reason: 'Email syntax validation failed',
          evidenceRefs: []
        });
      }

      // Policy override checks
      const allowEntry = allowlist.find(e => e.pattern.toLowerCase() === email.toLowerCase());
      const blockEntry = blocklist.find(e => e.pattern.toLowerCase() === email.toLowerCase());

      let isDisposable = false;
      let isFreeProvider = false;
      let domainHasMX = null; // Best-effort; set to null if not checked

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
        // Disposable email detection
        isDisposable = disposableDomains.includes(domain.toLowerCase());
        if (isDisposable) {
          baseScore += 50;
          tags.push('Disposable Email');
          confidence = 0.9;
          scoringBreakdown.push({
            ruleId: 'disposable_domain',
            points: 50,
            reason: `Domain ${domain} is known disposable/temporary email provider`,
            evidenceRefs: []
          });
        }

        // Free provider check
        isFreeProvider = FREE_PROVIDERS.includes(domain.toLowerCase());
        if (isFreeProvider && !params.allowFreeProviders) {
          baseScore += 10;
          tags.push('Free Provider');
          scoringBreakdown.push({
            ruleId: 'free_provider',
            points: 10,
            reason: 'Free email provider (not inherently malicious)',
            evidenceRefs: []
          });
        }

        // Recent abuse within case
        const events = await base44.asServiceRole.entities.NormalizedEvent.filter({
          case_id: caseId,
          actor_user: email
        });

        if (events.length > 0) {
          const suspiciousEvents = events.filter(e => 
            e.event_type === 'auth' && 
            e.attributes_json?.auth_result === 'failed'
          );

          if (suspiciousEvents.length > 5) {
            baseScore += 35;
            tags.push('Recent Abuse');
            scoringBreakdown.push({
              ruleId: 'auth_failures',
              points: 35,
              reason: `${suspiciousEvents.length} failed auth attempts`,
              evidenceRefs: suspiciousEvents.slice(0, 10).map(e => e.id)
            });
          } else if (suspiciousEvents.length > 0) {
            baseScore += 15;
            tags.push('Some Failed Attempts');
            scoringBreakdown.push({
              ruleId: 'minor_auth_failures',
              points: 15,
              reason: `${suspiciousEvents.length} failed auth attempts`,
              evidenceRefs: suspiciousEvents.map(e => e.id)
            });
          }
        }

        // Domain reputation heuristic
        const domainAge = estimateDomainAge(domain, events);
        if (domainAge !== null && domainAge < 30) {
          baseScore += 20;
          tags.push('New Domain');
          scoringBreakdown.push({
            ruleId: 'new_domain',
            points: 20,
            reason: `Domain appears recent (est. ${domainAge} days)`,
            evidenceRefs: []
          });
        }
      }

      // Cap score
      baseScore = Math.min(100, Math.max(0, baseScore));

      // Build normalized JSON
      const normalizedJson = {
        email,
        localPartHash,
        domain,
        syntaxValid,
        domainHasMX: null, // Best-effort MX check not implemented
        disposable: isDisposable,
        freeProvider: isFreeProvider,
        domainAgeEstimateDays: estimateDomainAge(domain, []),
        recentAbuse: baseScore >= 40,
        riskScore: baseScore,
        confidence,
        tags,
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

      // Update/create EmailRiskProfile
      const profiles = await base44.asServiceRole.entities.EmailRiskProfile.filter({
        case_id: caseId,
        indicator_id: indicator.id
      });

      if (profiles.length > 0) {
        await base44.asServiceRole.entities.EmailRiskProfile.update(profiles[0].id, {
          latest_result_id: resultData.result.id,
          current_risk_score: baseScore,
          current_confidence: confidence,
          current_tags: tags
        });
      } else {
        await base44.asServiceRole.entities.EmailRiskProfile.create({
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
        low_risk: results.filter(r => r.risk_score < 40).length,
        disposable: results.filter(r => r.normalized_json.disposable).length
      }
    });

  } catch (error) {
    console.error('runEmailEnrichment error:', error);
    return Response.json({ 
      error: 'Email enrichment failed', 
      details: error.message 
    }, { status: 500 });
  }
});

function validateEmailSyntax(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function estimateDomainAge(domain, events) {
  // Heuristic: if we have events, estimate based on first appearance
  // Otherwise return null
  if (events.length === 0) return null;
  
  const timestamps = events.map(e => new Date(e.event_time)).sort((a, b) => a - b);
  const firstSeen = timestamps[0];
  const daysSinceFirst = (Date.now() - firstSeen.getTime()) / (1000 * 60 * 60 * 24);
  
  return Math.floor(daysSinceFirst);
}

function buildSummary(normalized, tags) {
  const parts = [];
  parts.push(`Risk Score: ${normalized.riskScore}/100`);
  if (normalized.disposable) parts.push('Disposable domain');
  if (normalized.freeProvider) parts.push('Free provider');
  if (!normalized.syntaxValid) parts.push('Invalid syntax');
  if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);
  return parts.join(' | ');
}