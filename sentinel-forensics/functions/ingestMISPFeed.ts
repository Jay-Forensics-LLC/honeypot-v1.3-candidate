import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * MISP FEED INTEGRATION
 * 
 * Ingests threat intelligence from MISP (Malware Information Sharing Platform)
 * Supports events, attributes, and objects
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { misp_url, misp_api_key, event_id } = await req.json();

        if (!misp_url || !misp_api_key) {
            return Response.json({
                error: 'MISP URL and API key required',
                example: {
                    misp_url: 'https://misp.example.com',
                    misp_api_key: 'your-api-key',
                    event_id: 'optional-specific-event-id'
                }
            }, { status: 400 });
        }

        // Fetch events from MISP
        const eventsUrl = event_id 
            ? `${misp_url}/events/view/${event_id}`
            : `${misp_url}/events/index`;

        const response = await fetch(eventsUrl, {
            headers: {
                'Authorization': misp_api_key,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`MISP API error: ${response.status}`);
        }

        const mispData = await response.json();
        const events = Array.isArray(mispData) ? mispData : [mispData.Event];

        let iocsIngested = 0;
        let aptGroupsCreated = 0;

        for (const event of events) {
            const eventData = event.Event || event;
            
            // Process attributes (IOCs)
            for (const attr of eventData.Attribute || []) {
                try {
                    const iocId = `IOC-MISP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    
                    await base44.asServiceRole.entities.IOCIndicator.create({
                        indicator_id: iocId,
                        indicator_type: mapMISPType(attr.type),
                        value: attr.value,
                        confidence: attr.to_ids ? 0.85 : 0.6,
                        extraction_method: 'misp_feed',
                        context: {
                            event_id: eventData.id,
                            event_info: eventData.info,
                            category: attr.category,
                            comment: attr.comment
                        },
                        threat_classification: attr.to_ids ? 'malicious' : 'suspicious',
                        tags: eventData.Tag?.map(t => t.name) || [],
                        feed_sources: [{
                            feed_id: 'misp',
                            feed_name: 'MISP',
                            score: attr.to_ids ? 85 : 60,
                            confidence: attr.to_ids ? 0.85 : 0.6,
                            last_seen: eventData.timestamp,
                            tags: eventData.Tag?.map(t => t.name) || []
                        }]
                    });
                    
                    iocsIngested++;
                } catch (error) {
                    console.warn('MISP IOC creation failed:', error);
                }
            }

            // Check for APT threat actor tags
            const aptTags = eventData.Tag?.filter(t => 
                t.name.toLowerCase().includes('apt') || 
                t.name.toLowerCase().includes('threat-actor')
            ) || [];

            if (aptTags.length > 0) {
                const aptName = aptTags[0].name;
                const aptId = `APT-MISP-${Date.now()}`;

                try {
                    await base44.asServiceRole.entities.APTGroup.create({
                        group_name: aptName,
                        aliases: aptTags.map(t => t.name),
                        origin_country: eventData.Orgc?.nationality || 'Unknown',
                        first_observed: eventData.date,
                        motivation: 'cyber_espionage',
                        target_sectors: [],
                        target_regions: [],
                        ttps: {},
                        threat_level: eventData.threat_level_id === '1' ? 'high' : 'medium',
                        activity_status: 'active',
                        confidence_score: 70,
                        linked_iocs: (eventData.Attribute || []).map(a => a.value)
                    });
                    
                    aptGroupsCreated++;
                } catch (error) {
                    console.warn('APT group creation failed (may already exist):', error);
                }
            }
        }

        return Response.json({
            success: true,
            events_processed: events.length,
            iocs_ingested: iocsIngested,
            apt_groups_created: aptGroupsCreated,
            source: 'MISP'
        });

    } catch (error) {
        console.error('MISP ingestion error:', error);
        return Response.json({
            error: 'MISP ingestion failed',
            message: error.message
        }, { status: 500 });
    }
});

function mapMISPType(mispType) {
    const typeMap = {
        'ip-src': 'ip',
        'ip-dst': 'ip',
        'domain': 'domain',
        'hostname': 'domain',
        'url': 'url',
        'md5': 'md5',
        'sha1': 'sha1',
        'sha256': 'sha256',
        'email-src': 'email',
        'email-dst': 'email',
        'mutex': 'mutex',
        'filename': 'file_name',
        'user-agent': 'user_agent'
    };
    
    return typeMap[mispType] || 'unknown';
}