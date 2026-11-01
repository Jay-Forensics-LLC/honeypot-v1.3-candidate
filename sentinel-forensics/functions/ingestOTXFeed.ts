import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ALIENVAULT OTX FEED INTEGRATION
 * 
 * Ingests threat intelligence from AlienVault Open Threat Exchange
 * Supports pulses (threat reports) and IOC extraction
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const OTX_API_KEY = Deno.env.get('ALIENVAULT_OTX_API_KEY');
        
        if (!OTX_API_KEY) {
            return Response.json({
                error: 'ALIENVAULT_OTX_API_KEY not configured'
            }, { status: 500 });
        }

        const { feed_type, query_params } = await req.json();

        // Fetch pulses from OTX
        const pulsesUrl = query_params?.subscribed 
            ? 'https://otx.alienvault.com/api/v1/pulses/subscribed'
            : 'https://otx.alienvault.com/api/v1/pulses/activity';

        const response = await fetch(pulsesUrl, {
            headers: {
                'X-OTX-API-KEY': OTX_API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`OTX API error: ${response.status}`);
        }

        const data = await response.json();
        const pulses = data.results || [];

        let iocsIngested = 0;
        let aptGroupsUpdated = 0;
        let campaignsCreated = 0;

        for (const pulse of pulses.slice(0, 50)) { // Process first 50
            // Extract IOCs from pulse
            const indicators = pulse.indicators || [];
            
            for (const indicator of indicators) {
                try {
                    const iocId = `IOC-OTX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    
                    await base44.asServiceRole.entities.IOCIndicator.create({
                        indicator_id: iocId,
                        indicator_type: mapOTXType(indicator.type),
                        value: indicator.indicator,
                        confidence: 0.75,
                        extraction_method: 'otx_feed',
                        context: {
                            pulse_name: pulse.name,
                            pulse_id: pulse.id,
                            pulse_created: pulse.created
                        },
                        reputation_score: indicator.is_active ? 30 : 70,
                        threat_classification: 'malicious',
                        tags: pulse.tags || [],
                        feed_sources: [{
                            feed_id: 'otx',
                            feed_name: 'AlienVault OTX',
                            score: 75,
                            confidence: 0.75,
                            last_seen: pulse.modified,
                            tags: pulse.tags
                        }]
                    });
                    
                    iocsIngested++;
                } catch (error) {
                    console.warn('IOC creation failed:', error);
                }
            }

            // Check if pulse describes APT campaign
            if (pulse.adversary || pulse.tags.some(t => t.toLowerCase().includes('apt'))) {
                const campaignId = `CAMP-OTX-${Date.now()}`;
                
                try {
                    await base44.asServiceRole.entities.ThreatCampaign.create({
                        campaign_id: campaignId,
                        campaign_name: pulse.name,
                        campaign_status: 'active',
                        first_observed: pulse.created,
                        last_observed: pulse.modified,
                        target_sectors: pulse.industries || [],
                        target_regions: [],
                        objectives: [pulse.description],
                        associated_iocs: indicators.map(i => i.indicator),
                        victims_count: 0,
                        detection_coverage: 50
                    });
                    
                    campaignsCreated++;
                } catch (error) {
                    console.warn('Campaign creation failed:', error);
                }
            }
        }

        // Trigger correlation analysis
        await base44.functions.invoke('correlateIntelWithEvents', {});

        return Response.json({
            success: true,
            pulses_processed: pulses.length,
            iocs_ingested: iocsIngested,
            campaigns_created: campaignsCreated,
            source: 'AlienVault OTX'
        });

    } catch (error) {
        console.error('OTX ingestion error:', error);
        return Response.json({
            error: 'OTX ingestion failed',
            message: error.message
        }, { status: 500 });
    }
});

function mapOTXType(otxType) {
    const typeMap = {
        'IPv4': 'ip',
        'IPv6': 'ip',
        'domain': 'domain',
        'hostname': 'domain',
        'URL': 'url',
        'FileHash-MD5': 'md5',
        'FileHash-SHA1': 'sha1',
        'FileHash-SHA256': 'sha256',
        'email': 'email',
        'Mutex': 'mutex'
    };
    
    return typeMap[otxType] || 'unknown';
}