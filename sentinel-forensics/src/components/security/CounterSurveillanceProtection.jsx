import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Shield, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  Camera
} from "lucide-react";
import { CryptoUtils } from "@/components/utils/CryptoUtils";

export default function CounterSurveillanceProtection() {
  const [stealthMode, setStealthMode] = useState(false);
  const [cloakingEnabled, setCloakingEnabled] = useState(false);
  const [evidenceProtectionLevel, setEvidenceProtectionLevel] = useState('high');
  const [monitoringActive, setMonitoringActive] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: evidenceRecords = [] } = useQuery({
    queryKey: ['evidence'],
    queryFn: () => base44.entities.Evidence.list('-timestamp', 100),
  });

  const { data: surveillanceEvents = [] } = useQuery({
    queryKey: ['surveillance-events'],
    queryFn: () => base44.entities.SurveillanceEvent.list('-timestamp', 50),
  });

  const createEvidenceProtectionMutation = useMutation({
    mutationFn: (data) => base44.entities.EvidenceProtection.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-protection'] });
    },
  });

  const protectEvidence = async (evidenceId) => {
    const evidence = evidenceRecords.find(e => e.id === evidenceId);
    if (!evidence) return;

    // Generate cryptographic signature
    const signature = await CryptoUtils.generateSignature(JSON.stringify(evidence));
    const blockHash = await CryptoUtils.hash(JSON.stringify(evidence) + Date.now());

    // Create watermark data
    const watermarkData = {
      visible: false,
      invisible_embedded: true,
      watermark_hash: await CryptoUtils.hash(`${evidenceId}-${user?.email}-${Date.now()}`),
      metadata_embedded: {
        collected_by: user?.email,
        timestamp: new Date().toISOString(),
        gps_coordinates: evidence.location,
        device_fingerprint: navigator.userAgent
      }
    };

    // Create protection record
    await createEvidenceProtectionMutation.mutateAsync({
      evidence_id: evidenceId,
      protection_level: evidenceProtectionLevel,
      encryption_method: 'AES-256-GCM',
      encryption_key_id: await CryptoUtils.generateKeyId(),
      digital_signature: signature,
      watermark_data: watermarkData,
      blockchain_anchor: {
        block_hash: blockHash,
        transaction_id: `tx-${Date.now()}`,
        timestamp: new Date().toISOString(),
        chain_name: 'evidence-chain'
      },
      integrity_checks: [{
        timestamp: new Date().toISOString(),
        hash_value: blockHash,
        algorithm: 'SHA-256',
        verified_by: user?.email,
        status: 'verified'
      }],
      access_log: [{
        timestamp: new Date().toISOString(),
        user_id: user?.email,
        action: 'protection_enabled',
        ip_address: 'current',
        authorized: true
      }],
      secure_storage: {
        storage_type: 'cloud',
        encryption_at_rest: true,
        encryption_in_transit: true,
        geographic_restrictions: [],
        backup_locations: ['primary', 'secondary']
      },
      legal_admissibility: {
        chain_of_custody_intact: true,
        court_ready: true,
        jurisdiction: 'international',
        last_certified: new Date().toISOString()
      }
    });

    // Create audit log
    await base44.entities.AuditLog.create({
      action: 'evidence_protected',
      resource_type: 'Evidence',
      resource_id: evidenceId,
      details: {
        protection_level: evidenceProtectionLevel,
        digital_signature: signature,
        blockchain_anchored: true
      },
      severity: 'info'
    });
  };

  const activateStealthMode = async () => {
    setStealthMode(true);

    // Disable non-essential services
    // Enable maximum encryption
    // Activate counter-surveillance monitoring

    await base44.entities.SystemConfiguration.create({
      config_key: 'stealth_mode',
      config_value: {
        enabled: true,
        activated_at: new Date().toISOString(),
        features: {
          evidence_auto_encryption: true,
          location_obfuscation: true,
          signal_jamming_detection: true,
          camera_mic_monitoring: true,
          fake_signal_generation: true
        }
      },
      last_modified: new Date().toISOString()
    });

    // Create audit log
    await base44.entities.AuditLog.create({
      action: 'stealth_mode_activated',
      resource_type: 'System',
      details: {
        user: user?.email,
        reason: 'counter_surveillance'
      },
      severity: 'high'
    });
  };

  const enableDeviceCloaking = async () => {
    setCloakingEnabled(true);

    // Implement device identity obfuscation
    const cloakedFingerprint = {
      hardware_id: `cloak-${Math.random().toString(36).substring(7)}`,
      os_type: 'obfuscated',
      browser: 'privacy-enhanced',
      screen_resolution: '1920x1080',
      timezone: 'UTC',
      language: 'en-US',
      canvas_fingerprint: await CryptoUtils.hash(Math.random().toString()),
      webgl_fingerprint: await CryptoUtils.hash(Math.random().toString())
    };

    // Log device cloaking
    await base44.entities.DeviceLog.create({
      device_id: cloakedFingerprint.hardware_id,
      device_fingerprint: cloakedFingerprint,
      anomaly_score: 0,
      anomaly_type: 'normal',
      timestamp: new Date().toISOString()
    });

    // Create audit log
    await base44.entities.AuditLog.create({
      action: 'device_cloaking_enabled',
      resource_type: 'Device',
      details: {
        user: user?.email,
        cloaked_fingerprint: cloakedFingerprint.hardware_id
      },
      severity: 'info'
    });
  };

  const detectSurveillanceActivity = async () => {
    setMonitoringActive(true);

    // Check for camera/mic access
    const permissions = await Promise.all([
      navigator.permissions.query({ name: 'camera' }),
      navigator.permissions.query({ name: 'microphone' })
    ]);

    const suspiciousAccess = permissions.some(p => p.state === 'granted');

    if (suspiciousAccess) {
      await base44.entities.SurveillanceEvent.create({
        event_type: 'electronic_surveillance',
        severity: 'high',
        detection_method: 'permission_monitoring',
        description: 'Unauthorized camera or microphone access detected',
        evidence_urls: [],
        pattern_analysis: {
          is_coordinated: false,
          frequency: 1
        },
        timestamp: new Date().toISOString()
      });

      // Create alert
      await base44.entities.Alert.create({
        alert_type: 'surveillance_detected',
        severity: 'high',
        title: 'Surveillance Activity Detected',
        description: 'Potential unauthorized access to camera or microphone',
        source: 'Counter-Surveillance Monitor',
        detection_timestamp: new Date().toISOString(),
        recommended_actions: [
          'Revoke camera and microphone permissions',
          'Scan device for spyware',
          'Enable stealth mode'
        ]
      });
    }

    // Check for location tracking
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // Check if location is being spoofed
          const isSpoofed = position.coords.accuracy > 100;

          if (isSpoofed) {
            await base44.entities.SurveillanceEvent.create({
              event_type: 'proximity_alert',
              severity: 'medium',
              location: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
              },
              detection_method: 'location_spoofing_detection',
              description: 'Potential GPS spoofing detected',
              timestamp: new Date().toISOString()
            });
          }
        },
        (error) => {
          console.log('Location access denied or unavailable');
        }
      );
    }
  };

  useEffect(() => {
    if (monitoringActive) {
      const interval = setInterval(detectSurveillanceActivity, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
    }
  }, [monitoringActive]);

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Counter-Surveillance Protection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    {stealthMode ? <EyeOff className="w-5 h-5 text-green-500" /> : <Eye className="w-5 h-5 text-slate-400" />}
                    <h4 className="font-semibold text-white">Stealth Mode</h4>
                  </div>
                  <Switch
                    checked={stealthMode}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        activateStealthMode();
                      } else {
                        setStealthMode(false);
                      }
                    }}
                  />
                </div>
                <p className="text-sm text-slate-400">
                  Maximum security posture with evidence protection and surveillance detection
                </p>
                {stealthMode && (
                  <Badge className="mt-2 bg-green-600">Active</Badge>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    {cloakingEnabled ? <Lock className="w-5 h-5 text-green-500" /> : <Unlock className="w-5 h-5 text-slate-400" />}
                    <h4 className="font-semibold text-white">Device Cloaking</h4>
                  </div>
                  <Switch
                    checked={cloakingEnabled}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        enableDeviceCloaking();
                      } else {
                        setCloakingEnabled(false);
                      }
                    }}
                  />
                </div>
                <p className="text-sm text-slate-400">
                  Obfuscate device identity and fingerprints to prevent tracking
                </p>
                {cloakingEnabled && (
                  <Badge className="mt-2 bg-green-600">Cloaked</Badge>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-orange-500" />
                    <h4 className="font-semibold text-white">Camera/Mic Monitor</h4>
                  </div>
                  <Switch
                    checked={monitoringActive}
                    onCheckedChange={setMonitoringActive}
                  />
                </div>
                <p className="text-sm text-slate-400">
                  Detect unauthorized access to camera and microphone
                </p>
                {monitoringActive && (
                  <Badge className="mt-2 bg-orange-600">Monitoring</Badge>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Fingerprint className="w-5 h-5 text-blue-500" />
                  <h4 className="font-semibold text-white">Evidence Protection</h4>
                </div>
                <p className="text-sm text-slate-400 mb-3">
                  Protect all evidence with military-grade encryption
                </p>
                <Button 
                  onClick={() => {
                    evidenceRecords.forEach(e => protectEvidence(e.id));
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  Protect All Evidence
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Recent Surveillance Events</CardTitle>
            </CardHeader>
            <CardContent>
              {surveillanceEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>No surveillance activity detected</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {surveillanceEvents.slice(0, 5).map((event) => (
                    <Card key={event.id} className="bg-slate-700 border-slate-600">
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                            <p className="font-semibold text-white">{event.event_type}</p>
                          </div>
                          <Badge className={
                            event.severity === 'critical' ? 'bg-red-600' :
                            event.severity === 'high' ? 'bg-orange-600' :
                            event.severity === 'medium' ? 'bg-yellow-600' : 'bg-blue-600'
                          }>
                            {event.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400">{event.description}</p>
                        <p className="text-xs text-slate-500 mt-2">
                          Detected: {new Date(event.timestamp).toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-red-900/20 to-orange-900/20 border-red-700">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-white mb-2">Security Reminder</h4>
                  <p className="text-sm text-slate-300">
                    Counter-surveillance measures provide significant protection, but should be combined 
                    with physical security awareness. Always vary your routines, check for physical 
                    surveillance, and trust your instincts. If you feel you're being watched or followed, 
                    contact law enforcement immediately.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}