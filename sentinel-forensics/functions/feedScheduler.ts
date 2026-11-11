/**
 * THREAT INTEL FEED BACKGROUND SCHEDULER
 * 
 * Auto-ingests threat intel feeds based on refresh intervals.
 * ADMIN-ONLY: Should be invoked by scheduled task every 5 minutes.
 * 
 * Features:
 * - Distributed locking (prevents concurrent runs)
 * - Configurable refresh intervals
 * - Failure resilience with error capture
 * - Full audit trail
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // RBAC: Admin-only for manual execution
    if (user && user.role !== 'admin') {
      return Response.json({ 
        error: 'Forbidden: Admin access required' 
      }, { status: 403 });
    }
    
    const now = new Date();
    
    // Fetch eligible feeds
    const allFeeds = await base44.asServiceRole.entities.ThreatIntelFeed.filter({ 
      is_active: true 
    });
    
    const eligibleFeeds = allFeeds.filter(feed => {
      // Skip if locked
      if (feed.ingest_lock_until && new Date(feed.ingest_lock_until) > now) {
        return false;
      }
      
      // Include if never ingested
      if (!feed.last_ingest_at) {
        return true;
      }
      
      // Include if next_ingest_at is due
      if (feed.next_ingest_at && new Date(feed.next_ingest_at) <= now) {
        return true;
      }
      
      // Fallback: Check interval
      const intervalMs = (feed.refresh_interval_minutes || 1440) * 60 * 1000;
      const lastIngestTime = new Date(feed.last_ingest_at).getTime();
      return (now.getTime() - lastIngestTime) >= intervalMs;
    });
    
    console.log(`Found ${eligibleFeeds.length} eligible feeds out of ${allFeeds.length} active`);
    
    const results = [];
    
    for (const feed of eligibleFeeds) {
      try {
        // Acquire lock
        const lockUntil = new Date(now.getTime() + 10 * 60 * 1000); // 10 min lock
        await base44.asServiceRole.entities.ThreatIntelFeed.update(feed.id, {
          ingest_lock_until: lockUntil.toISOString()
        });
        
        // TODO: Fetch feed data from feed.feed_url
        // For now, simulate with empty array
        const fetchedIOCs = [];
        
        // Invoke ingest function
        const ingestResponse = await base44.asServiceRole.functions.invoke('ingestThreatFeed', {
          feed_id: feed.id,
          iocs: fetchedIOCs
        });
        
        // Calculate next ingest time
        const nextIngest = new Date(now.getTime() + (feed.refresh_interval_minutes || 1440) * 60 * 1000);
        
        // Update feed metadata
        await base44.asServiceRole.entities.ThreatIntelFeed.update(feed.id, {
          last_ingest_status: 'success',
          last_ingest_error: null,
          next_ingest_at: nextIngest.toISOString(),
          ingest_lock_until: null // Release lock
        });
        
        results.push({
          feed_id: feed.id,
          feed_name: feed.feed_name,
          status: 'success',
          iocs_added: ingestResponse.added || 0
        });
        
      } catch (error) {
        console.error(`Feed ${feed.id} failed:`, error);
        
        // Update feed with error
        await base44.asServiceRole.entities.ThreatIntelFeed.update(feed.id, {
          last_ingest_status: 'failed',
          last_ingest_error: error.message?.substring(0, 500),
          ingest_lock_until: null // Release lock
        });
        
        results.push({
          feed_id: feed.id,
          feed_name: feed.feed_name,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    // Audit log
    if (results.length > 0) {
      await base44.asServiceRole.entities.AuditLog.create({
        organization_id: 'system',
        event_type: 'feed_scheduler_executed',
        severity: 'info',
        description: `Feed scheduler processed ${results.length} feeds`,
        user_id: user?.email || 'system',
        resource_type: 'ThreatIntelFeed',
        resource_id: 'scheduler',
        action_performed: 'schedule',
        metadata: {
          feeds_processed: results.length,
          successes: results.filter(r => r.status === 'success').length,
          failures: results.filter(r => r.status === 'failed').length
        },
        success: true,
        blockchain_hash: '',
        timestamp: new Date().toISOString()
      });
    }
    
    return Response.json({ 
      success: true,
      feeds_processed: results.length,
      results
    });
    
  } catch (error) {
    console.error('Feed scheduler failed:', error);
    return Response.json({ 
      error: error.message || 'Feed scheduler failed' 
    }, { status: 500 });
  }
});

function calculateSourceReliability(source) {
  const weights = {
    'misp': 95,
    'opencti': 95,
    'virustotal': 90,
    'alienvault_otx': 85,
    'abuseipdb': 80,
    'urlscan': 75,
    'manual': 60,
    'unknown': 30
  };
  return weights[source?.toLowerCase()] || 50;
}

function calculateRecency(lastSeen) {
  if (!lastSeen) return 30;
  
  const daysSince = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSince < 7) return 100;
  if (daysSince < 30) return 80;
  if (daysSince < 90) return 60;
  if (daysSince < 180) return 40;
  return 20;
}

function calculateCaseCriticality(priority) {
  const map = { critical: 100, high: 75, medium: 50, low: 25 };
  return map[priority] || 50;
}

function calculateFeedSignals(indicator) {
  let score = 0;
  
  if (indicator.feed_id) score += 40;
  if (indicator.ttps && indicator.ttps.length > 0) {
    score += Math.min(30, indicator.ttps.length * 10);
  }
  if (indicator.threat_actor_refs && indicator.threat_actor_refs.length > 0) {
    score += 30;
  }
  
  return Math.min(100, score);
}

function calculateVariance(components, mean) {
  const sumSquares = components.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  return Math.sqrt(sumSquares / components.length);
}

function generateTopFactors(components) {
  const entries = Object.entries(components).map(([key, val]) => ({ key, val }));
  entries.sort((a, b) => b.val - a.val);
  return entries.slice(0, 3).map(e => e.key.replace(/_/g, ' '));
}

function generateExplanationText(score, confidence, components) {
  const parts = [];
  
  if (components.sourceReliability > 80) parts.push('reliable source');
  if (components.recency > 80) parts.push('recent activity');
  else if (components.recency < 40) parts.push('older intel');
  if (components.feedSignals > 50) parts.push('feed-enriched');
  
  return `Risk ${score}/100 (${confidence} confidence): ${parts.join(', ')}.`;
}