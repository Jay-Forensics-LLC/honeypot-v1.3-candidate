/**
 * BLE Device Fingerprinting System
 * Multi-dimensional fingerprinting with ML clustering
 */

import { CryptoUtils } from '../utils/CryptoUtils';

export class BLEFingerprinter {
  constructor() {
    this.fingerprintCache = new Map();
    this.behavioralProfiles = new Map();
  }

  /**
   * Generate comprehensive fingerprint from BLE device data
   */
  async generateFingerprint(deviceData) {
    const {
      mac_address,
      advertising_interval,
      advertising_payload,
      tx_power,
      supported_services,
      gatt_characteristics,
      manufacturer_data,
      rssi_samples,
      timestamp_samples
    } = deviceData;

    // Calculate timing jitter
    const timingJitter = this.calculateTimingJitter(timestamp_samples);

    // Extract payload pattern
    const payloadPattern = this.extractPayloadPattern(advertising_payload);

    // Build fingerprint attributes
    const attributes = {
      advertising_interval_ms: advertising_interval,
      advertising_payload_pattern: payloadPattern,
      tx_power_dbm: tx_power,
      supported_services: supported_services || [],
      gatt_characteristics: gatt_characteristics || [],
      timing_jitter_ms: timingJitter,
      manufacturer_data: manufacturer_data || '',
      rssi_variance: this.calculateRSSIVariance(rssi_samples)
    };

    // Generate fingerprint ID
    const fingerprintId = await this.hashFingerprint(attributes);

    return {
      device_fingerprint_id: fingerprintId,
      fingerprint_attributes: attributes,
      confidence: this.calculateFingerprintConfidence(attributes)
    };
  }

  /**
   * Calculate timing jitter from timestamp samples
   */
  calculateTimingJitter(timestamps) {
    if (!timestamps || timestamps.length < 2) return 0;

    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Extract characteristic pattern from advertising payload
   */
  extractPayloadPattern(payload) {
    if (!payload) return '';
    
    // Convert to hex string and extract structural pattern
    const hexPayload = Array.from(payload)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Extract AD Type patterns
    const pattern = hexPayload.match(/.{1,2}/g) || [];
    return pattern.slice(0, 16).join('');
  }

  /**
   * Calculate RSSI variance for fingerprinting
   */
  calculateRSSIVariance(rssiSamples) {
    if (!rssiSamples || rssiSamples.length === 0) return 0;

    const mean = rssiSamples.reduce((a, b) => a + b, 0) / rssiSamples.length;
    const variance = rssiSamples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rssiSamples.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Hash fingerprint attributes to create unique ID
   */
  async hashFingerprint(attributes) {
    const fingerprintString = JSON.stringify(attributes, Object.keys(attributes).sort());
    return await CryptoUtils.hash(fingerprintString);
  }

  /**
   * Calculate confidence score for fingerprint
   */
  calculateFingerprintConfidence(attributes) {
    let score = 0;
    let maxScore = 0;

    // Advertising interval (high weight)
    if (attributes.advertising_interval_ms > 0) {
      score += 20;
    }
    maxScore += 20;

    // Payload pattern (high weight)
    if (attributes.advertising_payload_pattern) {
      score += 20;
    }
    maxScore += 20;

    // Services (medium weight)
    if (attributes.supported_services.length > 0) {
      score += 15;
    }
    maxScore += 15;

    // GATT characteristics (medium weight)
    if (attributes.gatt_characteristics.length > 0) {
      score += 15;
    }
    maxScore += 15;

    // Timing jitter (medium weight)
    if (attributes.timing_jitter_ms > 0) {
      score += 10;
    }
    maxScore += 10;

    // Manufacturer data (low weight)
    if (attributes.manufacturer_data) {
      score += 10;
    }
    maxScore += 10;

    // TX power (low weight)
    if (attributes.tx_power_dbm !== undefined) {
      score += 10;
    }
    maxScore += 10;

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Link MAC addresses to same fingerprint
   */
  async linkMACAddresses(newMAC, existingFingerprint, similarityScore) {
    if (similarityScore > 85) {
      return {
        linked: true,
        fingerprint_id: existingFingerprint.device_fingerprint_id,
        confidence: similarityScore
      };
    }
    return { linked: false };
  }

  /**
   * Calculate similarity between two fingerprints
   */
  calculateSimilarity(fp1, fp2) {
    let similarityScore = 0;
    let weights = 0;

    // Compare advertising intervals (20% weight)
    if (Math.abs(fp1.advertising_interval_ms - fp2.advertising_interval_ms) < 10) {
      similarityScore += 20;
    }
    weights += 20;

    // Compare payload patterns (25% weight)
    const payloadSimilarity = this.stringSimilarity(
      fp1.advertising_payload_pattern,
      fp2.advertising_payload_pattern
    );
    similarityScore += payloadSimilarity * 25;
    weights += 25;

    // Compare services (20% weight)
    const serviceSimilarity = this.arrayIntersection(
      fp1.supported_services,
      fp2.supported_services
    );
    similarityScore += serviceSimilarity * 20;
    weights += 20;

    // Compare timing jitter (15% weight)
    if (Math.abs(fp1.timing_jitter_ms - fp2.timing_jitter_ms) < 5) {
      similarityScore += 15;
    }
    weights += 15;

    // Compare manufacturer data (10% weight)
    if (fp1.manufacturer_data === fp2.manufacturer_data) {
      similarityScore += 10;
    }
    weights += 10;

    // Compare TX power (10% weight)
    if (Math.abs(fp1.tx_power_dbm - fp2.tx_power_dbm) < 5) {
      similarityScore += 10;
    }
    weights += 10;

    return (similarityScore / weights) * 100;
  }

  /**
   * String similarity using Levenshtein distance
   */
  stringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Levenshtein distance calculation
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate array intersection percentage
   */
  arrayIntersection(arr1, arr2) {
    if (!arr1 || !arr2 || arr1.length === 0 || arr2.length === 0) return 0;

    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));

    return intersection.size / Math.max(set1.size, set2.size);
  }

  /**
   * Update behavioral profile for device
   */
  updateBehavioralProfile(fingerprintId, location, rssi, timestamp) {
    if (!this.behavioralProfiles.has(fingerprintId)) {
      this.behavioralProfiles.set(fingerprintId, {
        locations: [],
        rssi_history: [],
        first_seen: timestamp,
        sighting_count: 0
      });
    }

    const profile = this.behavioralProfiles.get(fingerprintId);
    profile.locations.push({ location, timestamp });
    profile.rssi_history.push({ rssi, timestamp });
    profile.sighting_count++;
    profile.last_seen = timestamp;

    // Detect stalking patterns
    profile.stalking_score = this.calculateStalkingScore(profile);

    return profile;
  }

  /**
   * Calculate stalking score based on behavioral patterns
   */
  calculateStalkingScore(profile) {
    let score = 0;

    // Frequency of sightings
    if (profile.sighting_count > 50) score += 30;
    else if (profile.sighting_count > 20) score += 15;

    // Cross-location appearances
    const uniqueLocations = new Set(profile.locations.map(l => 
      `${Math.round(l.location.latitude * 100)},${Math.round(l.location.longitude * 100)}`
    ));
    if (uniqueLocations.size > 10) score += 30;
    else if (uniqueLocations.size > 5) score += 15;

    // Temporal persistence (seen over many days)
    if (profile.first_seen && profile.last_seen) {
      const daysDiff = (new Date(profile.last_seen) - new Date(profile.first_seen)) / (1000 * 60 * 60 * 24);
      if (daysDiff > 30) score += 20;
      else if (daysDiff > 7) score += 10;
    }

    // Proximity consistency (always nearby)
    const avgRSSI = profile.rssi_history.reduce((sum, r) => sum + r.rssi, 0) / profile.rssi_history.length;
    if (avgRSSI > -50) score += 20;

    return Math.min(score, 100);
  }
}

export default BLEFingerprinter;