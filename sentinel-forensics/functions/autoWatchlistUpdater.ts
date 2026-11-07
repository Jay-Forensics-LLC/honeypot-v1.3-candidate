import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * AUTOMATED WATCHLIST UPDATER v1.0
 * Automatically populate watchlists from threat intelligence feeds
 * 
 * Features:
 * - Auto-add high-confidence IOCs to watchlist
 * - Remove expired/stale watchlist entries
 * - Sync with threat intel feeds (STIX/TAXII)
 * - Duplicate detection and deduplication
 * - Threat score threshold filtering
 * - Auto-tagging based on threat classification
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { 
            action = 'sync',
            min_threat_score = 70,
            max_age_days = 30,
            auto_tag = true,
            remove_stale = true
        } = await req.json();

        const stats = {
            iocs_processed: 0,
            watchlist_added: 0,
            watchlist_updated: 0,
            duplicates_skipped: 0,
            stale_removed: 0,
            errors: []
        };

        // 1. Fetch high-confidence IOCs
        const highConfidenceIOCs = await base44.entities.IOCIndicator.filter({
            aggregated_threat_score: { $gte: min_threat_score },
            enrichment_status: 'completed'
        }, '-aggregated_threat_score', 500);

        stats.iocs_processed = highConfidenceIOCs.length;

        // 2. Process each IOC
        for (const ioc of highConfidenceIOCs) {
            try {
                // Check if already in watchlist
                const existingWatchlist = await base44.entities.Watchlist.filter({
                    entry_type: mapIOCTypeToWatchlistType(ioc.indicator_type),
                    entry_value: ioc.value
                });

                if (existingWatchlist && existingWatchlist.length > 0) {
                    // Update existing watchlist entry
                    const existing = existingWatchlist[0];
                    
                    await base44.entities.Watchlist.update(existing.id, {
                        threat_level: mapThreatScoreToLevel(ioc.aggregated_threat_score),
                        detection_count: (existing.detection_count || 0) + 1,
                        last_detected: new Date().toISOString(),
                        description: `Auto-updated: Score ${ioc.aggregated_threat_score}/100`,
                        tags: auto_tag ? generateAutoTags(ioc) : existing.tags
                    });

                    stats.watchlist_updated++;
                    stats.duplicates_skipped++;
                } else {
                    // Add new watchlist entry
                    const watchlistEntry = {
                        watchlist_id: `WL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        name: `Auto-added: ${ioc.value}`,
                        entry_type: mapIOCTypeToWatchlistType(ioc.indicator_type),
                        entry_value: ioc.value,
                        threat_level: mapThreatScoreToLevel(ioc.aggregated_threat_score),
                        description: `Auto-added from threat intel (Score: ${ioc.aggregated_threat_score}/100)`,
                        alert_on_detection: true,
                        detection_count: 0,
                        tags: auto_tag ? generateAutoTags(ioc) : [],
                        notes: `Source: ${ioc.feed_sources?.map(f => f.feed_name).join(', ') || 'Unknown'}`
                    };

                    await base44.entities.Watchlist.create(watchlistEntry);
                    stats.watchlist_added++;
                }

            } catch (error) {
                console.error(`Failed to process IOC ${ioc.value}:`, error);
                stats.errors.push({
                    ioc_value: ioc.value,
                    error: error.message
                });
            }
        }

        // 3. Remove stale watchlist entries (optional)
        if (remove_stale) {
            const staleDate = new Date(Date.now() - max_age_days * 24 * 60 * 60 * 1000).toISOString();
            
            const staleEntries = await base44.entities.Watchlist.filter({
                last_detected: { $lt: staleDate },
                detection_count: { $eq: 0 }
            });

            for (const stale of staleEntries) {
                try {
                    // Move to recycle bin instead of hard delete
                    await base44.entities.RecycleBin.create({
                        original_entity: 'Watchlist',
                        original_id: stale.id,
                        original_data: stale,
                        deleted_by: 'system_auto_cleanup',
                        deleted_at: new Date().toISOString(),
                        permanent_delete_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                        deletion_reason: `Stale watchlist entry (${max_age_days} days old, 0 detections)`
                    });

                    await base44.entities.Watchlist.delete(stale.id);
                    stats.stale_removed++;

                } catch (error) {
                    console.error(`Failed to remove stale entry:`, error);
                }
            }
        }

        // 4. Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'watchlist_auto_updated',
            severity: 'info',
            description: `Watchlist auto-update: ${stats.watchlist_added} added, ${stats.watchlist_updated} updated, ${stats.stale_removed} removed`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: stats
        });

        return Response.json({
            success: true,
            ...stats,
            summary: {
                total_iocs: stats.iocs_processed,
                watchlist_entries: stats.watchlist_added + stats.watchlist_updated,
                cleanup: stats.stale_removed
            }
        });

    } catch (error) {
        console.error('Watchlist update error:', error);
        return Response.json({ 
            error: 'Watchlist update failed', 
            message: error.message 
        }, { status: 500 });
    }
});

/**
 * Map IOC type to watchlist type
 */
function mapIOCTypeToWatchlistType(iocType) {
    const mapping = {
        'ip': 'ip_address',
        'domain': 'domain',
        'url': 'domain',
        'md5': 'pattern',
        'sha1': 'pattern',
        'sha256': 'pattern',
        'email': 'pattern',
        'ble_uuid': 'ble_uuid',
        'ble_company_id': 'ble_uuid',
        'mutex': 'pattern'
    };

    return mapping[iocType] || 'pattern';
}

/**
 * Map threat score to threat level
 */
function mapThreatScoreToLevel(score) {
    if (score >= 80) return 'known_threat';
    if (score >= 60) return 'malicious';
    if (score >= 40) return 'suspicious';
    return 'benign';
}

/**
 * Generate auto-tags based on IOC characteristics
 */
function generateAutoTags(ioc) {
    const tags = ['auto_added'];

    // Add classification tags
    if (ioc.threat_classification) {
        tags.push(ioc.threat_classification);
    }

    // Add source tags
    if (ioc.feed_sources && ioc.feed_sources.length > 0) {
        ioc.feed_sources.forEach(source => {
            if (source.feed_name) {
                tags.push(source.feed_name);
            }
        });
    }

    // Add confidence tag
    if (ioc.aggregated_threat_score >= 90) {
        tags.push('high_confidence');
    } else if (ioc.aggregated_threat_score >= 70) {
        tags.push('medium_confidence');
    }

    // Add indicator type tag
    tags.push(ioc.indicator_type);

    return [...new Set(tags)]; // Deduplicate
}