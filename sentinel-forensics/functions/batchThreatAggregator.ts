import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * BATCH THREAT AGGREGATOR v1.0
 * Multi-source threat intelligence aggregation and scoring
 * 
 * Aggregates threat data from:
 * - VirusTotal (file/URL hashes)
 * - AbuseIPDB (IP reputation)
 * - AlienVault OTX (multi-source intel)
 * - URLScan.io (domain/URL analysis)
 * - Shodan (infrastructure intel)
 * 
 * Provides weighted threat scoring algorithm with confidence levels
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { indicators = [], case_id } = await req.json();

        if (!indicators || indicators.length === 0) {
            return Response.json({ 
                error: 'indicators array required',
                example: {
                    indicators: [
                        { type: 'ip', value: '1.2.3.4' },
                        { type: 'domain', value: 'evil.com' },
                        { type: 'hash', value: 'abc123...' }
                    ],
                    case_id: 'CASE-123' // optional
                }
            }, { status: 400 });
        }

        const aggregationResults = {
            total_indicators: indicators.length,
            processed: 0,
            high_confidence_threats: 0,
            medium_confidence_threats: 0,
            low_confidence_threats: 0,
            clean_indicators: 0,
            aggregated_indicators: [],
            overall_threat_score: 0,
            started_at: new Date().toISOString()
        };

        // Process each indicator
        for (const indicator of indicators) {
            try {
                const aggregated = await aggregateIndicator(base44, indicator);
                aggregationResults.aggregated_indicators.push(aggregated);
                aggregationResults.processed++;

                // Count by threat level
                if (aggregated.final_threat_score >= 70) {
                    aggregationResults.high_confidence_threats++;
                } else if (aggregated.final_threat_score >= 40) {
                    aggregationResults.medium_confidence_threats++;
                } else if (aggregated.final_threat_score > 0) {
                    aggregationResults.low_confidence_threats++;
                } else {
                    aggregationResults.clean_indicators++;
                }

                // Store enriched IOC if case provided
                if (case_id) {
                    await base44.entities.IOCIndicator.create({
                        indicator_id: `IOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        case_id,
                        indicator_type: indicator.type,
                        value: indicator.value,
                        confidence: aggregated.confidence / 100,
                        extraction_method: 'batch_aggregator',
                        aggregated_threat_score: aggregated.final_threat_score,
                        threat_classification: aggregated.classification,
                        feed_sources: aggregated.sources,
                        reputation_score: 100 - aggregated.final_threat_score,
                        enrichment_status: 'completed',
                        first_seen: new Date().toISOString(),
                        last_seen: new Date().toISOString(),
                        status: aggregated.final_threat_score >= 40 ? 'new' : 'investigating'
                    });
                }

            } catch (error) {
                console.error(`Failed to aggregate ${indicator.value}:`, error.message);
            }
        }

        // Calculate overall threat score
        const threatScores = aggregationResults.aggregated_indicators
            .map(i => i.final_threat_score)
            .filter(s => s > 0);

        aggregationResults.overall_threat_score = threatScores.length > 0
            ? Math.round(threatScores.reduce((a, b) => a + b, 0) / threatScores.length)
            : 0;

        aggregationResults.completed_at = new Date().toISOString();

        // Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'threat_aggregation_completed',
            severity: aggregationResults.high_confidence_threats > 0 ? 'warning' : 'info',
            description: `Threat aggregation: ${aggregationResults.processed} indicators analyzed, ${aggregationResults.high_confidence_threats} high threats`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                case_id,
                total_indicators: indicators.length,
                high_threats: aggregationResults.high_confidence_threats,
                overall_score: aggregationResults.overall_threat_score
            }
        });

        return Response.json({
            success: true,
            ...aggregationResults
        });

    } catch (error) {
        console.error('Threat aggregation error:', error);
        return Response.json({ 
            error: 'Aggregation failed', 
            message: error.message 
        }, { status: 500 });
    }
});

/**
 * Aggregate threat intelligence for single indicator
 */
async function aggregateIndicator(base44, indicator) {
    const result = {
        type: indicator.type,
        value: indicator.value,
        sources: [],
        final_threat_score: 0,
        confidence: 0,
        classification: 'unknown',
        recommendations: []
    };

    try {
        // Fetch all enrichment results for this indicator
        const enrichments = await base44.entities.EnrichmentResult.filter({
            query_value: indicator.value,
            status: 'success'
        }, '-fetched_at', 10);

        if (enrichments && enrichments.length > 0) {
            // Aggregate scores from multiple sources
            const sourceScores = [];
            const sourceWeights = {
                'virustotal': 1.0,      // Highest weight
                'abuseipdb': 0.9,
                'alienvault_otx': 0.8,
                'urlscan': 0.85,
                'shodan': 0.75
            };

            for (const enrichment of enrichments) {
                const weight = sourceWeights[enrichment.provider] || 0.5;
                const score = enrichment.summary?.threat_score || 0;
                
                result.sources.push({
                    provider: enrichment.provider,
                    threat_score: score,
                    weight,
                    fetched_at: enrichment.fetched_at,
                    tags: enrichment.summary?.tags || []
                });

                sourceScores.push({
                    score,
                    weight,
                    confidence: enrichment.summary?.reputation ? 90 : 70
                });
            }

            // Weighted average threat score
            if (sourceScores.length > 0) {
                const totalWeight = sourceScores.reduce((sum, s) => sum + s.weight, 0);
                const weightedSum = sourceScores.reduce((sum, s) => sum + (s.score * s.weight), 0);
                result.final_threat_score = Math.round(weightedSum / totalWeight);

                // Average confidence
                result.confidence = Math.round(
                    sourceScores.reduce((sum, s) => sum + s.confidence, 0) / sourceScores.length
                );
            }

            // Classify threat
            result.classification = result.final_threat_score >= 70 ? 'malicious' :
                                   result.final_threat_score >= 50 ? 'suspicious' :
                                   result.final_threat_score >= 30 ? 'questionable' :
                                   result.final_threat_score > 0 ? 'low_risk' : 'benign';

            // Generate recommendations
            if (result.final_threat_score >= 70) {
                result.recommendations = [
                    'Quarantine immediately',
                    'Block network connections',
                    'Collect forensic evidence',
                    'Create incident ticket'
                ];
            } else if (result.final_threat_score >= 40) {
                result.recommendations = [
                    'Monitor closely',
                    'Add to watchlist',
                    'Enable detailed logging',
                    'Consider sandboxing'
                ];
            } else if (result.final_threat_score > 0) {
                result.recommendations = [
                    'Continue monitoring',
                    'Review periodically'
                ];
            }
        }

    } catch (error) {
        console.error(`Aggregation error for ${indicator.value}:`, error.message);
        result.error = error.message;
    }

    return result;
}