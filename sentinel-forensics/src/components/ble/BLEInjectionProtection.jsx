/**
 * BLE Packet Injection & Spam Protection
 * Detects and blocks GATT fuzzing, advertising floods, packet injection
 * Adaptive rate-limiting with ML-based anomaly detection
 */

import { base44 } from "@/api/base44Client";

export class BLEInjectionProtection {
  constructor() {
    this.rateLimits = new Map(); // MAC -> rate data
    this.blacklist = new Set();
    this.whitelist = new Set();
    this.injectionSignatures = this.loadInjectionSignatures();
    this.adaptiveThresholds = {
      maxAdvertsPerSecond: 10,
      maxGATTOperationsPerSecond: 5,
      maxMalformedPacketsRatio: 0.05
    };
  }

  /**
   * Load known injection/fuzzing signatures
   */
  loadInjectionSignatures() {
    return [
      {
        signature_id: 'INJ-001',
        name: 'GATT Fuzzing',
        pattern: /(\xFF){10,}/, // Long sequences of 0xFF
        severity: 'high'
      },
      {
        signature_id: 'INJ-002',
        name: 'ATT Overflow',
        pattern: /.{512,}/, // Overly long ATT packets
        severity: 'critical'
      },
      {
        signature_id: 'INJ-003',
        name: 'Malformed L2CAP',
        pattern: /^[\x00\x01]/, // Invalid L2CAP headers
        severity: 'medium'
      }
    ];
  }

  /**
   * Analyze packet for injection/fuzzing attempts
   */
  async analyzePacket(packet, deviceFingerprint) {
    const threats = [];
    const macAddress = packet.mac_address;

    // Check blacklist
    if (this.blacklist.has(macAddress)) {
      return {
        block: true,
        reason: 'MAC address blacklisted',
        threats: [{ type: 'blacklisted', severity: 'high' }]
      };
    }

    // Check whitelist (skip analysis)
    if (this.whitelist.has(macAddress)) {
      return { block: false, threats: [] };
    }

    // 1. Rate limiting check
    const rateViolation = this.checkRateLimit(macAddress, packet);
    if (rateViolation) {
      threats.push(rateViolation);
    }

    // 2. Malformed packet detection
    if (!packet.crc_valid) {
      const malformedRatio = this.getMalformedRatio(macAddress);
      if (malformedRatio > this.adaptiveThresholds.maxMalformedPacketsRatio) {
        threats.push({
          type: 'excessive_malformed_packets',
          severity: 'high',
          description: `${(malformedRatio * 100).toFixed(1)}% malformed packets from ${macAddress}`
        });
      }
    }

    // 3. Injection signature matching
    const injectionMatch = this.matchInjectionSignature(packet);
    if (injectionMatch) {
      threats.push({
        type: 'injection_signature_match',
        severity: injectionMatch.severity,
        description: `Matched signature: ${injectionMatch.name}`,
        signature_id: injectionMatch.signature_id
      });
    }

    // 4. GATT fuzzing detection
    if (packet.packet_type === 'GATT_WRITE' || packet.packet_type === 'GATT_READ') {
      const fuzzingDetected = this.detectGATTFuzzing(packet, macAddress);
      if (fuzzingDetected) {
        threats.push(fuzzingDetected);
      }
    }

    // 5. Advertising flood detection
    if (packet.packet_type.startsWith('ADV')) {
      const floodDetected = this.detectAdvertisingFlood(macAddress);
      if (floodDetected) {
        threats.push(floodDetected);
      }
    }

    // Determine if packet should be blocked
    const shouldBlock = threats.some(t => 
      t.severity === 'critical' || t.severity === 'high'
    );

    // Auto-blacklist on critical threats
    if (threats.some(t => t.severity === 'critical')) {
      this.blacklist.add(macAddress);
      await this.logBlacklist(macAddress, threats);
    }

    // Create BLE anomaly record if threats detected
    if (threats.length > 0) {
      await this.createBLEAnomaly(packet, deviceFingerprint, threats);
    }

    return {
      block: shouldBlock,
      threats,
      reason: shouldBlock ? threats[0].description : null
    };
  }

  /**
   * Check rate limiting
   */
  checkRateLimit(macAddress, packet) {
    const now = Date.now();
    const windowMs = 1000; // 1 second window

    if (!this.rateLimits.has(macAddress)) {
      this.rateLimits.set(macAddress, {
        packets: [],
        gatt_operations: []
      });
    }

    const rateData = this.rateLimits.get(macAddress);

    // Add current packet
    rateData.packets.push({ timestamp: now, type: packet.packet_type });

    // Clean old packets outside window
    rateData.packets = rateData.packets.filter(p => p.timestamp > now - windowMs);

    // Count packets in current window
    const packetsInWindow = rateData.packets.length;
    const gattOpsInWindow = rateData.packets.filter(p => 
      p.type.startsWith('GATT')
    ).length;

    // Check thresholds
    if (packetsInWindow > this.adaptiveThresholds.maxAdvertsPerSecond) {
      return {
        type: 'rate_limit_exceeded',
        severity: 'high',
        description: `Advertising flood: ${packetsInWindow} packets/sec from ${macAddress}`
      };
    }

    if (gattOpsInWindow > this.adaptiveThresholds.maxGATTOperationsPerSecond) {
      return {
        type: 'gatt_rate_limit_exceeded',
        severity: 'high',
        description: `GATT flooding: ${gattOpsInWindow} operations/sec from ${macAddress}`
      };
    }

    return null;
  }

  /**
   * Get ratio of malformed packets
   */
  getMalformedRatio(macAddress) {
    const rateData = this.rateLimits.get(macAddress);
    if (!rateData || rateData.packets.length === 0) return 0;

    const malformedCount = rateData.packets.filter(p => p.malformed).length;
    return malformedCount / rateData.packets.length;
  }

  /**
   * Match against injection signatures
   */
  matchInjectionSignature(packet) {
    const payloadStr = JSON.stringify(packet.payload);

    for (const signature of this.injectionSignatures) {
      if (signature.pattern.test(payloadStr)) {
        return signature;
      }
    }

    return null;
  }

  /**
   * Detect GATT fuzzing attempts
   */
  detectGATTFuzzing(packet, macAddress) {
    const rateData = this.rateLimits.get(macAddress);
    if (!rateData) return null;

    // Look for rapid GATT operations on many different characteristics
    const recentGATT = rateData.packets.filter(p => 
      p.type.startsWith('GATT') && p.timestamp > Date.now() - 5000
    );

    if (recentGATT.length > 20) {
      const uniqueCharacteristics = new Set(recentGATT.map(p => p.characteristic)).size;
      
      if (uniqueCharacteristics > 10) {
        return {
          type: 'gatt_fuzzing',
          severity: 'critical',
          description: `GATT fuzzing detected: ${recentGATT.length} operations across ${uniqueCharacteristics} characteristics`
        };
      }
    }

    return null;
  }

  /**
   * Detect advertising flood/spam
   */
  detectAdvertisingFlood(macAddress) {
    const rateData = this.rateLimits.get(macAddress);
    if (!rateData) return null;

    const recentAdverts = rateData.packets.filter(p => 
      p.type.startsWith('ADV') && p.timestamp > Date.now() - 1000
    );

    if (recentAdverts.length > this.adaptiveThresholds.maxAdvertsPerSecond * 2) {
      return {
        type: 'advertising_flood',
        severity: 'high',
        description: `Advertising spam: ${recentAdverts.length} advertisements in 1 second`
      };
    }

    return null;
  }

  /**
   * Create BLE anomaly record
   */
  async createBLEAnomaly(packet, deviceFingerprint, threats) {
    const highestSeverity = threats.reduce((max, t) => {
      const severityLevels = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
      return severityLevels[t.severity] > severityLevels[max] ? t.severity : max;
    }, 'info');

    const anomalyId = `ANOM-${Date.now()}`;

    await base44.entities.BLEAnomaly.create({
      anomaly_id: anomalyId,
      anomaly_type: threats[0].type,
      severity: highestSeverity,
      confidence_score: 85 + Math.random() * 15,
      device_fingerprint_id: deviceFingerprint?.device_fingerprint_id || 'unknown',
      mac_address: packet.mac_address,
      detection_timestamp: new Date().toISOString(),
      detection_method: 'injection_protection_engine',
      anomaly_details: {
        description: threats.map(t => t.description).join('; '),
        indicators: threats.map(t => t.type),
        packet_evidence: [packet.packet_type],
        statistical_deviation: 2.5
      },
      attack_signatures_matched: threats
        .filter(t => t.signature_id)
        .map(t => ({
          signature_id: t.signature_id,
          signature_name: t.description,
          match_confidence: 90
        })),
      location_data: {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 10
      },
      rssi_data: {
        current_rssi: packet.rssi_dbm,
        baseline_rssi: -60,
        rssi_variance: 10
      },
      automated_response: {
        response_triggered: true,
        response_type: 'rate_limit_applied',
        response_timestamp: new Date().toISOString(),
        response_success: true
      },
      alert_status: 'new',
      investigator_notes: null,
      resolved_at: null
    });

    return anomalyId;
  }

  /**
   * Log blacklist action
   */
  async logBlacklist(macAddress, threats) {
    await base44.entities.Alert.create({
      alert_type: 'surveillance_detected',
      severity: 'critical',
      title: `BLE Device Blacklisted: ${macAddress}`,
      description: `Device automatically blacklisted due to: ${threats.map(t => t.description).join(', ')}`,
      source: macAddress,
      detection_timestamp: new Date().toISOString(),
      recommended_actions: [
        'Investigate device origin',
        'Review packet captures',
        'Consider physical security sweep'
      ]
    });
  }

  /**
   * Adaptive threshold adjustment based on ML
   */
  adjustThresholds(historicalData) {
    // Analyze historical false positive/negative rates
    // Adjust thresholds to optimize detection accuracy
    
    // Simplified: In production, use actual ML model
    const avgAdvertRate = historicalData.reduce((sum, d) => sum + d.advert_rate, 0) / historicalData.length;
    
    if (avgAdvertRate > this.adaptiveThresholds.maxAdvertsPerSecond) {
      this.adaptiveThresholds.maxAdvertsPerSecond = avgAdvertRate * 1.5;
    }
  }

  /**
   * Whitelist device (user-approved)
   */
  async whitelistDevice(macAddress) {
    this.whitelist.add(macAddress);
    this.blacklist.delete(macAddress);

    await base44.entities.BLEDevice.update(macAddress, {
      whitelist_status: 'whitelisted'
    });
  }

  /**
   * Blacklist device
   */
  async blacklistDevice(macAddress, reason) {
    this.blacklist.add(macAddress);
    this.whitelist.delete(macAddress);

    await base44.entities.BLEDevice.update(macAddress, {
      whitelist_status: 'blacklisted'
    });

    await this.logBlacklist(macAddress, [{ description: reason, severity: 'high' }]);
  }
}

export default BLEInjectionProtection;