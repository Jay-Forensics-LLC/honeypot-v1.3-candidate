import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SEED AGENT TELEMETRY DATA (TESTING ONLY)
 * Generates realistic telemetry events for 5 agents over 7 days
 * 
 * USAGE: Call once to populate AgentTelemetryEvent for testing
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const now = new Date();
    const events = [];

    // Create 5 agents with different health profiles
    const agents = [
      { id: 'agent_healthy_001', status: 'HEALTHY', hostId: 'host_alpha', caseId: null },
      { id: 'agent_degraded_002', status: 'DEGRADED', hostId: 'host_beta', caseId: null },
      { id: 'agent_offline_003', status: 'OFFLINE', hostId: 'host_gamma', caseId: null },
      { id: 'agent_intermittent_004', status: 'HEALTHY', hostId: 'host_delta', caseId: null },
      { id: 'agent_high_queue_005', status: 'DEGRADED', hostId: 'host_epsilon', caseId: null }
    ];

    // Generate 7 days of telemetry (every 5 minutes)
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      for (let hour = 0; hour < 24; hour++) {
        for (let min = 0; min < 60; min += 5) {
          const ts = new Date(now);
          ts.setDate(ts.getDate() - (6 - dayOffset));
          ts.setHours(hour, min, 0, 0);

          agents.forEach((agent, idx) => {
            // Skip offline agent after day 5
            if (agent.status === 'OFFLINE' && dayOffset >= 5) return;

            // Intermittent agent: only report 60% of time
            if (agent.status === 'HEALTHY' && agent.id.includes('intermittent') && Math.random() > 0.6) return;

            const baseCpu = agent.status === 'DEGRADED' ? 88 : 45;
            const baseMem = agent.status === 'DEGRADED' ? 1200 : 512;
            const baseMemPct = agent.status === 'DEGRADED' ? 88 : 50;
            const baseDiskPct = agent.status === 'DEGRADED' ? 92 : 60;
            const baseQueue = agent.id.includes('high_queue') ? 120 : 10;
            const baseErrors = agent.status === 'DEGRADED' ? 0.1 : 0.01;

            events.push({
              organization_id: user.organization_id,
              agent_id: agent.id,
              host_id: agent.hostId,
              case_id: agent.caseId,
              ts_utc: ts.toISOString(),
              cpu_pct: Math.max(0, Math.min(100, baseCpu + (Math.random() - 0.5) * 20)),
              mem_mb: Math.max(0, baseMem + (Math.random() - 0.5) * 200),
              mem_pct: Math.max(0, Math.min(100, baseMemPct + (Math.random() - 0.5) * 15)),
              disk_pct: Math.max(0, Math.min(100, baseDiskPct + (Math.random() - 0.5) * 10)),
              queue_depth: Math.max(0, Math.floor(baseQueue + (Math.random() - 0.5) * 50)),
              error_count_delta: Math.random() < baseErrors ? 1 : 0,
              scan_duration_ms: Math.floor(5000 + Math.random() * 10000),
              bytes_uploaded: Math.floor(Math.random() * 1000000),
              events_per_min: Math.floor(100 + Math.random() * 400),
              heartbeat: true,
              source: 'sentinel-agent',
              metadata: {}
            });
          });
        }
      }
    }

    // Bulk insert
    await base44.asServiceRole.entities.AgentTelemetryEvent.bulkCreate(events);

    return Response.json({
      success: true,
      eventsCreated: events.length,
      agents: agents.map(a => a.id),
      timeRange: {
        start: events[0].ts_utc,
        end: events[events.length - 1].ts_utc
      }
    });

  } catch (error) {
    console.error('Seed agent telemetry error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});