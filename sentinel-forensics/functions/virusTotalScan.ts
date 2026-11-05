import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { url, type } = await req.json();
        
        if (!url || !type) {
            return Response.json({ error: 'URL and type required' }, { status: 400 });
        }

        const vtApiKey = Deno.env.get("VIRUSTOTAL_API_KEY");
        
        if (type === 'url') {
            const scanResponse = await fetch('https://www.virustotal.com/api/v3/urls', {
                method: 'POST',
                headers: {
                    'x-apikey': vtApiKey,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({ url })
            });

            if (!scanResponse.ok) {
                return Response.json({ 
                    error: 'VirusTotal API error', 
                    details: await scanResponse.text() 
                }, { status: scanResponse.ok });
            }

            const scanData = await scanResponse.json();
            const analysisId = scanData.data.id;

            await new Promise(resolve => setTimeout(resolve, 15000));

            const resultResponse = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
                headers: { 'x-apikey': vtApiKey }
            });

            const resultData = await resultResponse.json();
            const stats = resultData.data.attributes.stats;

            return Response.json({
                url,
                malicious: stats.malicious || 0,
                suspicious: stats.suspicious || 0,
                harmless: stats.harmless || 0,
                undetected: stats.undetected || 0,
                total_scans: Object.values(stats).reduce((a, b) => a + b, 0),
                threat_level: stats.malicious > 0 ? 'malicious' : stats.suspicious > 0 ? 'suspicious' : 'clean',
                scan_date: resultData.data.attributes.date
            });
        } else if (type === 'ip') {
            const response = await fetch(`https://www.virustotal.com/api/v3/ip_addresses/${url}`, {
                headers: { 'x-apikey': vtApiKey }
            });

            if (!response.ok) {
                return Response.json({ 
                    error: 'VirusTotal API error', 
                    details: await response.text() 
                }, { status: response.status });
            }

            const data = await response.json();
            const stats = data.data.attributes.last_analysis_stats;

            return Response.json({
                ip: url,
                malicious: stats.malicious || 0,
                suspicious: stats.suspicious || 0,
                harmless: stats.harmless || 0,
                undetected: stats.undetected || 0,
                total_scans: Object.values(stats).reduce((a, b) => a + b, 0),
                threat_level: stats.malicious > 0 ? 'malicious' : stats.suspicious > 0 ? 'suspicious' : 'clean',
                country: data.data.attributes.country,
                asn: data.data.attributes.asn,
                network: data.data.attributes.network
            });
        }

        return Response.json({ error: 'Invalid type' }, { status: 400 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});