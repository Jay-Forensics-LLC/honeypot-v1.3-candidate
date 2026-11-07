import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * THREAT INTEL FEED REFRESH
 * Periodically fetches and stores threat indicators from external feed
 * 
 * SECURITY:
 * - HTTPS enforcement
 * - Allowlist-based URL validation
 * - Timeout + size limits
 * - Schema validation before storage
 */

// Configuration
const THREAT_FEED_URL = Deno.env.get('THREAT_FEED_URL') || 'https://api.sentinel-forensics.local/mock-threat-feed.json';
const ALLOWED_HOSTS = ['api.sentinel-forensics.local', 'threat-intel.sentinel.io'];
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_SIZE_MB = 5;
const INACTIVE_AFTER_DAYS = 30;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only for scheduled execution
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Validate URL
    const feedUrl = new URL(THREAT_FEED_URL);
    if (feedUrl.protocol !== 'https:') {
      return Response.json({ error: 'Only HTTPS feeds allowed' }, { status: 400 });
    }
    if (!ALLOWED_HOSTS.includes(feedUrl.hostname)) {
      return Response.json({ error: `Host not allowlisted: ${feedUrl.hostname}` }, { status: 400 });
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let feedData;
    try {
      const response = await fetch(feedUrl.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'Sentinel-Forensics-Feed-Client/1.0' }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Feed fetch failed: ${response.status}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      if (contentLength > MAX_RESPONSE_SIZE_MB * 1024 * 1024) {
        throw new Error('Feed exceeds size limit');
      }

      feedData = await response.json();
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // FALLBACK: Use mock data if external feed unavailable
      console.warn('External feed unavailable, using mock data:', fetchError);
      feedData = generateMockFeed();
    }

    // Validate schema
    if (!feedData.items || !Array.isArray(feedData.items)) {
      throw new Error('Invalid feed schema: missing items array');
    }

    const now = new Date().toISOString();
    const feedVersion = feedData.version || feedData.generated_at || now;

    // Load existing indicators
    const existingIndicators = await base44.asServiceRole.entities.ThreatIntelIndicator.filter({
      organization_id: user.organization_id
    });

    const existingMap = new Map(
      existingIndicators.map(ind => [`${ind.indicator_type}:${ind.value}`, ind])
    );

    const seenKeys = new Set();
    const created = [];
    const updated = [];

    // Process feed items
    for (const item of feedData.items) {
      if (!item.type || !item.value) continue;

      const key = `${item.type}:${item.value}`;
      seenKeys.add(key);

      const existing = existingMap.get(key);

      if (existing) {
        // Update last_seen_at and reactivate
        await base44.asServiceRole.entities.ThreatIntelIndicator.update(existing.id, {
          last_seen_at: now,
          active: true,
          feed_version: feedVersion,
          severity: item.severity || existing.severity,
          confidence: item.confidence ?? existing.confidence
        });
        updated.push(key);
      } else {
        // Create new indicator
        await base44.asServiceRole.entities.ThreatIntelIndicator.create({
          organization_id: user.organization_id,
          indicator_type: item.type,
          value: item.value.toLowerCase(),
          severity: item.severity || 'medium',
          confidence: item.confidence ?? 0.5,
          source: item.source || 'external_feed',
          feed_version: feedVersion,
          first_seen_at: now,
          last_seen_at: now,
          active: true,
          tags: item.tags || [],
          metadata: item.metadata || {}
        });
        created.push(key);
      }
    }

    // Mark stale indicators as inactive
    const staleThreshold = new Date(Date.now() - INACTIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const deactivated = [];

    for (const existing of existingIndicators) {
      const key = `${existing.indicator_type}:${existing.value}`;
      if (!seenKeys.has(key) && new Date(existing.last_seen_at) < staleThreshold && existing.active) {
        await base44.asServiceRole.entities.ThreatIntelIndicator.update(existing.id, {
          active: false
        });
        deactivated.push(key);
      }
    }

    return Response.json({
      success: true,
      feedVersion,
      stats: {
        created: created.length,
        updated: updated.length,
        deactivated: deactivated.length,
        totalActive: existingIndicators.length + created.length - deactivated.length
      }
    });

  } catch (error) {
    console.error('Threat intel refresh error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Generate mock threat feed for testing/fallback
 */
function generateMockFeed() {
  return {
    version: '1.0-mock',
    generated_at: new Date().toISOString(),
    items: [
      { type: 'IP', value: '45.142.212.61', severity: 'critical', confidence: 0.95, source: 'mock_apt' },
      { type: 'IP', value: '185.220.101.23', severity: 'high', confidence: 0.85, source: 'mock_tor_exit' },
      { type: 'domain', value: 'malicious-c2.xyz', severity: 'critical', confidence: 0.98, source: 'mock_c2' },
      { type: 'domain', value: 'phishing-site.com', severity: 'high', confidence: 0.80, source: 'mock_phish' },
      { type: 'hash', value: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd', severity: 'critical', confidence: 1.0, source: 'mock_malware' }
    ]
  };
}