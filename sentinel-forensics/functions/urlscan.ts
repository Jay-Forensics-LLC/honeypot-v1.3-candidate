import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * URLScan.io API Integration - OPTIMIZED
 * Scans and analyzes URLs for malicious content
 * Supports both search (existing scans) and submit (new scan) modes
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { url, action = 'search' } = await req.json();

        if (!url) {
            return Response.json({ 
                error: 'URL is required',
                example: { url: 'https://example.com', action: 'search' }
            }, { status: 400 });
        }

        // Validate URL format
        try {
            new URL(url);
        } catch (e) {
            return Response.json({ 
                error: 'Invalid URL format',
                received: url
            }, { status: 400 });
        }

        const apiKey = Deno.env.get('URLSCAN_API_KEY');
        if (!apiKey) {
            return Response.json({ 
                error: 'URLScan.io API key not configured',
                setup: 'Add URLSCAN_API_KEY to environment variables'
            }, { status: 500 });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

        try {
            if (action === 'submit') {
                // Submit URL for scanning
                const submitResponse = await fetch('https://urlscan.io/api/v1/scan/', {
                    method: 'POST',
                    headers: {
                        'API-Key': apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        url: url,
                        visibility: 'unlisted' // Don't publish publicly
                    }),
                    signal: controller.signal
                });

                if (!submitResponse.ok) {
                    const errorText = await submitResponse.text();
                    
                    if (submitResponse.status === 429) {
                        return Response.json({ 
                            error: 'Rate limit exceeded',
                            details: 'URLScan.io quota reached. Try again later.',
                            retry_after: submitResponse.headers.get('Retry-After')
                        }, { status: 429 });
                    }
                    
                    return Response.json({ 
                        error: 'URLScan.io submission failed', 
                        status: submitResponse.status,
                        details: errorText 
                    }, { status: submitResponse.status });
                }

                const submitData = await submitResponse.json();

                // Wait for scan to complete (URLScan typically takes 10-30 seconds)
                await new Promise(resolve => setTimeout(resolve, 15000));

                // Fetch results
                const resultResponse = await fetch(submitData.api, {
                    headers: {
                        'API-Key': apiKey
                    },
                    signal: controller.signal
                });

                if (!resultResponse.ok) {
                    // Scan still processing
                    return Response.json({
                        success: true,
                        status: 'processing',
                        message: 'Scan submitted successfully, results still processing',
                        scan_id: submitData.uuid,
                        result_url: submitData.result,
                        api_url: submitData.api,
                        check_after_seconds: 20
                    });
                }

                const resultData = await resultResponse.json();

                // Calculate threat level
                const isMalicious = resultData.verdicts?.overall?.malicious || false;
                const maliciousCount = resultData.verdicts?.overall?.maliciousTotal || 0;
                const threatLevel = maliciousCount >= 3 ? 'critical' :
                                   maliciousCount >= 2 ? 'high' :
                                   maliciousCount >= 1 ? 'medium' : 'clean';

                // Create audit log (async)
                base44.entities.AuditLog.create({
                    event_type: 'urlscan_submission',
                    severity: isMalicious ? 'warning' : 'info',
                    description: `URL scan submitted for ${url} - Verdict: ${isMalicious ? 'MALICIOUS' : 'Clean'}`,
                    user_id: user.email,
                    timestamp: new Date().toISOString(),
                    success: true,
                    metadata: {
                        url,
                        scan_id: submitData.uuid,
                        verdict: isMalicious ? 'malicious' : 'clean',
                        threat_level: threatLevel,
                        malicious_count: maliciousCount
                    }
                }).catch(err => console.error('Audit log failed:', err));

                // Store domain reputation if malicious
                if (isMalicious) {
                    const urlObj = new URL(url);
                    base44.entities.DomainReputationScore.create({
                        domain: urlObj.hostname,
                        reputation_score: 100 - (maliciousCount * 25),
                        threat_categories: resultData.verdicts?.overall?.categories || [],
                        domain_age: resultData.page?.asn?.date ? 
                            Math.floor((Date.now() - new Date(resultData.page.asn.date).getTime()) / (1000 * 60 * 60 * 24)) : 0,
                        content_analysis: {
                            phishing_keywords: resultData.verdicts?.urlscan?.categories?.filter(c => c.includes('phishing')) || [],
                            malware_downloads: resultData.verdicts?.urlscan?.categories?.includes('malware') || false,
                            suspicious_javascript: resultData.verdicts?.urlscan?.categories?.includes('javascript') || false
                        },
                        threat_intel_reports: [{
                            source: 'URLScan.io',
                            report_date: new Date().toISOString(),
                            threat_type: 'malicious_url',
                            details: resultData.verdicts?.overall?.verdict || '',
                            severity: threatLevel
                        }],
                        risk_assessment: threatLevel === 'critical' ? 'critical' :
                                        threatLevel === 'high' ? 'high_risk' : 'medium_risk',
                        recommended_action: maliciousCount >= 2 ? 'block' : 'warn',
                        last_analyzed: new Date().toISOString()
                    }).catch(err => console.error('Domain reputation storage failed:', err));
                }

                return Response.json({
                    success: true,
                    source: 'URLScan.io',
                    scan_id: submitData.uuid,
                    url: url,
                    result_url: submitData.result,
                    screenshot: resultData.task?.screenshotURL,
                    verdicts: resultData.verdicts,
                    page_info: {
                        domain: resultData.page?.domain,
                        ip: resultData.page?.ip,
                        country: resultData.page?.country,
                        server: resultData.page?.server,
                        title: resultData.page?.title,
                        asn: resultData.page?.asn
                    },
                    stats: resultData.stats,
                    threat_level: threatLevel,
                    is_malicious: isMalicious,
                    malicious_count: maliciousCount,
                    certificates: resultData.lists?.certificates || [],
                    ips: resultData.lists?.ips || []
                });

            } else {
                // Search for existing scans
                const searchResponse = await fetch(
                    `https://urlscan.io/api/v1/search/?q=page.url:"${encodeURIComponent(url)}"`,
                    {
                        headers: {
                            'API-Key': apiKey
                        },
                        signal: controller.signal
                    }
                );

                if (!searchResponse.ok) {
                    const errorText = await searchResponse.text();
                    
                    if (searchResponse.status === 429) {
                        return Response.json({ 
                            error: 'Rate limit exceeded',
                            retry_after: searchResponse.headers.get('Retry-After')
                        }, { status: 429 });
                    }
                    
                    return Response.json({ 
                        error: 'URLScan.io search failed', 
                        status: searchResponse.status,
                        details: errorText 
                    }, { status: searchResponse.status });
                }

                const searchData = await searchResponse.json();

                // Create audit log (async)
                base44.entities.AuditLog.create({
                    event_type: 'urlscan_search',
                    severity: 'info',
                    description: `URL search for ${url} - Found ${searchData.total} existing scans`,
                    user_id: user.email,
                    timestamp: new Date().toISOString(),
                    success: true,
                    metadata: {
                        url,
                        results_found: searchData.total
                    }
                }).catch(err => console.error('Audit log failed:', err));

                return Response.json({
                    success: true,
                    source: 'URLScan.io',
                    url: url,
                    results_found: searchData.total,
                    recent_scans: searchData.results?.slice(0, 5).map(scan => ({
                        scan_id: scan.task.uuid,
                        time: scan.task.time,
                        url: scan.page.url,
                        screenshot: scan.screenshot,
                        malicious: scan.verdicts?.overall?.malicious || false,
                        result_url: scan.result,
                        domain: scan.page.domain,
                        ip: scan.page.ip,
                        country: scan.page.country
                    })) || [],
                    has_malicious: searchData.results?.some(s => s.verdicts?.overall?.malicious) || false
                });
            }
        } finally {
            clearTimeout(timeoutId);
        }

    } catch (error) {
        console.error('URLScan.io error:', error);
        
        if (error.name === 'AbortError') {
            return Response.json({ 
                error: 'Request timeout',
                message: 'URLScan.io did not respond within 20 seconds'
            }, { status: 504 });
        }
        
        return Response.json({ 
            error: 'Internal server error', 
            message: error.message 
        }, { status: 500 });
    }
});