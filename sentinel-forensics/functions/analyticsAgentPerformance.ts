import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ANALYTICS: Agent Performance - Timeseries + Summary Table
 * Returns agent health metrics with deterministic aggregation rules
 * 
 * ============================================================================
 * HEALTH ALGORITHM (Deterministic, Documented)
 * ============================================================================
 * 
 * 1. STALE CHECK (Primary):
 *    - If (now - last_reported_at) > STALE_GRACE_MS → status = STALE
 *    - Staleness takes precedence over all metric evaluations
 * 
 * 2. METRIC-BASED EVALUATION (if not stale):
 *    Per metric, determine status:
 *      - CRITICAL: value >= critical_threshold
 *      - WARNING: value >= warn_threshold
 *      - HEALTHY: value < warn_threshold
 *      - UNKNOWN: null/undefined/invalid value
 * 
 * 3. OVERALL STATUS PRECEDENCE:
 *    - If ANY metric is CRITICAL → overall = CRITICAL
 *    - Else if ANY metric is WARNING → overall = WARNING
 *    - Else if ALL present metrics are HEALTHY (and ≥1 present) → overall = HEALTHY
 *    - Else (no usable metrics) → overall = UNKNOWN
 * 
 * 4. MEMORY EVALUATION:
 *    - Prefer mem_pct when present (finite number)
 *    - Fallback to mem_mb if mem_pct missing
 * 
 * 5. DISK EVALUATION:
 *    - disk_pct is nullable; if null → treat as UNKNOWN for that metric only
 * 
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  STALE: 'stale',
  UNKNOWN: 'unknown'
});

// Grace period before agent is considered stale (15 minutes)
const STALE_GRACE_MS = 15 * 60 * 1000;

// Metric thresholds
const DEFAULT_THRESHOLDS = Object.freeze({
  cpu_pct:     { warn: 75, critical: 90 },
  mem_pct:     { warn: 75, critical: 90 },
  mem_mb:      { warn: 4096, critical: 8192 },
  disk_pct:    { warn: 85, critical: 95 },
  queue_depth: { warn: 25, critical: 100 }
});

// Threat intel confidence multipliers
const MATCH_STRENGTH_FACTORS = Object.freeze({
  hash_exact: 1.0,
  ip_exact: 0.9,
  domain_exact: 0.85,
  domain_subdomain: 0.75
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Evaluate health status for a single metric
 */
function evaluateMetric(value, thresholds) {
  if (value === null || value === undefined || !isFinite(value)) {
    return { status: HEALTH_STATUS.UNKNOWN, reason: null };
  }
  
  if (value >= thresholds.critical) {
    return { status: HEALTH_STATUS.CRITICAL, reason: `≥${thresholds.critical}` };
  }
  if (value >= thresholds.warn) {
    return { status: HEALTH_STATUS.WARNING, reason: `≥${thresholds.warn}` };
  }
  return { status: HEALTH_STATUS.HEALTHY, reason: null };
}

/**
 * Compute overall health status from individual metric evaluations
 */
function computeOverallHealth(metricEvaluations, minutesSinceLastSeen) {
  // Check staleness first (highest priority)
  if (minutesSinceLastSeen * 60 * 1000 > STALE_GRACE_MS) {
    return {
      status: HEALTH_STATUS.STALE,
      reasons: [`No telemetry for ${Math.round(minutesSinceLastSeen)} minutes`]
    };
  }

  const statuses = metricEvaluations.map(e => e.status);
  const reasons = metricEvaluations
    .filter(e => e.reason)
    .map(e => `${e.metricName}: ${e.reason}`);

  // Status precedence
  if (statuses.includes(HEALTH_STATUS.CRITICAL)) {
    return { status: HEALTH_STATUS.CRITICAL, reasons };
  }
  if (statuses.includes(HEALTH_STATUS.WARNING)) {
    return { status: HEALTH_STATUS.WARNING, reasons };
  }
  
  const hasHealthy = statuses.includes(HEALTH_STATUS.HEALTHY);
  const allUnknown = statuses.every(s => s === HEALTH_STATUS.UNKNOWN);
  
  if (hasHealthy && !allUnknown) {
    return { status: HEALTH_STATUS.HEALTHY, reasons: [] };
  }
  
  return { status: HEALTH_STATUS.UNKNOWN, reasons: ['No usable metrics'] };
}

/**
 * Compute average, excluding nulls
 */
function avg(values) {
  const valid = values.filter(v => v !== null && v !== undefined && isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/**
 * Compute max, excluding nulls
 */
function max(values) {
  const valid = values.filter(v => v !== null && v !== undefined && isFinite(v));
  if (valid.length === 0) return null;
  return Math.max(...valid);
}

/**
 * Compute sum, excluding nulls
 */
function sum(values) {
  const valid = values.filter(v => v !== null && v !== undefined && isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filters } = await req.json();
    const { dateFrom, dateTo, agentIds, hostIds, caseIds } = filters || {};

    const endUtc = dateTo ? new Date(dateTo) : new Date();
    const startUtc = dateFrom ? new Date(dateFrom) : new Date(endUtc - 7 * 24 * 60 * 60 * 1000);

    // Build query
    const query = { organization_id: user.organization_id };
    if (agentIds?.length) query.agent_id = { $in: agentIds };
    if (hostIds?.length) query.host_id = { $in: hostIds };
    if (caseIds?.length) query.case_id = { $in: caseIds };

    // Fetch telemetry events
    const telemetryEvents = await base44.asServiceRole.entities.AgentTelemetryEvent.filter(query);

    // Apply date filter
    const filteredEvents = telemetryEvents.filter(e => {
      const ts = new Date(e.ts_utc);
      return ts >= startUtc && ts <= endUtc;
    });

    // Determine bucket size based on range
    const rangeMs = endUtc - startUtc;
    const bucketMs = rangeMs > 30 * 24 * 60 * 60 * 1000 ? 24 * 60 * 60 * 1000 :
                     rangeMs > 7 * 24 * 60 * 60 * 1000 ? 60 * 60 * 1000 :
                     5 * 60 * 1000;

    // Aggregate by agent + bucket
    const agentBuckets = {};
    filteredEvents.forEach(e => {
      const agentId = e.agent_id;
      const bucketKey = Math.floor(new Date(e.ts_utc).getTime() / bucketMs) * bucketMs;
      const key = `${agentId}_${bucketKey}`;

      if (!agentBuckets[key]) {
        agentBuckets[key] = {
          agentId,
          timestamp: new Date(bucketKey).toISOString(),
          cpuValues: [],
          memMbValues: [],
          memPctValues: [],
          diskPctValues: [],
          queueValues: [],
          errorDeltas: [],
          scanDurations: [],
          bytesUploaded: [],
          eventIds: []
        };
      }

      if (e.cpu_pct !== null && e.cpu_pct !== undefined) agentBuckets[key].cpuValues.push(e.cpu_pct);
      if (e.mem_mb !== null && e.mem_mb !== undefined) agentBuckets[key].memMbValues.push(e.mem_mb);
      if (e.mem_pct !== null && e.mem_pct !== undefined) agentBuckets[key].memPctValues.push(e.mem_pct);
      if (e.disk_pct !== null && e.disk_pct !== undefined) agentBuckets[key].diskPctValues.push(e.disk_pct);
      if (e.queue_depth !== null && e.queue_depth !== undefined) agentBuckets[key].queueValues.push(e.queue_depth);
      if (e.error_count_delta !== null && e.error_count_delta !== undefined) agentBuckets[key].errorDeltas.push(e.error_count_delta);
      if (e.scan_duration_ms !== null && e.scan_duration_ms !== undefined) agentBuckets[key].scanDurations.push(e.scan_duration_ms);
      if (e.bytes_uploaded !== null && e.bytes_uploaded !== undefined) agentBuckets[key].bytesUploaded.push(e.bytes_uploaded);
      agentBuckets[key].eventIds.push(e.id);
    });

    // Compute timeseries aggregates
    const timeseries = {};
    Object.values(agentBuckets).forEach(bucket => {
      const agentId = bucket.agentId;
      
      if (!timeseries[agentId]) {
        timeseries[agentId] = {
          agentId,
          cpu: [],
          memoryMb: [],
          memoryPct: [],
          diskPct: [],
          errors: [],
          queueDepth: [],
          scanDuration: [],
          bytesUploaded: []
        };
      }

      const ts = bucket.timestamp;

      const cpuAvg = avg(bucket.cpuValues);
      if (cpuAvg !== null) {
        timeseries[agentId].cpu.push({ ts, valueAvg: Math.round(cpuAvg * 10) / 10 });
      }

      const memMbAvg = avg(bucket.memMbValues);
      if (memMbAvg !== null) {
        timeseries[agentId].memoryMb.push({ ts, valueAvg: Math.round(memMbAvg) });
      }

      const memPctAvg = avg(bucket.memPctValues);
      if (memPctAvg !== null) {
        timeseries[agentId].memoryPct.push({ ts, valueAvg: Math.round(memPctAvg * 10) / 10 });
      }

      const diskPctAvg = avg(bucket.diskPctValues);
      if (diskPctAvg !== null) {
        timeseries[agentId].diskPct.push({ ts, valueAvg: Math.round(diskPctAvg * 10) / 10 });
      }

      const queueMax = max(bucket.queueValues);
      const queueAvg = avg(bucket.queueValues);
      if (queueMax !== null) {
        timeseries[agentId].queueDepth.push({ ts, valueMax: queueMax, valueAvg: queueAvg });
      }

      const errorSum = sum(bucket.errorDeltas);
      if (errorSum !== null) {
        timeseries[agentId].errors.push({ ts, valueSum: errorSum });
      }

      const scanAvg = avg(bucket.scanDurations);
      if (scanAvg !== null) {
        timeseries[agentId].scanDuration.push({ ts, valueAvg: Math.round(scanAvg) });
      }

      const bytesSum = sum(bucket.bytesUploaded);
      if (bytesSum !== null) {
        timeseries[agentId].bytesUploaded.push({ ts, valueSum: bytesSum });
      }
    });

    // Build summary table with health status
    const agentSummaries = [];
    const uniqueAgentIds = [...new Set(filteredEvents.map(e => e.agent_id))];

    uniqueAgentIds.forEach(agentId => {
      const agentEvents = filteredEvents.filter(e => e.agent_id === agentId);
      const sortedEvents = agentEvents.sort((a, b) => new Date(b.ts_utc) - new Date(a.ts_utc));
      
      const lastSeenEvent = sortedEvents[0];
      const lastSeenTs = lastSeenEvent ? new Date(lastSeenEvent.ts_utc) : null;
      const minutesSinceLastSeen = lastSeenTs ? (endUtc - lastSeenTs) / 60000 : 999999;

      // Recent metrics (last 60 min)
      const recentEvents = agentEvents.filter(e => (endUtc - new Date(e.ts_utc)) <= 60 * 60 * 1000);

      const cpuRecent = recentEvents.map(e => e.cpu_pct).filter(v => v !== null && v !== undefined);
      const memMbRecent = recentEvents.map(e => e.mem_mb).filter(v => v !== null && v !== undefined);
      const memPctRecent = recentEvents.map(e => e.mem_pct).filter(v => v !== null && v !== undefined);
      const diskPctRecent = recentEvents.map(e => e.disk_pct).filter(v => v !== null && v !== undefined);
      const queueRecent = recentEvents.map(e => e.queue_depth).filter(v => v !== null && v !== undefined);

      const cpuAvgRecent = avg(cpuRecent);
      const memMbAvgRecent = avg(memMbRecent);
      const memPctAvgRecent = avg(memPctRecent);
      const diskPctAvgRecent = avg(diskPctRecent);
      const queueDepthMaxRecent = max(queueRecent);

      // Error counts
      const last1hEvents = agentEvents.filter(e => (endUtc - new Date(e.ts_utc)) <= 60 * 60 * 1000);
      const last24hEvents = agentEvents.filter(e => (endUtc - new Date(e.ts_utc)) <= 24 * 60 * 60 * 1000);

      const errorsLast1h = sum(last1hEvents.map(e => e.error_count_delta)) || 0;
      const errorsLast24h = sum(last24hEvents.map(e => e.error_count_delta)) || 0;

      // Scan duration and bytes uploaded
      const scanDurations = recentEvents.map(e => e.scan_duration_ms).filter(v => v !== null && v !== undefined);
      const scanDurationAvg = avg(scanDurations);
      
      const bytesUploadedRecent = sum(recentEvents.map(e => e.bytes_uploaded)) || 0;

      // HEALTH EVALUATION (per algorithm)
      const metricEvaluations = [];

      // CPU
      const cpuEval = evaluateMetric(cpuAvgRecent, DEFAULT_THRESHOLDS.cpu_pct);
      metricEvaluations.push({ ...cpuEval, metricName: 'CPU' });

      // Memory (prefer mem_pct, fallback to mem_mb)
      const memEval = memPctAvgRecent !== null
        ? evaluateMetric(memPctAvgRecent, DEFAULT_THRESHOLDS.mem_pct)
        : evaluateMetric(memMbAvgRecent, DEFAULT_THRESHOLDS.mem_mb);
      metricEvaluations.push({ ...memEval, metricName: 'Memory' });

      // Disk (nullable)
      if (diskPctAvgRecent !== null) {
        const diskEval = evaluateMetric(diskPctAvgRecent, DEFAULT_THRESHOLDS.disk_pct);
        metricEvaluations.push({ ...diskEval, metricName: 'Disk' });
      }

      // Queue
      const queueEval = evaluateMetric(queueDepthMaxRecent, DEFAULT_THRESHOLDS.queue_depth);
      metricEvaluations.push({ ...queueEval, metricName: 'Queue' });

      const healthResult = computeOverallHealth(metricEvaluations, minutesSinceLastSeen);

      agentSummaries.push({
        agentId,
        agentName: agentId.substring(0, 12) + '...',
        hostId: lastSeenEvent?.host_id || 'unknown',
        caseId: lastSeenEvent?.case_id || null,
        health_status: healthResult.status,
        health_reasons: healthResult.reasons,
        lastSeenTsUtc: lastSeenTs?.toISOString(),
        minutesSinceLastSeen: Math.round(minutesSinceLastSeen),
        cpuAvgRecent: cpuAvgRecent !== null ? Math.round(cpuAvgRecent * 10) / 10 : null,
        memMbAvgRecent: memMbAvgRecent !== null ? Math.round(memMbAvgRecent) : null,
        memPctAvgRecent: memPctAvgRecent !== null ? Math.round(memPctAvgRecent * 10) / 10 : null,
        diskPctAvgRecent: diskPctAvgRecent !== null ? Math.round(diskPctAvgRecent * 10) / 10 : null,
        queueDepthMaxRecent,
        errorsLast1h,
        errorsLast24h,
        scanDurationAvgRecent: scanDurationAvg !== null ? Math.round(scanDurationAvg) : null,
        bytesUploadedRecent,
        totalEvents: agentEvents.length
      });
    });

    // Sort by health priority
    const healthPriority = { 
      [HEALTH_STATUS.CRITICAL]: 0, 
      [HEALTH_STATUS.WARNING]: 1, 
      [HEALTH_STATUS.STALE]: 2, 
      [HEALTH_STATUS.HEALTHY]: 3, 
      [HEALTH_STATUS.UNKNOWN]: 4 
    };
    agentSummaries.sort((a, b) => {
      const diff = healthPriority[a.health_status] - healthPriority[b.health_status];
      if (diff !== 0) return diff;
      return a.minutesSinceLastSeen - b.minutesSinceLastSeen;
    });

    // KPIs
    const kpis = {
      totalAgents: uniqueAgentIds.length,
      healthyAgents: agentSummaries.filter(a => a.health_status === HEALTH_STATUS.HEALTHY).length,
      warningAgents: agentSummaries.filter(a => a.health_status === HEALTH_STATUS.WARNING).length,
      criticalAgents: agentSummaries.filter(a => a.health_status === HEALTH_STATUS.CRITICAL).length,
      staleAgents: agentSummaries.filter(a => a.health_status === HEALTH_STATUS.STALE).length,
      unknownAgents: agentSummaries.filter(a => a.health_status === HEALTH_STATUS.UNKNOWN).length,
      totalErrors24h: sum(agentSummaries.map(a => a.errorsLast24h)) || 0,
      avgScanDuration: avg(agentSummaries.map(a => a.scanDurationAvgRecent))
    };

    const queryTimeMs = Date.now() - startTime;

    return Response.json({
      data: {
        timeseries,
        summaryTable: agentSummaries,
        kpis,
        config: {
          staleGraceMs: STALE_GRACE_MS,
          thresholds: DEFAULT_THRESHOLDS
        }
      },
      meta: {
        filterUsed: filters,
        generatedAt: new Date().toISOString(),
        bucketSize: bucketMs,
        totalEvents: filteredEvents.length,
        agentCount: uniqueAgentIds.length,
        queryTimeMs
      },
      provenance: {
        sourceEntities: ['AgentTelemetryEvent'],
        querySignature: await hashString(JSON.stringify({ filters, widget: 'agent_performance_v3', version: '3.0' }))
      }
    });

  } catch (error) {
    console.error('Analytics agent performance error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}