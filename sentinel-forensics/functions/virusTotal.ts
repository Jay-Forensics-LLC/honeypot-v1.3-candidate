import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { hash, type = 'file' } = await req.json();

        if (!hash) {
            return Response.json({ error: 'Hash or identifier is required' }, { status: 400 });
        }

        const apiKey = Deno.env.get('VIRUSTOTAL_API_KEY');
        if (!apiKey) {
            return Response.json({ 
                error: 'VirusTotal API key not configured',
                message: 'Please add VIRUSTOTAL_API_KEY in dashboard settings'
            }, { status: 500 });
        }

        let endpoint = '';
        if (type === 'file') {
            endpoint = `https://www.virustotal.com/api/v3/files/${hash}`;
        } else if (type === 'url') {
            const urlId = btoa(hash).replace(/=/g, '');
            endpoint = `https://www.virustotal.com/api/v3/urls/${urlId}`;
        } else if (type === 'ip') {
            endpoint = `https://www.virustotal.com/api/v3/ip_addresses/${hash}`;
        } else if (type === 'domain') {
            endpoint = `https://www.virustotal.com/api/v3/domains/${hash}`;
        }

        const response = await fetch(endpoint, {
            headers: {
                'x-apikey': apiKey
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return Response.json({
                    success: true,
                    found: false,
                    message: 'No data found in VirusTotal for this identifier'
                });
            }
            const errorText = await response.text();
            return Response.json({ 
                error: 'VirusTotal API request failed', 
                details: errorText 
            }, { status: response.status });
        }

        const data = await response.json();
        const attributes = data.data.attributes;
        const stats = attributes.last_analysis_stats || {};

        const malicious = stats.malicious || 0;
        const suspicious = stats.suspicious || 0;
        const total = Object.values(stats).reduce((a, b) => a + b, 0);

        // Create audit log with organization isolation
        await base44.entities.AuditLog.create({
            organization_id: user.organization_id,
            event_type: 'virustotal_lookup',
            severity: malicious > 0 ? 'warning' : 'info',
            description: `VirusTotal lookup for ${type}: ${hash}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                hash,
                type,
                malicious_count: malicious,
                total_engines: total
            }
        }).catch((err) => console.warn('Audit log failed:', err));

        return Response.json({
            success: true,
            found: true,
            source: 'VirusTotal',
            type: type,
            identifier: hash,
            stats: stats,
            malicious_count: malicious,
            suspicious_count: suspicious,
            total_engines: total,
            detection_rate: total > 0 ? ((malicious / total) * 100).toFixed(1) : 0,
            threat_level: malicious > 5 ? 'critical' : 
                         malicious > 2 ? 'high' : 
                         malicious > 0 ? 'medium' : 'clean',
            names: attributes.names || [],
            tags: attributes.tags || [],
            reputation: attributes.reputation || 0,
            last_analysis_date: attributes.last_analysis_date,
            permalink: `https://www.virustotal.com/gui/${type}/${hash}`,
            analysis_results: attributes.last_analysis_results
        });

    } catch (error) {
        console.error('VirusTotal lookup error:', error);
        return Response.json({ 
            error: 'Internal server error', 
            message: error.message 
        }, { status: 500 });
    }
});