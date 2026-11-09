import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

/**
 * EXTRACT INDICATORS FROM CASE
 * Extracts IPs, emails, domains, URLs, hashes from NormalizedEvent
 * with strict traceability to source events/artifacts
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
      includeIPs = true,
      includeEmails = true,
      includeDomains = true,
      includeUrls = true,
      includeHashes = true,
      timeRange,
      maxIndicators = 1000
    } = await req.json();

    if (!caseId) {
      return Response.json({ error: 'caseId required' }, { status: 400 });
    }

    // Verify case access
    const caseData = await base44.asServiceRole.entities.Case.filter({ 
      id: caseId,
      organization_id: user.organization_id 
    });

    if (caseData.length === 0) {
      return Response.json({ error: 'Case not found or access denied' }, { status: 404 });
    }

    // Fetch normalized events
    let query = { case_id: caseId };
    if (timeRange?.start || timeRange?.end) {
      // Add time filtering if needed
      // Base44 SDK may need server-side filtering here
    }

    const events = await base44.asServiceRole.entities.NormalizedEvent.filter(query);
    
    if (events.length === 0) {
      return Response.json({ 
        indicators: [],
        stats: { total: 0, by_type: {} }
      });
    }

    const indicators = new Map(); // key: type:value
    const schemaVersion = '1.0.0';

    // Helper to add indicator
    const addIndicator = (type, value, event, fields) => {
      if (!value || indicators.size >= maxIndicators) return;
      
      const normalized = normalizeValue(type, value);
      if (!normalized) return;

      const key = `${type}:${normalized}`;
      
      if (indicators.has(key)) {
        const existing = indicators.get(key);
        // Update last seen and add event reference
        existing.last_seen_at = event.event_time;
        if (!existing.derived_from.source_event_ids.includes(event.id)) {
          existing.derived_from.source_event_ids.push(event.id);
        }
        if (event.artifact_id && !existing.derived_from.source_artifact_ids.includes(event.artifact_id)) {
          existing.derived_from.source_artifact_ids.push(event.artifact_id);
        }
      } else {
        indicators.set(key, {
          organization_id: user.organization_id,
          case_id: caseId,
          schema_version: schemaVersion,
          indicator_type: type,
          value: normalized,
          labels: [],
          first_seen_at: event.event_time,
          last_seen_at: event.event_time,
          derived_from: {
            source_artifact_ids: event.artifact_id ? [event.artifact_id] : [],
            source_event_ids: [event.id],
            fields_used: fields,
            time_range: timeRange || undefined
          }
        });
      }
    };

    // Extract from events
    for (const event of events) {
      if (includeIPs) {
        if (event.src_ip) addIndicator('ip', event.src_ip, event, ['src_ip']);
        if (event.dst_ip) addIndicator('ip', event.dst_ip, event, ['dst_ip']);
      }

      if (includeEmails) {
        // Extract from actor_user
        if (event.actor_user && isEmail(event.actor_user)) {
          addIndicator('email', event.actor_user, event, ['actor_user']);
        }
        
        // Extract from attributesJson
        if (event.attributes_json) {
          const emailFields = ['email', 'userEmail', 'username', 'user_email', 'sender', 'recipient', 'from', 'to'];
          for (const field of emailFields) {
            const value = event.attributes_json[field];
            if (value && typeof value === 'string') {
              // Check if username contains @ (email-like)
              if (field === 'username' && value.includes('@') && isEmail(value)) {
                addIndicator('email', value, event, [`attributes_json.${field}`]);
              } else if (field !== 'username' && isEmail(value)) {
                addIndicator('email', value, event, [`attributes_json.${field}`]);
              }
            }
          }
        }
      }

      if (includeDomains) {
        if (event.domain) addIndicator('domain', event.domain, event, ['domain']);
        if (event.sni) addIndicator('domain', event.sni, event, ['sni']);
      }

      if (includeUrls && event.attributes_json?.url) {
        addIndicator('url', event.attributes_json.url, event, ['attributes_json.url']);
      }

      if (includeHashes && event.attributes_json?.sha256) {
        addIndicator('hash_sha256', event.attributes_json.sha256, event, ['attributes_json.sha256']);
      }
    }

    // Upsert indicators (find existing, update or create)
    const indicatorList = Array.from(indicators.values());
    const createdIndicators = [];

    for (const indicator of indicatorList) {
      // Check if indicator exists
      const existing = await base44.asServiceRole.entities.Indicator.filter({
        case_id: caseId,
        indicator_type: indicator.indicator_type,
        value: indicator.value
      });

      if (existing.length > 0) {
        // Update existing
        const toUpdate = existing[0];
        await base44.asServiceRole.entities.Indicator.update(toUpdate.id, {
          last_seen_at: indicator.last_seen_at,
          derived_from: {
            ...toUpdate.derived_from,
            source_artifact_ids: [...new Set([
              ...(toUpdate.derived_from?.source_artifact_ids || []),
              ...indicator.derived_from.source_artifact_ids
            ])],
            source_event_ids: [...new Set([
              ...(toUpdate.derived_from?.source_event_ids || []),
              ...indicator.derived_from.source_event_ids
            ])]
          }
        });
        createdIndicators.push(toUpdate.id);
      } else {
        // Create new
        const created = await base44.asServiceRole.entities.Indicator.create(indicator);
        createdIndicators.push(created.id);
      }
    }

    // Stats
    const stats = {
      total: createdIndicators.length,
      by_type: {}
    };
    for (const ind of indicatorList) {
      stats.by_type[ind.indicator_type] = (stats.by_type[ind.indicator_type] || 0) + 1;
    }

    return Response.json({
      indicators: createdIndicators,
      stats,
      extracted_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('extractIndicatorsFromCase error:', error);
    return Response.json({ 
      error: 'Extraction failed', 
      details: error.message 
    }, { status: 500 });
  }
});

function normalizeValue(type, value) {
  if (!value) return null;
  
  switch (type) {
    case 'ip':
      return value.trim().toLowerCase();
    case 'email':
      return value.trim().toLowerCase();
    case 'domain':
      return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    case 'url':
      return value.trim();
    case 'hash_sha256':
      return value.trim().toLowerCase();
    default:
      return value.trim();
  }
}

function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}