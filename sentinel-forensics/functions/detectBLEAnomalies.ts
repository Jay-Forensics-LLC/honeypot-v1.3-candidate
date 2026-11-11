import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * ML-Based BLE Anomaly Detection
 * Uses statistical analysis and pattern recognition to detect suspicious BLE behavior
 */

// Simple statistical anomaly detection
function calculateZScore(value, mean, stdDev) {
    if (stdDev === 0) return 0;
    return Math.abs((value - mean) / stdDev);
}

function calculateStats(values) {
    if (values.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0 };
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return {
        mean,
        stdDev,
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { session_id, device_fingerprint_id } = await req.json();

        if (!session_id && !device_fingerprint_id) {
            return Response.json({
                error: 'Must provide either session_id or device_fingerprint_id'
            }, { status: 400 });
        }

        // Fetch observations for this session or device
        let observations;
        if (session_id) {
            observations = await base44.entities.Observation.filter({ session_id });
        } else {
            // Get all observations for this device fingerprint across all sessions
            const devices = await base44.entities.BLEDevice.filter({ 
                device_fingerprint_id 
            });
            const device = devices[0];
            
            if (!device) {
                return Response.json({ error: 'Device not found' }, { status: 404 });
            }

            // Get recent detections
            observations = device.detection_history?.slice(-100) || [];
        }

        if (observations.length < 3) {
            return Response.json({
                success: true,
                message: 'Insufficient data for anomaly detection',
                observations_count: observations.length,
                anomalies: []
            });
        }

        const anomalies = [];

        // 1. RSSI Anomaly Detection (Signal Strength)
        const rssiValues = observations
            .filter(o => o.ble_data?.rssi)
            .map(o => o.ble_data.rssi);

        if (rssiValues.length >= 3) {
            const rssiStats = calculateStats(rssiValues);
            const recentRSSI = rssiValues.slice(-5);

            for (let i = 0; i < recentRSSI.length; i++) {
                const zScore = calculateZScore(recentRSSI[i], rssiStats.mean, rssiStats.stdDev);
                
                if (zScore > 2.5) { // More than 2.5 standard deviations
                    anomalies.push({
                        anomaly_type: 'rssi_anomaly',
                        severity: zScore > 3.5 ? 'high' : 'medium',
                        confidence_score: Math.min(95, zScore * 20),
                        description: `Unusual signal strength detected (${recentRSSI[i]} dBm vs baseline ${rssiStats.mean.toFixed(1)} dBm)`,
                        detection_method: 'statistical_analysis',
                        indicators: [
                            `Z-Score: ${zScore.toFixed(2)}`,
                            `Baseline: ${rssiStats.mean.toFixed(1)} ± ${rssiStats.stdDev.toFixed(1)} dBm`,
                            `Detected: ${recentRSSI[i]} dBm`
                        ]
                    });
                }
            }
        }

        // 2. Advertising Interval Anomaly
        const intervals = observations
            .filter(o => o.ble_data?.advertising_interval_ms)
            .map(o => o.ble_data.advertising_interval_ms);

        if (intervals.length >= 3) {
            const intervalStats = calculateStats(intervals);
            const recentIntervals = intervals.slice(-5);

            for (let i = 0; i < recentIntervals.length; i++) {
                const zScore = calculateZScore(recentIntervals[i], intervalStats.mean, intervalStats.stdDev);
                
                if (zScore > 2.0) {
                    anomalies.push({
                        anomaly_type: 'advertising_interval_anomaly',
                        severity: 'medium',
                        confidence_score: Math.min(90, zScore * 25),
                        description: `Advertising interval changed significantly (${recentIntervals[i]}ms vs ${intervalStats.mean.toFixed(0)}ms baseline)`,
                        detection_method: 'statistical_analysis',
                        indicators: [
                            `Z-Score: ${zScore.toFixed(2)}`,
                            `Could indicate device state change or spoofing`
                        ]
                    });
                }
            }
        }

        // 3. Impossible Mobility Detection (location changes)
        const locatedObservations = observations.filter(o => 
            o.ble_data?.rssi && 
            o.timestamp
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        for (let i = 1; i < locatedObservations.length; i++) {
            const prev = locatedObservations[i - 1];
            const curr = locatedObservations[i];

            const timeDiffMs = new Date(curr.timestamp) - new Date(prev.timestamp);
            const timeDiffSec = timeDiffMs / 1000;

            // Estimate distance based on RSSI change
            const rssiChange = Math.abs(curr.ble_data.rssi - prev.ble_data.rssi);
            
            // RSSI typically varies ~10dBm per 2x distance change
            // If RSSI changed by >30dBm in <5 seconds, suspicious
            if (rssiChange > 30 && timeDiffSec < 5) {
                anomalies.push({
                    anomaly_type: 'impossible_mobility',
                    severity: 'high',
                    confidence_score: 80,
                    description: `Impossible movement detected: Signal strength changed ${rssiChange}dBm in ${timeDiffSec.toFixed(1)}s`,
                    detection_method: 'spatial_temporal_analysis',
                    indicators: [
                        `RSSI delta: ${rssiChange}dBm`,
                        `Time delta: ${timeDiffSec.toFixed(1)}s`,
                        `Likely indicates: Relay attack or MAC spoofing`
                    ]
                });
            }
        }

        // 4. MAC Randomization Pattern Detection
        if (device_fingerprint_id) {
            const devices = await base44.entities.BLEDevice.filter({ 
                device_fingerprint_id 
            });
            const device = devices[0];

            if (device && device.mac_address_history && device.mac_address_history.length > 5) {
                const macChanges = device.mac_address_history;
                const avgTimeBetweenChanges = macChanges.slice(0, -1).reduce((sum, curr, idx) => {
                    const next = macChanges[idx + 1];
                    const diff = new Date(next.first_seen) - new Date(curr.last_seen);
                    return sum + diff;
                }, 0) / (macChanges.length - 1);

                // If MAC changes happen very frequently (< 5 minutes average), suspicious
                if (avgTimeBetweenChanges < 5 * 60 * 1000) {
                    anomalies.push({
                        anomaly_type: 'mac_randomization_abuse',
                        severity: 'medium',
                        confidence_score: 70,
                        description: `Aggressive MAC randomization detected (avg ${(avgTimeBetweenChanges / 1000 / 60).toFixed(1)} minutes between changes)`,
                        detection_method: 'behavioral_pattern_analysis',
                        indicators: [
                            `MAC changes: ${macChanges.length}`,
                            `Avg interval: ${(avgTimeBetweenChanges / 1000 / 60).toFixed(1)} minutes`,
                            `Potential tracking evasion or device spoofing`
                        ]
                    });
                }
            }
        }

        // 5. Service UUID Pattern Analysis (detect known threat signatures)
        const serviceUUIDs = observations
            .filter(o => o.ble_data?.service_uuids)
            .flatMap(o => o.ble_data.service_uuids);

        // Check against known threat signatures
        const threatSignatures = await base44.entities.BLEThreatSignature.filter({ enabled: true });

        for (const signature of threatSignatures) {
            // Simple pattern matching (production should use more sophisticated matching)
            const patternMatches = signature.behavioral_indicators?.some(indicator => 
                serviceUUIDs.some(uuid => uuid.includes(indicator))
            );

            if (patternMatches) {
                anomalies.push({
                    anomaly_type: signature.threat_family || 'known_threat_pattern',
                    severity: signature.severity,
                    confidence_score: 85,
                    description: `Known threat pattern detected: ${signature.signature_name}`,
                    detection_method: 'signature_matching',
                    indicators: [
                        `Matched signature: ${signature.signature_name}`,
                        `Threat family: ${signature.threat_family}`,
                        signature.description || 'Known malicious BLE behavior'
                    ],
                    reference: signature.rule_id
                });
            }
        }

        // Create anomaly records for high-confidence detections
        for (const anomaly of anomalies.filter(a => a.confidence_score > 60)) {
            await base44.entities.BLEAnomaly.create({
                anomaly_id: `ANOM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                anomaly_type: anomaly.anomaly_type,
                severity: anomaly.severity,
                confidence_score: anomaly.confidence_score,
                device_fingerprint_id: device_fingerprint_id || 'unknown',
                mac_address: observations[0]?.ble_data?.mac_address || 'unknown',
                detection_timestamp: new Date().toISOString(),
                detection_method: anomaly.detection_method,
                anomaly_details: {
                    description: anomaly.description,
                    indicators: anomaly.indicators
                },
                alert_status: anomaly.severity === 'high' || anomaly.severity === 'critical' ? 'new' : 'acknowledged'
            });
        }

        // Audit log
        await base44.entities.AuditLog.create({
            event_type: 'ble_anomaly_detection',
            severity: anomalies.length > 0 ? 'warning' : 'info',
            description: `BLE anomaly detection: ${anomalies.length} anomaly/anomalies found`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                session_id,
                device_fingerprint_id,
                observations_analyzed: observations.length,
                anomalies_found: anomalies.length,
                anomaly_types: anomalies.map(a => a.anomaly_type)
            }
        });

        return Response.json({
            success: true,
            observations_analyzed: observations.length,
            anomalies_found: anomalies.length,
            anomalies,
            threat_score: anomalies.length > 0 ? Math.max(...anomalies.map(a => a.confidence_score)) : 0,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('BLE anomaly detection error:', error);
        return Response.json({
            error: 'Anomaly detection failed',
            message: error.message
        }, { status: 500 });
    }
});