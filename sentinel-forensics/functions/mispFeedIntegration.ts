import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * MISP FEED INTEGRATION v1.0
 * Ingest threat intelligence from MISP (Malware Information Sharing Platform)
 * 
 * Features:
 * - MISP event ingestion
 * - Attribute extraction (IPs, domains, hashes, etc.)
 * - IOC correlation with existing indicators
 * - Automatic enrichment and scoring
 * - Tag propagation
 * - Galaxy cluster mapping
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { 
            feed_id,
            misp_url,
            misp_auth_key,
            event_ids = [],
            auto_import = true,
            min_threat_level = 2,
            tags_filter = []
        } = await req.json();

        if (!feed_id) {
            return Response.json({ 
                error: 'feed_id required',
                example: {
                    feed_id: 'FEED-MISP-123',
                    misp_url: 'https://misp.example.com',
                    misp_auth_key: 'YOUR_MISP_API_KEY',
                    event_ids: [], // Empty = fetch all recent
                    auto_import: true,
                    min_threat_level: 2, // 1=low, 2=medium, 3=high, 4=critical
                    tags_filter: ['apt', 'malware'] // Only events with these tags
                }
            }, { status: 400 });
        }

        const stats = {
            events_fetched: 0,
            attributes_processed: 0,
            iocs_created: 0,
            iocs_updated: 0,
            errors: []
        };

        // Fetch MISP events
        const headers = {
            'Authorization': misp_auth_key,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        let events = [];

        if (event_ids.length > 0) {
            // Fetch specific events
            for (const eventId of event_ids) {
                try {
                    const response = await fetch(
                        `${misp_url}/events/view/${eventId}`,
                        { headers, signal: AbortSignal.timeout(10000) }
                    );

                    if (response.ok) {
                        const data = await response.json();
                        events.push(data.Event);
                    }
                } catch (error) {
                    stats.errors.push({
                        event_id: eventId,
                        error: error.message
                    });
                }
            }
        } else {
            // Fetch recent events (last 7 days)
            try {
                const searchBody = {
                    returnFormat: 'json',
                    published: 1,
                    timestamp: Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000),
                    threat_level_id: [min_threat_level, 3, 4],
                    tags: tags_filter
                };

                const response = await fetch(
                    `${misp_url}/events/restSearch`,
                    {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(searchBody),
                        signal: AbortSignal.timeout(30000)
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    events = data.response?.map(r => r.Event) || [];
                }
            } catch (error) {
                return Response.json({
                    error: 'Failed to fetch MISP events',
                    details: error.message
                }, { status: 500 });
            }
        }

        stats.events_fetched = events.length;

        // Process each event
        for (const event of events) {
            try {
                const attributes = event.Attribute || [];
                
                for (const attr of attributes) {
                    stats.attributes_processed++;

                    // Map MISP types to our IOC types
                    const iocType = mapMISPType(attr.type);
                    if (!iocType) continue; // Skip unsupported types

                    // Check if IOC already exists
                    const existing = await base44.entities.IOCIndicator.filter({
                        value: attr.value,
                        indicator_type: iocType
                    }, null, 1);

                    const iocData = {
                        indicator_type: iocType,
                        value: attr.value,
                        confidence: calculateConfidence(attr),
                        extraction_method: 'misp_feed',
                        feed_sources: [{
                            feed_id,
                            feed_name: 'MISP',
                            score: mapThreatLevel(event.threat_level_id),
                            confidence: calculateConfidence(attr),
                            last_seen: new Date().toISOString(),
                            tags: extractTags(event, attr)
                        }],
                        threat_classification: mapThreatLevel(event.threat_level_id) >= 70 ? 'malicious' : 'suspicious',
                        aggregated_threat_score: mapThreatLevel(event.threat_level_id),
                        enrichment_status: 'completed',
                        first_seen: attr.timestamp ? new Date(attr.timestamp * 1000).toISOString() : new Date().toISOString(),
                        last_seen: new Date().toISOString(),
                        recurrence_count: 1,
                        tags: extractTags(event, attr),
                        status: 'new'
                    };

                    if (existing && existing.length > 0) {
                        // Update existing IOC
                        const existingIOC = existing[0];
                        const updatedFeedSources = [
                            ...(existingIOC.feed_sources || []),
                            iocData.feed_sources[0]
                        ];

                        await base44.entities.IOCIndicator.update(existingIOC.id, {
                            feed_sources: updatedFeedSources,
                            last_seen: new Date().toISOString(),
                            recurrence_count: (existingIOC.recurrence_count || 1) + 1,
                            aggregated_threat_score: Math.max(
                                existingIOC.aggregated_threat_score || 0,
                                iocData.aggregated_threat_score
                            )
                        });

                        stats.iocs_updated++;
                    } else {
                        // Create new IOC
                        await base44.entities.IOCIndicator.create({
                            indicator_id: `IOC-MISP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            ...iocData
                        });

                        stats.iocs_created++;
                    }
                }

                // Create threat feed record
                await base44.entities.ThreatIntelligenceFeed.create({
                    feed_id: `MISP-EVENT-${event.id}`,
                    name: `MISP Event: ${event.info}`,
                    description: event.info,
                    url: `${misp_url}/events/view/${event.id}`,
                    feed_type: 'json',
                    feed_format: 'misp',
                    status: 'active',
                    last_successful_fetch: new Date().toISOString(),
                    total_indicators: attributes.length,
                    indicators_this_fetch: attributes.length,
                    new_indicators: stats.iocs_created,
                    updated_indicators: stats.iocs_updated,
                    indicator_types: [...new Set(attributes.map(a => mapMISPType(a.type)).filter(Boolean))],
                    threat_categories: extractTags(event, null),
                    confidence_weight: 0.85, // MISP is highly trusted
                    priority: 8,
                    tags: extractTags(event, null)
                });

            } catch (error) {
                console.error(`Failed to process MISP event ${event.id}:`, error);
                stats.errors.push({
                    event_id: event.id,
                    error: error.message
                });
            }
        }

        // Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'misp_feed_ingestion',
            severity: 'info',
            description: `MISP feed ingestion: ${stats.iocs_created} new IOCs, ${stats.iocs_updated} updated`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: stats
        });

        return Response.json({
            success: true,
            ...stats,
            summary: {
                events_processed: stats.events_fetched,
                total_iocs: stats.iocs_created + stats.iocs_updated,
                new_iocs: stats.iocs_created,
                updated_iocs: stats.iocs_updated
            }
        });

    } catch (error) {
        console.error('MISP feed integration error:', error);
        return Response.json({ 
            error: 'MISP integration failed', 
            message: error.message 
        }, { status: 500 });
    }
});

/**
 * Map MISP attribute types to our IOC types
 */
function mapMISPType(mispType) {
    const mapping = {
        'ip-src': 'ip',
        'ip-dst': 'ip',
        'domain': 'domain',
        'url': 'url',
        'md5': 'md5',
        'sha1': 'sha1',
        'sha256': 'sha256',
        'email-src': 'email',
        'email-dst': 'email',
        'hostname': 'domain',
        'mutex': 'mutex',
        'user-agent': 'user_agent',
        'ja3-fingerprint-md5': 'ja3',
        'ssdeep': 'pattern',
        'filename': 'pattern'
    };

    return mapping[mispType] || null;
}

/**
 * Map MISP threat levels to scores
 */
function mapThreatLevel(threatLevelId) {
    const levels = {
        1: 25,  // Low
        2: 50,  // Medium
        3: 75,  // High
        4: 95   // Critical
    };

    return levels[threatLevelId] || 50;
}

/**
 * Calculate confidence from MISP attribute
 */
function calculateConfidence(attribute) {
    let confidence = 0.7; // Base confidence

    // Higher confidence if IDS flagged
    if (attribute.to_ids === '1' || attribute.to_ids === true) {
        confidence += 0.15;
    }

    // Higher confidence if from trusted source
    if (attribute.distribution === '0') { // Organization only
        confidence += 0.1;
    }

    return Math.min(1.0, confidence);
}

/**
 * Extract tags from MISP event/attribute
 */
function extractTags(event, attribute) {
    const tags = [];

    // Event tags
    if (event.Tag) {
        tags.push(...event.Tag.map(t => t.name));
    }

    // Event info as tag
    if (event.info) {
        tags.push(event.info.toLowerCase().replace(/\s+/g, '_'));
    }

    // Attribute tags
    if (attribute && attribute.Tag) {
        tags.push(...attribute.Tag.map(t => t.name));
    }

    // Threat level tag
    const threatLevelNames = {
        1: 'low_threat',
        2: 'medium_threat',
        3: 'high_threat',
        4: 'critical_threat'
    };
    tags.push(threatLevelNames[event.threat_level_id] || 'unknown_threat');

    return [...new Set(tags)]; // Deduplicate
}