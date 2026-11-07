import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { ip } = await req.json();
        
        if (!ip) {
            return Response.json({ error: 'IP address required' }, { status: 400 });
        }

        const shodanApiKey = Deno.env.get("SHODAN_API_KEY");
        
        if (!shodanApiKey) {
            return Response.json({ 
                error: 'Shodan API key not configured',
                message: 'Add SHODAN_API_KEY in dashboard settings'
            }, { status: 500 });
        }
        
        const response = await fetch(`https://api.shodan.io/shodan/host/${ip}?key=${shodanApiKey}`);
        
        if (!response.ok) {
            return Response.json({ 
                error: 'Shodan API error', 
                details: await response.text() 
            }, { status: response.status });
        }

        const data = await response.json();
        
        return Response.json({
            ip: data.ip_str,
            hostnames: data.hostnames,
            country: data.country_name,
            city: data.city,
            organization: data.org,
            isp: data.isp,
            ports: data.ports,
            vulnerabilities: data.vulns || [],
            last_update: data.last_update,
            data: data.data?.slice(0, 5) || []
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});