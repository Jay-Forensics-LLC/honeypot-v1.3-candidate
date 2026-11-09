
/**
 * User & Entity Behavior Analytics (UBA) Engine
 * Real-time profiling and anomaly detection
 * Creates profiles for each user/device and detects deviations
 *
 * SECURITY: All encryption uses user-specific keys from secure key management
 */

import { base44 } from "@/api/base44Client";
import { TamperResistantLogger } from '../forensics/TamperResistantLogger';

export class UserBehaviorAnalyzer {
  constructor() {
    this.logger = new TamperResistantLogger();
    this.anomalyThreshold = 65; // Score above which to alert
  }

  /**
   * Get or create encryption key for user
   * SECURITY: Never uses hardcoded defaults
   */
  async getEncryptionKey(userId) {
    try {
      // Assuming base44.auth.me() returns the current authenticated user's details.
      // This implementation implies userId is the email of the currently authenticated user.
      // If UBA is intended for an admin to manage multiple users, this authorization logic
      // would need to be re-evaluated to fetch keys specific to the 'userId'.
      const user = await base44.auth.me();

      if (!user || user.email !== userId) {
        throw new Error(`Unauthorized: Cannot access encryption key for user ${userId}.`);
      }

      // The outline's original 'encryption_key_hash' was inconsistent with its usage
      // (returning it directly as the key). Assuming 'encryption_key' stores the actual
      // base64-encoded key for functional consistency.
      if (!user.encryption_key) {
        // Generate new key for user
        const newKey = await this.generateSecureKey();

        // Store the actual base64 encoded key (not its hash) in the user's profile
        await base44.auth.updateMe({
          encryption_key: newKey.key // Store the actual key
        });

        return newKey.key;
      }

      // Return existing key
      return user.encryption_key;

    } catch (error) {
      console.error(`Encryption key retrieval for user ${userId} failed:`, error);
      throw new Error(`Failed to access encryption key for user ${userId}. Authentication or authorization might be required.`);
    }
  }

  /**
   * Generate cryptographically secure encryption key
   */
  async generateSecureKey() {
    const key = new Uint8Array(32); // 256-bit key
    crypto.getRandomValues(key);

    // Hash the key for potential future integrity checks (not directly used for encryption/decryption in this flow)
    const hashBuffer = await crypto.subtle.digest('SHA-256', key);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Convert key to base64 for transport and storage
    const keyBase64 = btoa(String.fromCharCode(...key));

    return {
      key: keyBase64,
      hash
    };
  }

  /**
   * Encrypt sensitive data before storage
   * SECURITY: Requires valid encryption key
   */
  async encryptSensitiveData(data, encryptionKey) {
    if (!encryptionKey) {
      throw new Error('Encryption key required');
    }

    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(JSON.stringify(data));

      // Import the encryption key material for PBKDF2
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0)), // Decode base64 key
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );

      const salt = crypto.getRandomValues(new Uint8Array(16)); // 128-bit salt

      // Derive actual AES-GCM key from key material and salt
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000, // High number of iterations for security
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 }, // AES-256 GCM
        false,
        ['encrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV (standard for AES-GCM)

      // Encrypt the data
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        dataBuffer
      );

      // Combine salt, iv, and encrypted data into a single buffer
      const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      result.set(salt, 0);
      result.set(iv, salt.length);
      result.set(new Uint8Array(encrypted), salt.length + iv.length);

      // Encode the combined buffer to base64 for storage
      return btoa(String.fromCharCode(...result));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  /**
   * Decrypt sensitive data
   * SECURITY: Requires valid encryption key
   */
  async decryptSensitiveData(encryptedData, encryptionKey) {
    if (!encryptionKey) {
      throw new Error('Encryption key required for decryption');
    }
    if (!encryptedData) {
      return null;
    }

    try {
      const rawData = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

      const salt = rawData.slice(0, 16);
      const iv = rawData.slice(16, 16 + 12);
      const ciphertext = rawData.slice(16 + 12);

      // Import the encryption key material for PBKDF2
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0)), // Decode base64 key
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );

      // Derive actual AES-GCM key from key material and salt (same process as encryption)
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      // Decrypt the data
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        ciphertext
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decryptedBuffer));
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt sensitive data');
    }
  }

  /**
   * Create or update user behavior profile
   */
  async createProfile(userId) {
    await this.logger.createLogEntry('uba_profile_creation_started', {
      user_id: userId
    }, 'info');

    try {
      // Get encryption key for this user
      const encryptionKey = await this.getEncryptionKey(userId);

      // Collect historical data
      const deviceLogs = await base44.entities.DeviceLog.filter({ created_by: userId });
      const alerts = await base44.entities.Alert.filter({ created_by: userId });
      const cases = await base44.entities.Case.filter({ assigned_investigator: userId });

      // Analyze baseline behavior (unencrypted for analysis)
      const baseline = this.analyzeBaselineBehavior(deviceLogs);

      // Calculate current risk score
      const riskScore = this.calculateRiskScore(deviceLogs, alerts, baseline);

      // Detect anomalies
      const anomalies = await this.detectAnomalies(userId, deviceLogs, baseline);

      // Encrypt sensitive baseline data before storage
      const encryptedBaseline = await this.encryptSensitiveData(baseline, encryptionKey);

      // Create profile structure, storing encrypted baseline
      const profile = {
        user_id: userId,
        baseline_behavior: {
          encrypted: true,
          data: encryptedBaseline
        },
        current_risk_score: riskScore,
        anomaly_predictions: [],
        behavior_changes: anomalies,
        last_analysis: new Date().toISOString()
      };

      // Save to database
      const existing = await base44.entities.BehaviorProfile.filter({ user_id: userId });

      if (existing && existing.length > 0) {
        await base44.entities.BehaviorProfile.update(existing[0].id, profile);
      } else {
        await base44.entities.BehaviorProfile.create(profile);
      }

      // Generate alert if risk is high
      if (riskScore > this.anomalyThreshold) {
        await this.generateAnomalyAlert(userId, riskScore, anomalies);
      }

      await this.logger.createLogEntry('uba_profile_created', {
        user_id: userId,
        risk_score: riskScore,
        anomalies_detected: anomalies.length,
        encryption_used: true // Log that encryption was used for storage
      }, riskScore > this.anomalyThreshold ? 'warning' : 'info');

      return profile;

    } catch (error) {
      await this.logger.createLogEntry('uba_profile_creation_failed', {
        user_id: userId,
        error: error.message
      }, 'error');
      throw error;
    }
  }

  /**
   * Analyze baseline behavior patterns
   */
  analyzeBaselineBehavior(deviceLogs) {
    if (!deviceLogs || deviceLogs.length === 0) {
      return {
        avg_session_duration: 0,
        typical_login_times: [],
        common_locations: [],
        typical_actions: [],
        device_patterns: {}
      };
    }

    // Calculate average session duration
    const sessions = deviceLogs
      .filter(log => log.behavior_metrics?.session_duration)
      .map(log => log.behavior_metrics.session_duration);
    const avg_session_duration = sessions.length > 0
      ? sessions.reduce((a, b) => a + b, 0) / sessions.length
      : 0;

    // Extract typical login times
    const loginTimes = deviceLogs.map(log => {
      const date = new Date(log.timestamp);
      return date.getHours();
    });
    const typical_login_times = this.findMostCommon(loginTimes, 3);

    // Extract common locations
    const locations = deviceLogs
      .filter(log => log.location_data?.latitude)
      .map(log => ({
        latitude: log.location_data.latitude,
        longitude: log.location_data.longitude
      }));
    const common_locations = this.clusterLocations(locations);

    // Extract typical actions
    const actions = deviceLogs
      .map(log => log.behavior_metrics?.typical_actions || [])
      .flat();
    const typical_actions = this.findMostCommon(actions, 5);

    // Device patterns
    const device_patterns = {
      fingerprints: [...new Set(deviceLogs.map(log => log.device_fingerprint))],
      typical_count: Math.ceil(deviceLogs.length / 30) // Devices per month
    };

    return {
      avg_session_duration,
      typical_login_times,
      common_locations,
      typical_actions,
      device_patterns
    };
  }

  /**
   * Calculate current risk score
   */
  calculateRiskScore(deviceLogs, alerts, baseline) {
    let score = 0;

    // Recent device logs
    const recentLogs = deviceLogs.filter(log =>
      new Date(log.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    // Check for anomaly score in logs
    const avgAnomalyScore = recentLogs.length > 0
      ? recentLogs.reduce((sum, log) => sum + (log.anomaly_score || 0), 0) / recentLogs.length
      : 0;
    score += avgAnomalyScore * 0.5;

    // Check for recent critical alerts
    const criticalAlerts = alerts.filter(alert =>
      alert.severity === 'critical' &&
      new Date(alert.detection_timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    score += criticalAlerts.length * 10;

    // Check for unusual login times
    const recentLoginTimes = recentLogs.map(log => new Date(log.timestamp).getHours());
    const unusualLogins = recentLoginTimes.filter(time =>
      !baseline.typical_login_times.includes(time)
    ).length;
    score += unusualLogins * 5;

    // Check for new devices
    const recentFingerprints = new Set(recentLogs.map(log => log.device_fingerprint));
    const newDevices = [...recentFingerprints].filter(fp =>
      !baseline.device_patterns.fingerprints.includes(fp)
    ).length;
    score += newDevices * 15;

    return Math.min(100, score);
  }

  /**
   * Detect behavioral anomalies
   */
  async detectAnomalies(userId, deviceLogs, baseline) {
    const anomalies = [];
    const recentLogs = deviceLogs.filter(log =>
      new Date(log.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    // Check for unusual login time
    for (const log of recentLogs) {
      const hour = new Date(log.timestamp).getHours();
      if (!baseline.typical_login_times.includes(hour)) {
        anomalies.push({
          change_type: 'unusual_login_time',
          severity: 'medium',
          detected_at: log.timestamp,
          details: `Login at ${hour}:00 is outside typical hours ${baseline.typical_login_times.join(', ')}`
        });
      }
    }

    // Check for location anomalies
    for (const log of recentLogs) {
      if (log.location_data?.latitude) {
        const isCommonLocation = baseline.common_locations.some(loc =>
          this.calculateDistance(
            { lat: loc.latitude, lng: loc.longitude },
            { lat: log.location_data.latitude, lng: log.location_data.longitude }
          ) < 50 // within 50km
        );

        if (!isCommonLocation && baseline.common_locations.length > 0) {
          anomalies.push({
            change_type: 'unusual_location',
            severity: 'high',
            detected_at: log.timestamp,
            details: `Login from uncommon location: ${log.location_data.latitude.toFixed(2)}, ${log.location_data.longitude.toFixed(2)}`
          });
        }
      }
    }

    // Check for device fingerprint anomalies
    const recentFingerprints = recentLogs.map(log => log.device_fingerprint);
    const newFingerprints = recentFingerprints.filter(fp =>
      !baseline.device_patterns.fingerprints.includes(fp)
    );

    if (newFingerprints.length > 0) {
      anomalies.push({
        change_type: 'new_device_fingerprint',
        severity: 'critical',
        detected_at: recentLogs[recentLogs.length - 1].timestamp,
        details: `${newFingerprints.length} new device(s) detected`
      });
    }

    // Check for session duration anomalies
    const recentDurations = recentLogs
      .filter(log => log.behavior_metrics?.session_duration)
      .map(log => log.behavior_metrics.session_duration);

    if (recentDurations.length > 0 && baseline.avg_session_duration > 0) {
      const avgRecent = recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length;
      const deviation = Math.abs(avgRecent - baseline.avg_session_duration) / baseline.avg_session_duration;

      if (deviation > 2) { // 200% deviation
        anomalies.push({
          change_type: 'session_duration_anomaly',
          severity: 'medium',
          detected_at: recentLogs[recentLogs.length - 1].timestamp,
          details: `Session duration ${(deviation * 100).toFixed(0)}% deviation from baseline`
        });
      }
    }

    // Check for rapid location changes (impossible travel)
    const sortedLogs = recentLogs.sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    for (let i = 1; i < sortedLogs.length; i++) {
      const prev = sortedLogs[i - 1];
      const curr = sortedLogs[i];

      if (prev.location_data?.latitude && curr.location_data?.latitude) {
        const distance = this.calculateDistance(
          { lat: prev.location_data.latitude, lng: prev.location_data.longitude },
          { lat: curr.location_data.latitude, lng: curr.location_data.longitude }
        );

        const timeDiff = (new Date(curr.timestamp) - new Date(prev.timestamp)) / (1000 * 60 * 60); // hours
        const speed = distance / timeDiff; // km/h

        if (speed > 900) { // Faster than airplane
          anomalies.push({
            change_type: 'impossible_travel',
            severity: 'critical',
            detected_at: curr.timestamp,
            details: `Travel speed ${speed.toFixed(0)} km/h between locations is impossible`
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Generate anomaly alert
   */
  async generateAnomalyAlert(userId, riskScore, anomalies) {
    await base44.entities.Alert.create({
      alert_type: 'unauthorized_access',
      severity: riskScore > 80 ? 'critical' : 'high',
      title: `User Behavior Anomaly Detected: ${userId}`,
      description: `User ${userId} exhibits ${anomalies.length} behavioral anomalies with risk score ${riskScore}/100. Immediate review recommended.`,
      source: 'User Behavior Analytics',
      detection_timestamp: new Date().toISOString(),
      affected_systems: [userId],
      recommended_actions: [
        'Review user activity logs',
        'Verify recent login locations',
        'Check for account compromise',
        'Consider MFA enforcement',
        'Review recent access to sensitive data',
        ...anomalies.slice(0, 3).map(a => `Address: ${a.change_type}`)
      ]
    });
  }

  /**
   * Predict future anomalies using ML
   */
  async predictAnomalies(userId) {
    const profiles = await base44.entities.BehaviorProfile.filter({ user_id: userId });
    if (!profiles || profiles.length === 0) {
      return [];
    }

    const profile = profiles[0];
    let baseline;

    // Decrypt baseline if it was stored encrypted
    if (profile.baseline_behavior && profile.baseline_behavior.encrypted) {
      const encryptionKey = await this.getEncryptionKey(userId); // Need the user's key to decrypt
      baseline = await this.decryptSensitiveData(profile.baseline_behavior.data, encryptionKey);
    } else {
      // Fallback for profiles that might not have encrypted baselines or for direct unencrypted storage
      baseline = profile.baseline_behavior;
    }

    // If baseline is still null/undefined after decryption attempt or if it was not encrypted/available
    if (!baseline) {
        console.warn(`Baseline behavior not available or could not be decrypted for user ${userId}. Skipping anomaly prediction.`);
        return [];
    }

    const recentChanges = profile.behavior_changes || [];

    // Simple prediction based on recent trends
    const predictions = [];

    // Predict account compromise if multiple anomalies
    if (recentChanges.length >= 3) {
      predictions.push({
        predicted_threat: 'Account Compromise',
        confidence: 75,
        timeframe: '24-48 hours',
        indicators: recentChanges.map(c => c.change_type),
        mitigation: 'Force password reset and enable MFA'
      });
    }

    // Predict data exfiltration if unusual session patterns
    const sessionAnomalies = recentChanges.filter(c => c.change_type === 'session_duration_anomaly');
    if (sessionAnomalies.length > 0) {
      predictions.push({
        predicted_threat: 'Data Exfiltration',
        confidence: 60,
        timeframe: '1-7 days',
        indicators: ['Prolonged sessions', 'Unusual access patterns'],
        mitigation: 'Monitor file access and network traffic'
      });
    }

    // Update profile with predictions
    if (predictions.length > 0) {
      await base44.entities.BehaviorProfile.update(profile.id, {
        anomaly_predictions: predictions
      });
    }

    return predictions;
  }

  /**
   * Real-time monitoring
   */
  async monitorRealTime(userId) {
    // Poll for new logs every 60 seconds
    const interval = setInterval(async () => {
      try {
        const deviceLogs = await base44.entities.DeviceLog.filter({ created_by: userId });
        const recentLog = deviceLogs[0]; // Assuming the most recent log is relevant

        if (recentLog && recentLog.anomaly_score > 70) {
          // High anomaly score - trigger immediate alert by re-evaluating profile
          await this.createProfile(userId);
        }
      } catch (error) {
        console.error('Real-time monitoring error:', error);
      }
    }, 60000);

    return interval;
  }

  /**
   * Helper methods
   */
  findMostCommon(arr, count) {
    const frequency = {};
    arr.forEach(item => {
      frequency[item] = (frequency[item] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([item]) => parseInt(item) || item);
  }

  clusterLocations(locations) {
    if (locations.length === 0) return [];

    // Simple clustering: group locations within 5km
    const clusters = [];
    const used = new Set();

    for (let i = 0; i < locations.length; i++) {
      if (used.has(i)) continue;

      const cluster = [locations[i]];
      used.add(i);

      for (let j = i + 1; j < locations.length; j++) {
        if (used.has(j)) continue;

        const distance = this.calculateDistance(
          { lat: locations[i].latitude, lng: locations[i].longitude },
          { lat: locations[j].latitude, lng: locations[j].longitude }
        );

        if (distance < 5) {
          cluster.push(locations[j]);
          used.add(j);
        }
      }

      // Calculate centroid
      const centroid = {
        latitude: cluster.reduce((sum, loc) => sum + loc.latitude, 0) / cluster.length,
        longitude: cluster.reduce((sum, loc) => sum + loc.longitude, 0) / cluster.length,
        count: cluster.length
      };

      clusters.push(centroid);
    }

    return clusters.sort((a, b) => b.count - a.count).slice(0, 5);
  }

  calculateDistance(loc1, loc2) {
    const R = 6371; // Earth's radius in km
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLon = (loc2.lng - loc1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export default UserBehaviorAnalyzer;
