import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * AlienVault OTX Threat Intelligence Integration
 * Enriches indicators with community threat data
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { indicator_type, indicator_value } = await req.json();

        if (!indicator_type || !indicator_value) {
            return Response.json({
                error: 'Missing required fields',
                required: ['indicator_type', 'indicator_value']
            }, { status: 400 });
        }

        const apiKey = Deno.env.get('ALIENVAULT_OTX_API_KEY');
        if (!apiKey) {
            return Response.json({
                error: 'AlienVault OTX API key not configured',
                message: 'Please configure ALIENVAULT_OTX_API_KEY in environment variables'
            }, { status: 500 });
        }

        let endpoint;
        switch (indicator_type) {
            case 'ip':
                endpoint = `https://otx.alienvault.com/api/v1/indicators/IPv4/${encodeURIComponent(indicator_value)}/general`;
                break;
            case 'domain':
                endpoint = `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(indicator_value)}/general`;
                break;
            case 'url':
                endpoint = `https://otx.alienvault.com/api/v1/indicators/url/${encodeURIComponent(indicator_value)}/general`;
                break;
            case 'sha256':
            case 'md5':
            case 'sha1':
                endpoint = `https://otx.alienvault.com/api/v1/indicators/file/${encodeURIComponent(indicator_value)}/general`;
                break;
            default:
                return Response.json({
                    error: 'Unsupported indicator type',
                    supported: ['ip', 'domain', 'url', 'sha256', 'md5', 'sha1']
                }, { status: 400 });
        }

        const response = await fetch(endpoint, {
            headers: {
                'X-OTX-API-KEY': apiKey,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return Response.json({
                error: 'AlienVault OTX API request failed',
                status: response.status,
                details: errorText
            }, { status: response.status });
        }

        const data = await response.json();

        // Fetch pulse information (threat campaigns)
        let pulseEndpoint;
        switch (indicator_type) {
            case 'ip':
                pulseEndpoint = `https://otx.alienvault.com/api/v1/indicators/IPv4/${encodeURIComponent(indicator_value)}/malware`;
                break;
            case 'domain':
                pulseEndpoint = `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(indicator_value)}/malware`;
                break;
            default:
                pulseEndpoint = null;
        }

        let pulseData = null;
        if (pulseEndpoint) {
            const pulseResponse = await fetch(pulseEndpoint, {
                headers: {
                    'X-OTX-API-KEY': apiKey,
                    'Accept': 'application/json'
                }
            });
            if (pulseResponse.ok) {
                pulseData = await pulseResponse.json();
            }
        }

        // Calculate threat score
        const pulseCount = data.pulse_info?.count || 0;
        const threatScore = Math.min(100, pulseCount * 10); // Simple scoring

        // Audit log
        await base44.entities.AuditLog.create({
            event_type: 'otx_lookup',
            severity: 'info',
            description: `AlienVault OTX lookup for ${indicator_type}: ${indicator_value}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                indicator_type,
                indicator_value,
                pulse_count: pulseCount,
                threat_score: threatScore
            }
        });

        return Response.json({
            success: true,
            source: 'AlienVault OTX',
            indicator_type,
            indicator_value,
            threat_score: threatScore,
            reputation: threatScore > 50 ? 'malicious' : threatScore > 20 ? 'suspicious' : 'clean',
            pulse_info: {
                count: pulseCount,
                pulses: data.pulse_info?.pulses?.slice(0, 10) || []
            },
            general_info: {
                whois: data.whois,
                geo: data.geo,
                asn: data.asn,
                reputation: data.reputation
            },
            malware_families: pulseData?.data?.slice(0, 5) || [],
            tags: data.pulse_info?.pulses?.flatMap(p => p.tags || []).slice(0, 20) || [],
            references: data.pulse_info?.references?.slice(0, 5) || []
        });

    } catch (error) {
        console.error('AlienVault OTX error:', error);
        return Response.json({
            error: 'OTX lookup failed',
            message: error.message
        }, { status: 500 });
    }
});