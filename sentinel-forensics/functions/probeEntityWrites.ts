/**
 * PHASE 5: Entity Write Probe
 * Tests if functions can insert into audit/rate-limit entities in this environment.
 * Returns raw platform errors without paraphrasing.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organization_id } = await req.json();
    const orgId = organization_id || user.organization_id || 'test_org_probe';

    const results = [];
    const timestamp = new Date().toISOString();

    // Test 1: ChainOfCustodyEntry (known good historically)
    try {
      const entry = await base44.asServiceRole.entities.ChainOfCustodyEntry.create({
        organization_id: orgId,
        session_id: 'probe_session_' + Date.now(),
        entry_type: 'SESSION_START',
        timestamp_utc: timestamp,
        timestamp_local: timestamp,
        timezone: 'UTC',
        actor_email: user.email,
        event_data: { probe: true },
        narrative: 'Probe test for entity write verification',
        prev_entry_hash: null,
        entry_hash: 'probe_hash_' + Date.now()
      });
      
      results.push({
        entity: 'ChainOfCustodyEntry',
        inserted: true,
        record_id: entry.id,
        error: null
      });
    } catch (error) {
      results.push({
        entity: 'ChainOfCustodyEntry',
        inserted: false,
        record_id: null,
        error: error.message || String(error)
      });
    }

    // Test 2: SecurityAuditLog
    try {
      const log = await base44.asServiceRole.entities.SecurityAuditLog.create({
        organization_id: orgId,
        event_type: 'probe_test',
        severity: 'info',
        description: 'Probe test for SecurityAuditLog write',
        actor_email: user.email,
        success: true,
        metadata: { probe: true },
        timestamp_utc: timestamp
      });
      
      results.push({
        entity: 'SecurityAuditLog',
        inserted: true,
        record_id: log.id,
        error: null
      });
    } catch (error) {
      results.push({
        entity: 'SecurityAuditLog',
        inserted: false,
        record_id: null,
        error: error.message || String(error)
      });
    }

    // Test 3: AuditLog
    try {
      const log = await base44.asServiceRole.entities.AuditLog.create({
        organization_id: orgId,
        event_type: 'probe_test',
        severity: 'info',
        description: 'Probe test for AuditLog write',
        user_id: user.email,
        success: true,
        metadata: { probe: true },
        timestamp: timestamp,
        blockchain_hash: ''
      });
      
      results.push({
        entity: 'AuditLog',
        inserted: true,
        record_id: log.id,
        error: null
      });
    } catch (error) {
      results.push({
        entity: 'AuditLog',
        inserted: false,
        record_id: null,
        error: error.message || String(error)
      });
    }

    // Test 4: RateLimitTracker
    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + 60 * 60 * 1000);
      
      const tracker = await base44.asServiceRole.entities.RateLimitTracker.create({
        organization_id: orgId,
        scope: 'probe_test',
        resource_id: 'probe_resource',
        window_start: timestamp,
        window_end: windowEnd.toISOString(),
        count: 1,
        last_action_at: timestamp,
        metadata: { probe: true }
      });
      
      results.push({
        entity: 'RateLimitTracker',
        inserted: true,
        record_id: tracker.id,
        error: null
      });
    } catch (error) {
      results.push({
        entity: 'RateLimitTracker',
        inserted: false,
        record_id: null,
        error: error.message || String(error)
      });
    }

    return Response.json({
      organization_id: orgId,
      tested_at: timestamp,
      tested_by: user.email,
      results
    });

  } catch (error) {
    console.error('Probe failed:', error);
    return Response.json({ 
      error: error.message || 'Probe failed',
      stack: error.stack
    }, { status: 500 });
  }
});