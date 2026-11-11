import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * AbuseIPDB API Integration - OPTIMIZED
 * Checks IP reputation against AbuseIPDB threat database
 * Returns comprehensive threat intelligence with confidence scoring
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { ip_address } = await req.json();

        if (!ip_address) {
            return Response.json({ 
                error: 'IP address is required',
                example: { ip_address: '8.8.8.8' }
            }, { status: 400 });
        }

        // Validate IP format
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(ip_address)) {
            return Response.json({ 
                error: 'Invalid IP address format',
                received: ip_address
            }, { status: 400 });
        }

        const apiKey = Deno.env.get('ABUSEIPDB_API_KEY');
        if (!apiKey) {
            return Response.json({ 
                error: 'AbuseIPDB API key not configured',
                setup: 'Add ABUSEIPDB_API_KEY to environment variables'
            }, { status: 500 });
        }

        // Check IP against AbuseIPDB with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        let response;
        try {
            response = await fetch(
                `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip_address)}&maxAgeInDays=90&verbose`,
                {
                    method: 'GET',
                    headers: {
                        'Key': apiKey,
                        'Accept': 'application/json'
                    },
                    signal: controller.signal
                }
            );
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            const errorText = await response.text();
            
            // Handle rate limiting
            if (response.status === 429) {
                return Response.json({ 
                    error: 'Rate limit exceeded', 
                    details: 'AbuseIPDB daily quota reached. Try again tomorrow.',
                    retry_after: response.headers.get('X-RateLimit-Reset') || 'tomorrow'
                }, { status: 429 });
            }
            
            return Response.json({ 
                error: 'AbuseIPDB API request failed', 
                status: response.status,
                details: errorText 
            }, { status: response.status });
        }

        const data = await response.json();
        const ipData = data.data;

        // Calculate normalized threat level
        const threatLevel = ipData.abuseConfidenceScore >= 75 ? 'critical' : 
                           ipData.abuseConfidenceScore >= 50 ? 'high' :
                           ipData.abuseConfidenceScore >= 25 ? 'medium' : 'low';

        // Create audit log (async, don't block response)
        base44.entities.AuditLog.create({
            event_type: 'abuseipdb_lookup',
            severity: threatLevel === 'critical' ? 'warning' : 'info',
            description: `IP reputation check for ${ip_address} - Abuse Score: ${ipData.abuseConfidenceScore}%`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                ip_address,
                abuse_confidence_score: ipData.abuseConfidenceScore,
                total_reports: ipData.totalReports,
                threat_level: threatLevel,
                is_whitelisted: ipData.isWhitelisted,
                country: ipData.countryCode
            }
        }).catch(err => console.error('Audit log failed:', err));

        // Store IP reputation score if threat detected
        if (ipData.abuseConfidenceScore >= 25) {
            base44.entities.IPReputationScore.create({
                ip_address,
                reputation_score: 100 - ipData.abuseConfidenceScore,
                threat_categories: ipData.usageType ? [ipData.usageType.toLowerCase()] : [],
                geographic_info: {
                    country: ipData.countryCode,
                    isp: ipData.isp,
                    is_hosting_provider: ipData.usageType === 'Data Center/Web Hosting/Transit',
                    is_vpn: ipData.usageType?.includes('VPN') || false,
                    is_tor: ipData.isTor || false
                },
                malicious_activity: {
                    reported_incidents: ipData.totalReports,
                    last_seen_malicious: ipData.lastReportedAt
                },
                threat_intel_sources: [{
                    source_name: 'AbuseIPDB',
                    report_date: new Date().toISOString(),
                    classification: threatLevel,
                    details: `Abuse confidence: ${ipData.abuseConfidenceScore}%`
                }],
                risk_assessment: threatLevel === 'critical' ? 'critical' :
                                threatLevel === 'high' ? 'high_risk' :
                                threatLevel === 'medium' ? 'medium_risk' : 'low_risk',
                recommended_action: ipData.abuseConfidenceScore >= 75 ? 'block' :
                                   ipData.abuseConfidenceScore >= 50 ? 'alert' :
                                   ipData.abuseConfidenceScore >= 25 ? 'monitor' : 'allow',
                last_scanned: new Date().toISOString()
            }).catch(err => console.error('IP reputation storage failed:', err));
        }

        return Response.json({
            success: true,
            source: 'AbuseIPDB',
            ip_address: ipData.ipAddress,
            abuse_confidence_score: ipData.abuseConfidenceScore,
            total_reports: ipData.totalReports,
            is_whitelisted: ipData.isWhitelisted,
            country_code: ipData.countryCode,
            usage_type: ipData.usageType,
            isp: ipData.isp,
            domain: ipData.domain,
            is_tor: ipData.isTor,
            last_reported_at: ipData.lastReportedAt,
            threat_level: threatLevel,
            recommended_action: ipData.abuseConfidenceScore >= 75 ? 'block' :
                               ipData.abuseConfidenceScore >= 50 ? 'alert' :
                               ipData.abuseConfidenceScore >= 25 ? 'monitor' : 'allow',
            reports: ipData.reports || [],
            rate_limit: {
                remaining: response.headers.get('X-RateLimit-Remaining'),
                reset: response.headers.get('X-RateLimit-Reset')
            }
        });

    } catch (error) {
        console.error('AbuseIPDB lookup error:', error);
        
        // Handle abort/timeout
        if (error.name === 'AbortError') {
            return Response.json({ 
                error: 'Request timeout', 
                message: 'AbuseIPDB did not respond within 15 seconds'
            }, { status: 504 });
        }
        
        return Response.json({ 
            error: 'Internal server error', 
            message: error.message 
        }, { status: 500 });
    }
});