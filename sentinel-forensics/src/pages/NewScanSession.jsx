import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Radio, 
  Wifi, 
  Network,
  MapPin,
  ArrowLeft,
  Play,
  Activity
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { 
  collectBLE, 
  collectWiFi, 
  collectNetwork,
  getPermissionsSnapshot,
  getInterfacesSnapshot,
  calculateRiskScore,
  validateObservation
} from "../components/lib/TelemetryCollector";

export default function NewScanSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [sessionData, setSessionData] = useState({
    session_type: 'comprehensive',
    location_tag: '',
    notes: '',
    gps_coordinates: null
  });
  
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStage, setScanStage] = useState('');

  const performRealScan = async (sessionDatabaseId, sessionHumanId, scanType) => {
    let observationCount = 0;
    let anomalyCount = 0;
    let telemetryErrorCount = 0;
    const allObservations = [];
    const allErrors = [];

    setScanStage('Initializing scan...');
    setScanProgress(10);
    
    // Get system state
    const permissions = await getPermissionsSnapshot();
    const interfaces = await getInterfacesSnapshot();
    
    // Store permissions and interface state with session
    await base44.entities.ScanSession.update(sessionDatabaseId, {
      device_info: {
        device_id: 'SENTINEL-WEB',
        platform: navigator.platform,
        user_agent: navigator.userAgent,
        permissions_snapshot: permissions,
        interfaces_snapshot: interfaces
      }
    });

    // BLE Collection
    if (scanType === 'ble' || scanType === 'comprehensive') {
      setScanStage('Scanning for Bluetooth devices (requires permission)...');
      setScanProgress(25);
      
      const { observations: bleObs, errors: bleErrors } = await collectBLE();
      
      // Store observations
      for (const obs of bleObs) {
        const validation = validateObservation(obs);
        if (validation.valid) {
          await base44.entities.Observation.create({
            session_id: sessionDatabaseId,
            ...obs
          });
          observationCount++;
          if (obs.anomaly_score >= 70) anomalyCount++;
          allObservations.push(obs);
        }
      }
      
      // Store errors
      for (const err of bleErrors) {
        await base44.entities.AuditLog.create({
          event_type: 'telemetry_collection_error',
          severity: 'warning',
          description: err.user_message,
          metadata: err.diagnostics,
          timestamp: err.timestamp,
          success: false
        });
        telemetryErrorCount++;
        allErrors.push(err);
      }
    }

    // WiFi Collection
    if (scanType === 'wifi' || scanType === 'comprehensive') {
      setScanStage('Scanning WiFi networks...');
      setScanProgress(50);
      
      const { observations: wifiObs, errors: wifiErrors } = await collectWiFi();
      
      // WiFi will always return errors on web platform
      for (const err of wifiErrors) {
        await base44.entities.AuditLog.create({
          event_type: 'telemetry_collection_error',
          severity: 'info',
          description: err.user_message,
          metadata: err.diagnostics,
          timestamp: err.timestamp,
          success: false
        });
        telemetryErrorCount++;
        allErrors.push(err);
      }
    }

    // Network Collection
    if (scanType === 'network' || scanType === 'comprehensive') {
      setScanStage('Analyzing network traffic...');
      setScanProgress(75);
      
      const { observations: netObs, errors: netErrors } = await collectNetwork();
      
      // Network will always return errors on web platform
      for (const err of netErrors) {
        await base44.entities.AuditLog.create({
          event_type: 'telemetry_collection_error',
          severity: 'info',
          description: err.user_message,
          metadata: err.diagnostics,
          timestamp: err.timestamp,
          success: false
        });
        telemetryErrorCount++;
        allErrors.push(err);
      }
    }

    setScanProgress(100);
    return { 
      observationCount, 
      anomalyCount, 
      telemetryErrorCount,
      allObservations,
      allErrors
    };
  };

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionData.location_tag) {
        throw new Error('Location tag is required');
      }

      setIsScanning(true);
      const sessionHumanId = `SCAN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const user = await base44.auth.me();
      
      const session = {
        session_id: sessionHumanId,
        session_type: sessionData.session_type,
        location_tag: sessionData.location_tag,
        gps_coordinates: sessionData.gps_coordinates,
        start_timestamp: new Date().toISOString(),
        status: 'active',
        observation_count: 0,
        anomaly_count: 0,
        notes: sessionData.notes,
        risk_score: 0,
        merkle_root: `MERKLE-${Date.now()}`,
        session_hash: `HASH-${Date.now()}`,
        device_info: {
          device_id: 'SENTINEL-WEB',
          platform: navigator.platform,
          user_agent: navigator.userAgent
        },
        chain_of_custody: [{
          timestamp: new Date().toISOString(),
          action: 'Session created',
          user_id: user?.email || 'unknown',
          integrity_hash: `HASH-${Date.now()}`
        }],
        exported: false,
        tags: [sessionData.session_type]
      };

      const createdSession = await base44.entities.ScanSession.create(session);

      const { 
        observationCount, 
        anomalyCount, 
        telemetryErrorCount,
        allObservations,
        allErrors
      } = await performRealScan(
        createdSession.id,
        sessionHumanId,
        sessionData.session_type
      );

      // Calculate validated risk score
      const riskCalc = calculateRiskScore(allObservations, allErrors);

      await base44.entities.ScanSession.update(createdSession.id, {
        end_timestamp: new Date().toISOString(),
        duration_seconds: Math.floor((Date.now() - new Date(session.start_timestamp).getTime()) / 1000),
        status: 'completed',
        observation_count: observationCount,
        anomaly_count: anomalyCount,
        risk_score: riskCalc.score,
        notes: session.notes + `\n\n[AUTO] Risk Score Calculation: ${riskCalc.reasoning} (Confidence: ${riskCalc.confidence}%)`
      });

      return { 
        sessionId: createdSession.id, 
        observationCount, 
        anomalyCount, 
        telemetryErrorCount,
        riskScore: riskCalc.score 
      };
    },
    onSuccess: (result) => {
      setIsScanning(false);
      queryClient.invalidateQueries({ queryKey: ['scan-sessions'] });
      
      if (result.observationCount === 0 && result.telemetryErrorCount > 0) {
        toast.warning(`Scan completed with errors. ${result.telemetryErrorCount} collection failures. No observations collected.`, {
          description: 'Web browsers have limited scanning capabilities. For full forensics, install Sentinel Agent.'
        });
      } else if (result.observationCount > 0) {
        toast.success(`Scan complete! ${result.observationCount} observations, ${result.anomalyCount} anomalies`, {
          description: result.telemetryErrorCount > 0 ? `${result.telemetryErrorCount} collection errors logged` : undefined
        });
      } else {
        toast.info('Scan completed with no data collected', {
          description: 'Enable permissions or use native agent for better results'
        });
      }
      
      navigate(createPageUrl(`SessionDetail?id=${result.sessionId}`));
    },
    onError: (error) => {
      setIsScanning(false);
      setScanProgress(0);
      toast.error(error.message || 'Failed to create scan session');
    }
  });

  const getLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSessionData({
          ...sessionData,
          gps_coordinates: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          }
        });
        setIsGettingLocation(false);
        toast.success('Location captured');
      },
      (error) => {
        setIsGettingLocation(false);
        toast.error('Failed to get location');
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link to={createPageUrl("Sessions")}>
          <Button variant="outline" size="icon" className="border-slate-700">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white">New Scan Session</h1>
          <p className="text-slate-400">Configure and start a forensic scan</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card 
          className={`cursor-pointer transition-all ${
            sessionData.session_type === 'ble' 
              ? 'bg-blue-500/20 border-blue-500 border-2' 
              : 'bg-slate-900/50 border-slate-800'
          }`}
          onClick={() => setSessionData({...sessionData, session_type: 'ble'})}
        >
          <CardContent className="p-6 text-center">
            <Radio className="w-12 h-12 mx-auto mb-3 text-blue-400" />
            <h3 className="font-semibold text-white">BLE Scan</h3>
            <p className="text-xs text-slate-400">Bluetooth devices</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${
            sessionData.session_type === 'wifi' 
              ? 'bg-purple-500/20 border-purple-500 border-2' 
              : 'bg-slate-900/50 border-slate-800'
          }`}
          onClick={() => setSessionData({...sessionData, session_type: 'wifi'})}
        >
          <CardContent className="p-6 text-center">
            <Wifi className="w-12 h-12 mx-auto mb-3 text-purple-400" />
            <h3 className="font-semibold text-white">WiFi Scan</h3>
            <p className="text-xs text-slate-400">Access points</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${
            sessionData.session_type === 'network' 
              ? 'bg-green-500/20 border-green-500 border-2' 
              : 'bg-slate-900/50 border-slate-800'
          }`}
          onClick={() => setSessionData({...sessionData, session_type: 'network'})}
        >
          <CardContent className="p-6 text-center">
            <Network className="w-12 h-12 mx-auto mb-3 text-green-400" />
            <h3 className="font-semibold text-white">Network Scan</h3>
            <p className="text-xs text-slate-400">Traffic analysis</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${
            sessionData.session_type === 'comprehensive' 
              ? 'bg-red-500/20 border-red-500 border-2' 
              : 'bg-slate-900/50 border-slate-800'
          }`}
          onClick={() => setSessionData({...sessionData, session_type: 'comprehensive'})}
        >
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 mx-auto mb-3 text-red-400" />
            <h3 className="font-semibold text-white">Comprehensive</h3>
            <p className="text-xs text-slate-400">All types</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Session Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="text-slate-300">Location Name *</Label>
            <Input
              value={sessionData.location_tag}
              onChange={(e) => setSessionData({...sessionData, location_tag: e.target.value})}
              placeholder="e.g., Office Building A"
              className="bg-slate-800 border-slate-700 text-white"
              disabled={isScanning}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">GPS Coordinates</Label>
            <div className="flex gap-2">
              <Input
                value={
                  sessionData.gps_coordinates 
                    ? `${sessionData.gps_coordinates.latitude.toFixed(6)}, ${sessionData.gps_coordinates.longitude.toFixed(6)}`
                    : ''
                }
                placeholder="No location captured"
                className="bg-slate-800 border-slate-700 text-white"
                readOnly
              />
              <Button
                onClick={getLocation}
                disabled={isGettingLocation || isScanning}
                variant="outline"
                className="border-slate-700"
              >
                <MapPin className="w-4 h-4 mr-2" />
                {isGettingLocation ? 'Getting...' : 'Get Location'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Notes</Label>
            <Textarea
              value={sessionData.notes}
              onChange={(e) => setSessionData({...sessionData, notes: e.target.value})}
              placeholder="Add notes..."
              className="bg-slate-800 border-slate-700 text-white h-24"
              disabled={isScanning}
            />
          </div>

          {isScanning && (
            <div className="space-y-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400 animate-spin" />
                  <span className="text-white font-semibold">{scanStage}</span>
                </div>
                <Badge className="bg-blue-500">{scanProgress}%</Badge>
              </div>
              <Progress value={scanProgress} className="h-2" />
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => createSessionMutation.mutate()}
              disabled={!sessionData.location_tag || isScanning}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 flex-1"
            >
              {isScanning ? (
                <>
                  <Activity className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Scan
                </>
              )}
            </Button>
            <Link to={createPageUrl("Sessions")}>
              <Button variant="outline" className="border-slate-700" disabled={isScanning}>
                Cancel
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}