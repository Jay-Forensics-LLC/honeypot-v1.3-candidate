/**
 * BLE Anomaly Detection System
 * Detects GATT fuzzing, advertising floods, spoofing, relay attacks
 */

export class BLEAnomalyDetector {
  constructor() {
    this.advertisingRates = new Map();
    this.gattOperations = new Map();
    this.rssiBaselines = new Map();
    this.detectedAnomalies = [];
  }

  /**
   * Detect advertising flood attacks
   */
  detectAdvertisingFlood(deviceId, timestamp) {
    if (!this.advertisingRates.has(deviceId)) {
      this.advertisingRates.set(deviceId, {
        count: 0,
        windowStart: timestamp,
        history: []
      });
    }

    const rateData = this.advertisingRates.get(deviceId);
    const windowDuration = 1000; // 1 second window
    const floodThreshold = 100; // packets per second

    // Update counter
    rateData.count++;
    rateData.history.push(timestamp);

    // Remove old entries outside window
    const cutoff = timestamp - windowDuration;
    rateData.history = rateData.history.filter(t => t >= cutoff);
    rateData.count = rateData.history.length;

    // Check for flood
    if (rateData.count > floodThreshold) {
      return {
        detected: true,
        anomaly_type: 'advertising_flood',
        severity: 'high',
        confidence: 95,
        rate: rateData.count,
        threshold: floodThreshold
      };
    }

    return { detected: false };
  }

  /**
   * Detect GATT/ATT fuzzing and injection attempts
   */
  detectGATTFuzzing(deviceId, gattOperation) {
    const {
      operation_type,
      characteristic_uuid,
      value_length,
      is_malformed,
      response_code
    } = gattOperation;

    if (!this.gattOperations.has(deviceId)) {
      this.gattOperations.set(deviceId, {
        operations: [],
        malformed_count: 0,
        unusual_writes: 0
      });
    }

    const opData = this.gattOperations.get(deviceId);
    opData.operations.push(gattOperation);

    // Detect malformed packets
    if (is_malformed) {
      opData.malformed_count++;
      
      if (opData.malformed_count > 5) {
        return {
          detected: true,
          anomaly_type: 'gatt_fuzzing',
          severity: 'critical',
          confidence: 90,
          malformed_packets: opData.malformed_count,
          description: 'Multiple malformed GATT packets detected - possible fuzzing attack'
        };
      }
    }

    // Detect unusual write patterns
    if (operation_type === 'write' && value_length > 512) {
      opData.unusual_writes++;
      
      if (opData.unusual_writes > 3) {
        return {
          detected: true,
          anomaly_type: 'att_injection',
          severity: 'high',
          confidence: 85,
          description: 'Unusual write patterns detected - possible injection attempt'
        };
      }
    }

    // Detect rapid operations (fuzzing characteristic)
    const recentOps = opData.operations.slice(-10);
    if (recentOps.length === 10) {
      const timeSpan = recentOps[9].timestamp - recentOps[0].timestamp;
      if (timeSpan < 100) { // 10 ops in < 100ms
        return {
          detected: true,
          anomaly_type: 'gatt_fuzzing',
          severity: 'high',
          confidence: 80,
          description: 'Rapid GATT operations detected - possible automated fuzzing'
        };
      }
    }

    return { detected: false };
  }

  /**
   * Detect beacon spoofing and replay attacks
   */
  detectBeaconSpoof(devices) {
    const beaconPayloads = new Map();
    const anomalies = [];

    // Group devices by advertising payload
    devices.forEach(device => {
      const payload = device.advertising_payload;
      if (!beaconPayloads.has(payload)) {
        beaconPayloads.set(payload, []);
      }
      beaconPayloads.get(payload).push(device);
    });

    // Check for duplicate payloads with inconsistent metadata
    beaconPayloads.forEach((devicesWithPayload, payload) => {
      if (devicesWithPayload.length > 1) {
        // Check RSSI inconsistencies
        const rssiValues = devicesWithPayload.map(d => d.rssi);
        const rssiVariance = this.calculateVariance(rssiValues);

        // If same payload but different RSSI from different locations = spoof
        if (rssiVariance > 20) {
          anomalies.push({
            detected: true,
            anomaly_type: 'beacon_spoof',
            severity: 'high',
            confidence: 85,
            affected_devices: devicesWithPayload.map(d => d.mac_address),
            description: 'Multiple devices broadcasting identical payloads with inconsistent signal strength'
          });
        }
      }
    });

    return anomalies;
  }

  /**
   * Detect RSSI anomalies and impossible mobility
   */
  detectRSSIAnomaly(deviceId, rssi, location, timestamp) {
    if (!this.rssiBaselines.has(deviceId)) {
      this.rssiBaselines.set(deviceId, {
        values: [],
        locations: [],
        timestamps: []
      });
    }

    const baseline = this.rssiBaselines.get(deviceId);
    baseline.values.push(rssi);
    baseline.locations.push(location);
    baseline.timestamps.push(timestamp);

    // Keep only recent history
    if (baseline.values.length > 100) {
      baseline.values.shift();
      baseline.locations.shift();
      baseline.timestamps.shift();
    }

    if (baseline.values.length < 5) {
      return { detected: false };
    }

    // Calculate baseline statistics
    const mean = baseline.values.reduce((a, b) => a + b, 0) / baseline.values.length;
    const stdDev = Math.sqrt(
      baseline.values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / baseline.values.length
    );

    // Detect sudden RSSI jumps (teleportation)
    if (Math.abs(rssi - mean) > 3 * stdDev) {
      return {
        detected: true,
        anomaly_type: 'rssi_anomaly',
        severity: 'medium',
        confidence: 75,
        current_rssi: rssi,
        baseline_mean: mean,
        std_dev: stdDev,
        description: 'Sudden RSSI change detected - possible relay attack or signal manipulation'
      };
    }

    // Detect impossible mobility (teleportation between locations)
    if (baseline.locations.length >= 2) {
      const lastLocation = baseline.locations[baseline.locations.length - 2];
      const lastTimestamp = baseline.timestamps[baseline.timestamps.length - 2];

      const distance = this.calculateDistance(lastLocation, location);
      const timeDiff = (timestamp - lastTimestamp) / 1000; // seconds
      const speed = distance / timeDiff; // meters per second

      // If speed > 50 m/s (180 km/h), likely impossible for BLE device
      if (speed > 50) {
        return {
          detected: true,
          anomaly_type: 'impossible_mobility',
          severity: 'high',
          confidence: 90,
          distance_meters: distance,
          time_seconds: timeDiff,
          calculated_speed_mps: speed,
          description: 'Impossible device mobility detected - likely relay attack'
        };
      }
    }

    return { detected: false };
  }

  /**
   * Detect BLE relay/wormhole attacks
   */
  detectRelayAttack(deviceFingerprint, observerLocations) {
    if (observerLocations.length < 2) {
      return { detected: false };
    }

    // Check if same fingerprint appears simultaneously at distant locations
    const simultaneousLocations = [];
    const timeWindow = 5000; // 5 seconds

    for (let i = 0; i < observerLocations.length; i++) {
      for (let j = i + 1; j < observerLocations.length; j++) {
        const loc1 = observerLocations[i];
        const loc2 = observerLocations[j];

        const timeDiff = Math.abs(loc1.timestamp - loc2.timestamp);
        if (timeDiff < timeWindow) {
          const distance = this.calculateDistance(loc1.location, loc2.location);
          
          // If same device seen at locations > 100m apart within 5 seconds
          if (distance > 100) {
            simultaneousLocations.push({ loc1, loc2, distance, timeDiff });
          }
        }
      }
    }

    if (simultaneousLocations.length > 0) {
      return {
        detected: true,
        anomaly_type: 'relay_attack',
        severity: 'critical',
        confidence: 95,
        simultaneous_sightings: simultaneousLocations,
        description: 'Device fingerprint detected simultaneously at distant locations - relay attack highly likely'
      };
    }

    return { detected: false };
  }

  /**
   * Detect pairing anomalies
   */
  detectPairingAnomaly(pairingAttempt) {
    const {
      pairing_method,
      security_level,
      device_fingerprint,
      is_expected_device
    } = pairingAttempt;

    const anomalies = [];

    // Detect legacy pairing (insecure)
    if (pairing_method === 'legacy' || pairing_method === 'just_works') {
      anomalies.push({
        detected: true,
        anomaly_type: 'pairing_anomaly',
        severity: 'medium',
        confidence: 70,
        description: 'Insecure pairing method detected (legacy/just_works)'
      });
    }

    // Detect unexpected pairing attempts
    if (!is_expected_device) {
      anomalies.push({
        detected: true,
        anomaly_type: 'pairing_anomaly',
        severity: 'high',
        confidence: 85,
        description: 'Unexpected pairing attempt from unknown device'
      });
    }

    // Detect downgrade attacks (lower security than expected)
    if (security_level && security_level < 3) {
      anomalies.push({
        detected: true,
        anomaly_type: 'pairing_anomaly',
        severity: 'high',
        confidence: 80,
        description: 'Low security level pairing detected - possible downgrade attack'
      });
    }

    return anomalies.length > 0 ? anomalies[0] : { detected: false };
  }

  /**
   * Calculate geographic distance between two points
   */
  calculateDistance(loc1, loc2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = loc1.latitude * Math.PI / 180;
    const φ2 = loc2.latitude * Math.PI / 180;
    const Δφ = (loc2.latitude - loc1.latitude) * Math.PI / 180;
    const Δλ = (loc2.longitude - loc1.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Calculate variance of array
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Get all detected anomalies
   */
  getDetectedAnomalies() {
    return this.detectedAnomalies;
  }

  /**
   * Clear anomaly history
   */
  clearAnomalies() {
    this.detectedAnomalies = [];
    this.advertisingRates.clear();
    this.gattOperations.clear();
    this.rssiBaselines.clear();
  }
}

export default BLEAnomalyDetector;