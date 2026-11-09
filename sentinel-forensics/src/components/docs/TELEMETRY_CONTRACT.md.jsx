# Telemetry Contract v1.0

**Effective Date:** 2026-01-26  
**Status:** ENFORCED

## Purpose

This contract defines the strict schema and behavioral requirements for all scan telemetry in Sentinel Forensics. It eliminates placeholder data and establishes forensic-grade provenance for all observations.

---

## Core Principles

1. **No Fabrication**: Zero placeholder, mock, or randomly generated security observations
2. **Explicit Failures**: Collection failures return `TelemetryError`, not fake data
3. **Provenance Mandatory**: Every observation includes source, method, permissions, and interface state
4. **Validation Before Scoring**: Invalid observations are rejected, not scored

---

## Schema

### TelemetryProvenance

```typescript
{
  collector: string;              // "web_bluetooth_api" | "navigator_network_info"
  collectionMethod: string;       // "passive" | "active" | "os_api" | "unsupported"
  permissionsState: PermissionsSnapshot;
  interfacesState: InterfacesSnapshot;
  timestamp: string;              // ISO8601
  confidence: number;             // 0-100
  rationale: string;              // Explanation for confidence level
}
```

### Observation Types

**BLE Observation** - Requires:
- `ble_data.device_id` (mandatory)
- `ble_data.rssi` (mandatory, number)
- `ble_data.address_type` ("public" | "random" | "unknown")
- `provenance` object

**WiFi Observation** - Requires:
- `wifi_data.bssid` (mandatory, MAC format)
- `wifi_data.rssi` (mandatory, number)
- `wifi_data.ssid` (optional, hidden SSIDs allowed)
- `provenance` object

**Network Observation** - Requires:
- `network_data.source_ip` (mandatory)
- `network_data.dest_ip` (mandatory)
- `network_data.protocol` (mandatory)
- `network_data.direction` (mandatory: "inbound" | "outbound" | "lateral")
- `provenance` object

### TelemetryError

```typescript
{
  error_id: string;
  timestamp: string;
  collector: string;
  error_type: "UNSUPPORTED" | "PERMISSION_DENIED" | "HARDWARE_UNAVAILABLE" | "COLLECTION_FAILED";
  error_message: string;          // Technical details
  user_message: string;           // User-friendly explanation
  diagnostics: {
    browser, platform, permissions, interfaces, error_details
  }
}
```

---

## Permitted Collectors

### Web Platform (Current)

| Collector | API | Observations | Limitations |
|-----------|-----|--------------|-------------|
| `web_bluetooth_api` | Web Bluetooth API | BLE devices | Requires user permission + gesture, one device at a time |
| `wifi_scanner` | ❌ Not available | None | WiFi enumeration forbidden in browsers |
| `network_capture` | ❌ Not available | None | Packet capture requires platform APIs |

### Native Agent (Future)

| Collector | API | Observations | Notes |
|-----------|-----|--------------|-------|
| `ble_scanner_native` | Platform BLE | BLE devices | Full scan without per-device prompts |
| `wifi_scanner_native` | Platform WiFi | WiFi APs | Full SSID enumeration |
| `pcap_engine` | libpcap | Network packets | Full packet capture |

---

## Risk Scoring Rules

1. **Validation First**: Only validated observations are scored
2. **Confidence Tracking**: Risk score includes confidence percentage
3. **Insufficient Data**: If `observation_count < 5`, risk score = `null` with warning
4. **Error Handling**: `TelemetryError` entries do NOT contribute to anomaly count

### Formula

```
validObservations = observations.filter(validateObservation)
highAnomalyCount = validObservations.filter(obs => obs.anomaly_score >= 70).length
anomalyRatio = highAnomalyCount / validObservations.length
riskScore = Math.round(anomalyRatio * 100)

confidence = (avgProvenanceConfidence + sampleSizeConfidence) / 2
  where sampleSizeConfidence = min(100, (validObs.length / 20) * 100)
```

---

## UI Requirements

1. **Session Report Header**: Must display `permissionsState` and `interfacesState`
2. **Observations Tab**: Show only validated observations
3. **Telemetry Errors Tab**: Show collection failures separately
4. **No Data State**: If `observation_count === 0`, display:
   - "No observations collected"
   - List of telemetry errors with user-friendly messages
   - Suggestion to install native agent or grant permissions

---

## Prohibited Patterns

❌ `Math.random()` for security data  
❌ `Network-${i}` or similar templated names  
❌ Hardcoded `192.168.*` IPs unless from real capture  
❌ `for (let i = 0; i < randomCount; i++)` style data generation  
❌ Silent fallback to placeholder data  
❌ Scoring invalid/partial observations  

---

## Migration Checklist

- [x] Remove `performRealScan` placeholder loops
- [x] Implement `TelemetryCollector.ts` with real APIs
- [x] Add `validateObservation()` checks
- [x] Update risk scoring to use `calculateRiskScore()`
- [x] Add telemetry errors tab to SessionDetail
- [x] Display permissions/interfaces state in session reports
- [ ] Add unit tests for validation
- [ ] Add CI enforcement (grep for forbidden patterns)
- [ ] Update user documentation

---

## Support

For questions about implementing new collectors or extending the contract, see `components/lib/TelemetryCollector.ts`.