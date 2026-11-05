import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { indicator, type } = await req.json();
        
        if (!indicator || !type) {
            return Response.json({ error: 'Indicator and type required' }, { status: 400 });
        }

        const otxApiKey = Deno.env.get("ALIENVAULT_OTX_API_KEY");
        
        let endpoint = '';
        if (type === 'ip') {
            endpoint = `https://otx.alienvault.com/api/v1/indicators/IPv4/${indicator}/general`;
        } else if (type === 'domain') {
            endpoint = `https://otx.alienvault.com/api/v1/indicators/domain/${indicator}/general`;
        } else if (type === 'url') {
            endpoint = `https://otx.alienvault.com/api/v1/indicators/url/${encodeURIComponent(indicator)}/general`;
        }

        const response = await fetch(endpoint, {
            headers: {
                'X-OTX-API-KEY': otxApiKey
            }
        });

        if (!response.ok) {
            return Response.json({ 
                error: 'AlienVault OTX API error', 
                details: await response.text() 
            }, { status: response.status });
        }

        const data = await response.json();
        
        return Response.json({
            indicator,
            type,
            reputation: data.reputation || 0,
            pulse_count: data.pulse_info?.count || 0,
            pulses: (data.pulse_info?.pulses || []).slice(0, 5).map(p => ({
                name: p.name,
                description: p.description,
                created: p.created,
                tags: p.tags
            })),
            threat_score: data.reputation < 0 ? 'malicious' : data.pulse_info?.count > 0 ? 'suspicious' : 'unknown'
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});