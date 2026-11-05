import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

/**
 * DERIVE DEVICE FINGERPRINTS FROM EVENTS
 * Builds stable fingerprints from user-agent and platform hints
 * Detects spoofing via contradiction analysis
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caseId, timeRange = null } = await req.json();

    if (!caseId) {
      return Response.json({ error: 'caseId required' }, { status: 400 });
    }

    // Fetch events
    let events = await base44.asServiceRole.entities.NormalizedEvent.filter({
      case_id: caseId
    });

    // Apply time range if specified
    if (timeRange) {
      const start = new Date(timeRange.start);
      const end = new Date(timeRange.end);
      events = events.filter(e => {
        const eventTime = new Date(e.event_time);
        return eventTime >= start && eventTime <= end;
      });
    }

    // Extract fingerprint data from events
    const fingerprintGroups = new Map();

    for (const event of events) {
      const attrs = event.attributes_json || {};
      const ua = attrs.user_agent || attrs.userAgent || null;
      
      if (!ua) continue;

      // Build fingerprint components
      const components = {
        userAgent: ua,
        platform: attrs.platform || null,
        acceptLanguage: attrs.accept_language || attrs.acceptLanguage || null,
        timezone: attrs.timezone || null,
        screenResolution: attrs.screen_resolution || null
      };

      // Generate fingerprint ID
      const fpString = JSON.stringify(components);
      const encoder = new TextEncoder();
      const data = encoder.encode(fpString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fingerprintId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      if (!fingerprintGroups.has(fingerprintId)) {
        fingerprintGroups.set(fingerprintId, {
          fingerprintId,
          components,
          events: []
        });
      }

      fingerprintGroups.get(fingerprintId).events.push(event);
    }

    const fingerprints = [];

    // Analyze each fingerprint group
    for (const [fpId, group] of fingerprintGroups.entries()) {
      const signals = detectSpoofing(group.components);
      const riskScore = calculateDeviceRisk(group.components, signals, group.events);
      const confidence = calculateConfidence(group.events.length, signals);
      const tags = buildTags(signals, group.components);

      const fingerprint = await base44.asServiceRole.entities.DeviceFingerprint.create({
        organization_id: user.organization_id,
        case_id: caseId,
        schema_version: '1.0.0',
        fingerprint_id: fpId,
        user_agent: group.components.userAgent,
        client_hints_json: {
          platform: group.components.platform,
          acceptLanguage: group.components.acceptLanguage,
          timezone: group.components.timezone
        },
        derived_signals: signals,
        risk_score: riskScore,
        confidence,
        tags,
        traceability: {
          source_event_ids: group.events.map(e => e.id),
          source_artifact_ids: [],
          time_range: {
            start: group.events[0].event_time,
            end: group.events[group.events.length - 1].event_time
          }
        }
      });

      fingerprints.push(fingerprint);
    }

    return Response.json({
      fingerprints,
      stats: {
        total: fingerprints.length,
        spoofing_detected: fingerprints.filter(f => f.derived_signals.spoofing_likely).length,
        headless_detected: fingerprints.filter(f => f.derived_signals.headless_likely).length,
        high_risk: fingerprints.filter(f => f.risk_score >= 70).length
      }
    });

  } catch (error) {
    console.error('deriveDeviceFingerprintFromEvents error:', error);
    return Response.json({ 
      error: 'Device fingerprinting failed', 
      details: error.message 
    }, { status: 500 });
  }
});

function detectSpoofing(components) {
  const signals = {
    headless_likely: false,
    vm_likely: false,
    spoofing_likely: false
  };

  const ua = components.userAgent?.toLowerCase() || '';

  // Headless detection
  if (ua.includes('headless') || ua.includes('phantomjs') || ua.includes('selenium')) {
    signals.headless_likely = true;
    signals.spoofing_likely = true;
  }

  // VM detection
  if (ua.includes('virtualbox') || ua.includes('vmware')) {
    signals.vm_likely = true;
  }

  // Platform contradiction detection
  if (components.platform) {
    const platform = components.platform.toLowerCase();
    const isWindows = ua.includes('windows') || ua.includes('win32') || ua.includes('win64');
    const isLinux = ua.includes('linux') || ua.includes('x11');
    const isMac = ua.includes('macintosh') || ua.includes('mac os');

    // Check contradictions
    if (platform.includes('win') && (isLinux || isMac)) {
      signals.spoofing_likely = true;
    }
    if (platform.includes('linux') && (isWindows || isMac)) {
      signals.spoofing_likely = true;
    }
    if (platform.includes('mac') && (isWindows || isLinux)) {
      signals.spoofing_likely = true;
    }
  }

  return signals;
}

function calculateDeviceRisk(components, signals, events) {
  let score = 0;

  if (signals.headless_likely) score += 50;
  if (signals.vm_likely) score += 20;
  if (signals.spoofing_likely) score += 40;

  // Unusual user agent
  const ua = components.userAgent?.toLowerCase() || '';
  if (ua.length < 20 || ua.length > 500) score += 15;

  // Missing common fields
  if (!components.acceptLanguage) score += 10;
  if (!components.timezone) score += 10;

  return Math.min(100, score);
}

function calculateConfidence(eventCount, signals) {
  let confidence = 0.5;

  if (eventCount > 10) confidence += 0.2;
  if (eventCount > 50) confidence += 0.1;
  if (signals.headless_likely || signals.spoofing_likely) confidence += 0.15;

  return Math.min(1.0, confidence);
}

function buildTags(signals, components) {
  const tags = [];

  if (signals.headless_likely) tags.push('Headless Browser');
  if (signals.vm_likely) tags.push('Virtual Machine');
  if (signals.spoofing_likely) tags.push('Spoofing Detected');
  
  const ua = components.userAgent?.toLowerCase() || '';
  if (ua.includes('bot') || ua.includes('crawler')) tags.push('Bot');

  return tags;
}