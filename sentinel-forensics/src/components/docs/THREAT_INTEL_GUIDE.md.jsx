# Threat Intelligence System Guide

## Architecture Overview

The threat intelligence system provides automated IOC ingestion, risk scoring, and threat actor tracking with full chain-of-custody guarantees.

---

## A) AI-Driven Risk Scoring for Correlated IOCs

### Data Model

**CorrelationRiskAssessment** (append-only)
- `risk_score`: 0-100 composite score
- `risk_confidence_band`: low | medium | high
- `risk_model_version`: "risk-v1" (versioning for model evolution)
- `risk_inputs_hash`: SHA-256 of normalized inputs
- `risk_components`: Breakdown of scoring factors
- `risk_explain`: Human-readable explanation
- `scored_at`: Timestamp

**Immutability**: Rescoring creates a NEW assessment record, never overwrites.

### Scoring Formula

```
risk_score = (source_reliability × 0.25) + 
             (recency × 0.20) + 
             (match_strength × 0.25) + 
             (case_criticality × 0.15) + 
             (feed_signals × 0.15)
```

**Components:**
- **Source Reliability** (0-100): Based on feed reputation (MISP=95, VirusTotal=90, manual=60)
- **Recency** (0-100): Decay function based on `last_seen` (7d=100, 180d+=20)
- **Match Strength** (0-100): IOC confidence from source feed
- **Case Criticality** (0-100): Case priority mapping (critical=100, low=25)
- **Feed Signals** (0-100): TTP count + threat actor attribution bonus

**Confidence Band**: Statistical variance of components
- High: variance < 15
- Medium: variance < 30
- Low: variance ≥ 30

### Workflow

1. **Auto-triggered**: `scoreCorrelationRisk()` called immediately after correlation creation
2. **Manual rescore**: Analyst requests rescore → NEW assessment appended
3. **Feed updates**: New intel matches trigger rescoring

### API Endpoint

```javascript
POST /functions/scoreCorrelationRisk
{
  "correlation_id": "corr_abc123"
}

Response:
{
  "success": true,
  "assessment": {
    "risk_score": 85,
    "risk_confidence_band": "high",
    "risk_explain": {...}
  }
}
```

### UI Integration

**Correlation Table** (`CorrelationTable.js`):
- Risk Score column (0-100 badge, color-coded)
- Confidence band badge
- Default sort: risk_score DESC
- Filters: score range slider + confidence dropdown

**Correlation Detail** (`CorrelationRiskView.js`):
- Latest risk assessment display
- Component breakdown (source/recency/match/signals)
- Assessment history (audit trail)
- "Why this score" explanation panel

---

## B) Automated Threat Intel Feed Ingestion

### Data Model

**ThreatIntelFeed**
- `feed_name`, `feed_type`, `feed_url`
- `refresh_interval_minutes`: Configurable interval
- `is_active`: Enable/disable toggle
- `last_ingest_at`, `last_ingest_hash`: Audit trail
- `last_ingest_status`: success | failed | skipped
- `last_ingest_error`: Captured error message
- `next_ingest_at`: Calculated next run time
- `ingest_lock_until`: Distributed lock (prevents overlap)

**IntelIngestRun** (append-only)
- `feed_id`, `status`, `input_snapshot`
- `input_hash`: SHA-256 of fetched content
- `iocs_added`, `iocs_updated`, `iocs_deduplicated`
- `completed_at`, `error_message`

### Scheduler Behavior

**Function**: `feedScheduler` (scheduled task every 5 minutes)

**Eligibility Logic**:
```javascript
eligible = is_active && (
  !last_ingest_at || 
  next_ingest_at <= now || 
  (now - last_ingest_at >= refresh_interval)
)
```

**Locking Strategy**:
1. Check `ingest_lock_until > now` → skip if locked
2. Atomically set `ingest_lock_until = now + 10min`
3. Execute ingestion
4. Release lock (set to null) on completion
5. On crash: lock expires by time (10min safety window)

**Failure Handling**:
- Capture error in `last_ingest_error` (truncated to 500 chars)
- Set `last_ingest_status = 'failed'`
- Release lock
- Continue processing other feeds (one failure doesn't block scheduler)

### Ingestion Workflow

1. **Fetch**: Retrieve data from `feed_url`
2. **Normalize**: Parse based on `feed_type` (JSON/CSV/STIX/MISP/OTX)
3. **Deduplicate**: Check existing `Indicator` records by `value` + `indicator_type`
4. **Hash**: SHA-256 of normalized fetched content
5. **Insert**: Create new `Indicator` records
6. **Snapshot**: Store `IntelIngestRun` with input_snapshot + hash
7. **Update Feed**: Set `last_ingest_at`, `last_ingest_hash`, `next_ingest_at`

### UI

**Feed Management Page** (`FeedManagement.js`):
- Feed cards showing: status, interval, last ingest, next ingest, IOC count
- Actions: Run Now (manual), Enable/Disable, View History
- Create feed dialog with URL + interval configuration

**Ingest Run History**:
- Chronological list of runs per feed
- Status badges, parse stats, hashes
- Error messages for failed runs

---

## C) Integration: Feeds → IOCs → Correlations → Risk Scoring

### Pipeline

```
1. feedScheduler runs every 5min
   ↓
2. ingestThreatFeed creates Indicator records
   ↓
3. correlateIOCs matches case observables
   ↓
4. scoreCorrelationRisk computes risk (auto-triggered)
   ↓
5. UI displays risk scores in correlation views
```

### Risk Scoring Inputs (Feed-Enhanced)

- **Feed reputation**: Source weighting from known feeds
- **Recency decay**: `last_seen` timestamp influences score
- **Feed signals**: TTP count + threat actor links + feed_id presence
- **Match type**: Exact match vs fuzzy (future enhancement)

### Correlation Refresh Strategy

**Efficient approach**: When new IOCs ingested:
1. Extract unique indicator values from new batch
2. Query existing case observables matching those values
3. Create correlations only for new matches
4. Trigger `scoreCorrelationRisk` for new correlations

**Avoid**: Full case rescan on every ingest (N×M explosion)

---

## D) Threat Actor Intelligence

### CRUD Operations

**API**: `manageThreatActors` function
- `create`: New actor with ATT&CK TTPs
- `update`: Modify actor metadata
- `link-campaign`: Append campaign to actor
- `list`, `get`: Read operations

**Campaign Modeling**:
```json
{
  "name": "Operation X",
  "start_date": "2024-01-01",
  "end_date": "2024-06-30",
  "targets": ["Government", "Finance"],
  "campaign_id": "camp_12345"
}
```

### ATT&CK Mapping

**TTP Structure**:
```json
{
  "tactic": "Initial Access",
  "technique_id": "T1566.001",
  "technique_name": "Spearphishing Attachment"
}
```

**UI Component**: `AttackMapper.js`
- Groups TTPs by tactic
- Color-coded badges per tactic
- Links to MITRE ATT&CK documentation
- Shows technique IDs + names

### Intelligence Graph

**Component**: `IntelligenceGraph.js`
- Canvas-based visualization
- Node types: Case → Observables → IOCs → Threat Actors
- Edge types: Correlation links
- Interactive: click nodes for details, zoom/pan
- Fullscreen mode

### Campaign Timeline

**Component**: `CampaignTimeline.js`
- Overlays campaign periods with case events
- Detects temporal correlations (events within campaign window)
- Alert banner for overlaps
- Chronological event stream

---

## Testing & Validation

### Unit Tests

**Risk Scoring**:
- Same inputs → same score (deterministic)
- Score bounds enforced (0-100)
- Confidence band calculation correct

**Scheduler**:
- Eligibility logic (interval + lock checks)
- Lock prevents concurrent runs
- `next_ingest_at` calculated correctly

**Correlation**:
- Observable extraction from evidence
- Deduplication works
- Risk scoring triggered

### Integration Tests

**End-to-End**:
1. Create feed → scheduler picks it up → IOCs ingested
2. Upload evidence → correlations created → risk scored
3. Link threat actor → graph updates → timeline shows campaigns

---

## Security & Audit

**Immutability**:
- `CorrelationRiskAssessment`: no updates, only inserts
- `IntelIngestRun`: append-only audit log
- All operations logged in `AuditLog`

**Validation**:
- Score bounds: 0 ≤ risk_score ≤ 100
- Confidence band: enum enforcement
- Feed URLs: validate HTTPS, reject localhost/private IPs

**RBAC**:
- Feed scheduler: admin-only manual trigger
- Threat actor CRUD: admin + case owner
- Risk scoring: auto-triggered, no manual override

---

## Performance Optimizations

**Batching**: Process multiple feeds in parallel (with lock isolation)
**Caching**: Use React Query staleTime for graph data
**Lazy loading**: Intelligence graph renders on-demand
**Deduplication**: Hash-based IOC dedup prevents DB bloat

---

## Failure Modes & Rollback

**Feed fetch fails**: Error captured, lock released, other feeds continue
**Scoring fails**: Correlation created without assessment (can rescore later)
**Lock timeout**: 10min expiry ensures recovery from crashes
**Hash collision**: Astronomically unlikely (SHA-256), but detected via error

**Rollback**: All entities immutable, delete latest records if needed

---

## Monitoring

**Health Checks**:
- Feed scheduler last run time
- Failed ingest count per feed
- Unscored correlations count

**Alerts**:
- Feed failures > 3 consecutive
- Correlation backlog > 100 unscored
- Scheduler not running (check last audit log timestamp)

---

## Sample Usage

### Create Threat Actor
```javascript
const response = await base44.functions.invoke('manageThreatActors', {
  operation: 'create',
  data: {
    actor_name: 'APT29',
    origin_country: 'Russia',
    motivation: 'cyber_espionage',
    sophistication: 'advanced',
    threat_level: 'critical',
    ttps: [
      {
        tactic: 'Initial Access',
        technique_id: 'T1199',
        technique_name: 'Trusted Relationship'
      }
    ]
  }
});
```

### Link Campaign
```javascript
await base44.functions.invoke('manageThreatActors', {
  operation: 'link-campaign',
  actor_id: 'actor_abc123',
  data: {
    campaign: {
      name: 'SolarWinds Supply Chain',
      start_date: '2023-03-01',
      targets: ['Technology', 'Government']
    }
  }
});
```

### Manual Feed Ingest
```javascript
await base44.functions.invoke('ingestThreatFeed', {
  feed_id: 'feed_xyz789',
  iocs: [
    { value: '192.168.1.1', confidence: 80, tags: ['malware'] }
  ]
});
```

---

## End-to-End Flow Example

1. Admin creates ThreatIntelFeed (refresh_interval_minutes=720)
2. Scheduler picks up feed every 5min, checks eligibility
3. At 12-hour mark: fetches IOCs, hashes content, creates IntelIngestRun
4. New Indicator records created with feed_id reference
5. Evidence uploaded to case → correlateIOCs runs
6. Correlation matched → scoreCorrelationRisk auto-triggers
7. CorrelationRiskAssessment created with 85/100 score
8. UI displays risk badge in CorrelationTable
9. Analyst clicks correlation → sees risk breakdown + explanation
10. Intelligence graph updates showing IOC → Threat Actor link
11. Campaign timeline shows temporal overlap with case events

**All steps audited, all artifacts immutable, all hashes verifiable.**