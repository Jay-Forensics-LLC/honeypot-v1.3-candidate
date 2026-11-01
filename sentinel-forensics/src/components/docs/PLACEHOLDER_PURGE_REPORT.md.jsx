# Placeholder Data Purge Report

**Date:** 2026-01-26  
**Scope:** Scan/Telemetry Features  
**Status:** COMPLETED

---

## Executive Summary

Removed all placeholder, mock, and simulated data generation from scan telemetry collection system. Replaced with strict telemetry contract enforcing real data collection or explicit UNSUPPORTED states.

**Impact:**
- 🚨 **Critical Fix**: Eliminated fabricated security observations that could corrupt threat assessments
- ✅ **Audit Compliance**: All observations now include provenance and validation
- 📊 **Risk Score Integrity**: Scoring now based on validated data only
- 🔍 **Transparency**: Users see collection limitations, not fake data

---

## Files Changed

### 1. `pages/NewScanSession` (Lines 41-161)

**Removed:**
```typescript
// ❌ DELETED: Random BLE device generation
const bleDeviceCount = Math.floor(Math.random() * 8) + 3;
for (let i = 0; i < bleDeviceCount; i++) {
  const macAddress = Array.from({length: 6}, () => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join(':').toUpperCase();
  // ... fabricated RSSI, tx_power, etc.
}

// ❌ DELETED: Placeholder WiFi networks
ssid: isAnomalous ? '' : `Network-${i}`
bssid: /* randomly generated MAC */

// ❌ DELETED: Random IP addresses and packets
source_ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
```

**Replaced With:**
```typescript
// ✅ Real API-based collection
const { observations: bleObs, errors: bleErrors } = await collectBLE();

// ✅ Validation before storage
for (const obs of bleObs) {
  const validation = validateObservation(obs);
  if (validation.valid) {
    await base44.entities.Observation.create({...});
  }
}

// ✅ Errors logged explicitly
for (const err of bleErrors) {
  await base44.entities.AuditLog.create({
    event_type: 'telemetry_collection_error',
    ...
  });
}
```

---

## Placeholder Patterns Removed

| Pattern | Location | Type | Replacement |
|---------|----------|------|-------------|
| `Math.floor(Math.random() * N)` | NewScanSession:54,94,130 | Random counts | Real API calls or zero |
| `Device-${i}` | NewScanSession:70 | Templated names | Real device names or null |
| `Network-${i}` | NewScanSession:108 | Templated SSIDs | Real SSIDs or `<hidden>` |
| Random MAC generation | NewScanSession:57,105 | Fabricated addresses | Real BSSID/MAC from API |
| Random IP `192.168.*` | NewScanSession:141 | Fabricated IPs | Real IPs or UNSUPPORTED error |
| `for (let i = 0; i < randomCount)` loops | NewScanSession:56,96,132 | Batch fabrication | Real device iteration or explicit errors |

---

## New Components Added

### 1. `components/types/telemetry.d.ts`
- TypeScript definitions for telemetry contract
- Schemas for Provenance, Observations, Errors
- Interface/Permission snapshot types

### 2. `components/lib/TelemetryCollector.ts`
- Real API-based collectors:
  - `collectBLE()` - Web Bluetooth API integration
  - `collectWiFi()` - Returns UNSUPPORTED (no browser API)
  - `collectNetwork()` - Returns UNSUPPORTED (no browser API)
- `validateObservation()` - Enforces mandatory fields
- `calculateRiskScore()` - Validated scoring only
- `getPermissionsSnapshot()` - Real permission state
- `getInterfacesSnapshot()` - Real interface state

### 3. `components/docs/TELEMETRY_CONTRACT.md`
- Complete specification of schema
- Permitted collectors catalog
- Validation rules and prohibited patterns

### 4. `components/docs/PLACEHOLDER_PURGE_REPORT.md`
- This document

---

## Behavioral Changes

### Before (Placeholder Mode)
1. User clicks "Start Scan"
2. System generates 3-8 random BLE devices with fabricated MACs
3. System generates 5-12 fake WiFi networks named "Network-0..Network-11"
4. System generates 10-20 random network packets with `192.168.*` IPs
5. Risk score calculated from random `anomaly_score` values
6. User sees "convincing" but entirely fake scan results

**Risk:** User makes security decisions based on fabricated data

### After (Real Telemetry Mode)
1. User clicks "Start Scan"
2. System attempts real Web Bluetooth scan (requires user permission)
3. WiFi scan returns `UNSUPPORTED` error with explanation
4. Network scan returns `UNSUPPORTED` error with explanation
5. Risk score = `null` if insufficient valid data, or calculated from real observations only
6. User sees truth: "0 observations, 2 collection errors" with clear explanations

**Benefit:** User understands platform limitations and can install agent for real capabilities

---

## Risk Score Integrity

### Old Formula (Corrupted)
```typescript
// ❌ Based on randomly assigned anomaly scores
const riskScore = Math.min(100, (anomalyCount / observationCount) * 100);
```

### New Formula (Validated)
```typescript
// ✅ Validates observations first
const validObs = observations.filter(obs => validateObservation(obs).valid);
if (validObs.length === 0) return { score: null, confidence: 0 };

const highAnomalyCount = validObs.filter(obs => obs.anomaly_score >= 70).length;
const rawScore = Math.round((highAnomalyCount / validObs.length) * 100);
const confidence = (avgProvenanceConfidence + sampleSizeConfidence) / 2;

return { score: rawScore, confidence, reasoning };
```

---

## UI Changes

### SessionDetail Page

**Added:**
- ⚠️ Telemetry errors warning banner
- 📊 System state card (permissions, interfaces, connection type)
- 📑 "Collection Errors" tab showing failures with diagnostics
- 🔍 "No observations" state with agent installation suggestion

**Example:**
```
⚠️ Collection Limitations Detected
2 collection error(s) occurred during this scan.
WiFi scanning requires native agent. Web browsers cannot enumerate WiFi networks.
Network traffic analysis requires native agent.

System State at Scan Time:
Bluetooth: granted | Connection: wifi | Online: Yes | Platform: MacIntel
```

---

## Testing

### Manual Verification Steps

1. **Airplane Mode Test**
   - Enable airplane mode
   - Run comprehensive scan
   - Expected: 0 observations, 3 errors (BLE/WiFi/Network all UNSUPPORTED or HARDWARE_UNAVAILABLE)
   - Risk score: `null`

2. **Permission Denied Test**
   - Deny Bluetooth permission when prompted
   - Run BLE scan
   - Expected: 0 observations, 1 error (PERMISSION_DENIED)
   - User message: "Bluetooth access was denied. Grant permission..."

3. **Successful BLE Scan Test**
   - Grant Bluetooth permission
   - Run BLE scan
   - Expected: Real device(s) with actual device IDs/names, provenance shows "web_bluetooth_api"

---

## Remaining Work

### Phase 6: Enforcement Tests
- [x] Add placeholder detection test
- [ ] Wire up tests to CI (requires CI config)
- [ ] Add runtime validation in production
- [ ] Add monitoring for invalid observations in live DB

### Future Native Agent Support
- [ ] Implement `ble_scanner_native` collector
- [ ] Implement `wifi_scanner_native` collector  
- [ ] Implement `pcap_engine` collector
- [ ] Add agent detection and automatic collector selection

---

## Breaking Changes

⚠️ **Users will no longer see populated scan results in web-only mode**

**Migration Path:**
1. Web scans with BLE permission → Real BLE observations
2. Web scans without permissions → Zero observations, clear error messages
3. For WiFi/Network → Install native agent (link provided in error messages)

**User Communication:**
> "Sentinel Forensics now provides forensic-grade telemetry. Web browsers have limited scanning capabilities due to security restrictions. For full WiFi and network analysis, install the Sentinel Agent on your target device."

---

## Audit Trail

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Inventory of placeholder patterns | ✅ Complete |
| Phase 2 | Telemetry contract schema created | ✅ Complete |
| Phase 3 | Placeholder removal + collector implementation | ✅ Complete |
| Phase 4 | Risk scoring hardening | ✅ Complete |
| Phase 5 | UI transparency updates | ✅ Complete |
| Phase 6 | Enforcement tests | 🟡 Partial |
| Phase 7 | Documentation | ✅ Complete |

**Verified By:** AI Security Review  
**Approved By:** Senior Engineer

---

## Appendix: Forbidden Patterns

The following patterns are **prohibited** in any scan/telemetry code:

```typescript
// ❌ FORBIDDEN
Math.random() // in collector context
Math.floor(Math.random() * n)
`Network-${i}`
`Device-${i}`
`192.168.${random}.${random}`
for (let i = 0; i < Math.random())
Array.from({length: randomNum}, () => fabricateData())
```

Any code introducing these patterns in `components/lib/TelemetryCollector.ts`, `pages/NewScanSession`, or `pages/SessionDetail` will be **rejected**.