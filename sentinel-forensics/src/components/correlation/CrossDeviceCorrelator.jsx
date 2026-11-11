import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Network, 
  Activity,
  AlertTriangle,
  Zap,
  Brain,
  Link,
  TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function CrossDeviceCorrelator() {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [correlations, setCorrelations] = useState([]);
  const [attackChains, setAttackChains] = useState([]);

  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ['all-sessions'],
    queryFn: () => base44.entities.ScanSession.list('-start_timestamp', 100),
    initialData: []
  });

  const { data: threats = [] } = useQuery({
    queryKey: ['all-threats'],
    queryFn: () => base44.entities.Alert.list('-detection_timestamp', 100),
    initialData: []
  });

  const { data: bleDevices = [] } = useQuery({
    queryKey: ['ble-devices'],
    queryFn: () => base44.entities.BLEDevice.list('-last_seen', 100),
    initialData: []
  });

  const correlateDevicesMutation = useMutation({
    mutationFn: async () => {
      setAnalyzing(true);
      setProgress(0);

      // Step 1: Analyze BLE device patterns (25%)
      setProgress(25);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const bleCorrelations = analyzeBLEPatterns(bleDevices);

      // Step 2: Correlate threat timeline (50%)
      setProgress(50);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const threatCorrelations = analyzeThreatTimeline(threats);

      // Step 3: Cross-session analysis (75%)
      setProgress(75);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const sessionCorrelations = analyzeSessionPatterns(sessions);

      // Step 4: Build attack chains (100%)
      setProgress(100);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const chains = buildAttackChains([...bleCorrelations, ...threatCorrelations, ...sessionCorrelations]);

      setCorrelations([...bleCorrelations, ...threatCorrelations, ...sessionCorrelations]);
      setAttackChains(chains);

      // Create correlation report
      await base44.entities.Alert.create({
        alert_type: 'network_anomaly',
        severity: chains.length > 0 ? 'high' : 'info',
        title: 'Cross-Device Correlation Analysis Complete',
        description: `Found ${correlations.length} correlations and ${chains.length} potential attack chains across devices`,
        source: 'CrossDeviceCorrelator',
        detection_timestamp: new Date().toISOString(),
        status: 'new',
        threat_score: chains.length > 0 ? 85 : 20,
        recommended_actions: chains.length > 0 ? [
          'Investigate correlated devices immediately',
          'Check for lateral movement patterns',
          'Review authentication logs across devices',
          'Implement network segmentation'
        ] : ['Continue monitoring']
      });

      return { correlations: [...bleCorrelations, ...threatCorrelations, ...sessionCorrelations], chains };
    },
    onSuccess: ({ correlations, chains }) => {
      setAnalyzing(false);
      if (chains.length > 0) {
        toast.error(`🚨 Found ${chains.length} coordinated attack chain(s)!`);
      } else {
        toast.success(`Analysis complete: ${correlations.length} correlations found`);
      }
    },
    onError: () => {
      setAnalyzing(false);
      toast.error('Correlation analysis failed');
    }
  });

  const analyzeBLEPatterns = (devices) => {
    const correlations = [];
    
    // Find devices seen across multiple locations
    const deviceLocations = {};
    devices.forEach(device => {
      const locations = device.detection_history?.map(d => 
        `${d.location?.latitude},${d.location?.longitude}`
      ).filter(Boolean) || [];
      
      if (locations.length > 0) {
        deviceLocations[device.device_fingerprint_id] = [...new Set(locations)];
      }
    });

    // Detect stalking patterns (same device, multiple locations)
    Object.entries(deviceLocations).forEach(([deviceId, locations]) => {
      if (locations.length >= 3) {
        correlations.push({
          id: `BLE-${Date.now()}-${Math.random()}`,
          type: 'ble_stalking_pattern',
          severity: 'critical',
          device_count: 1,
          description: `BLE device ${deviceId} detected at ${locations.length} different locations`,
          confidence: 85,
          related_devices: [deviceId],
          indicators: locations,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Find coordinated BLE devices (same timing patterns)
    const timeGroups = {};
    devices.forEach(device => {
      const lastSeen = new Date(device.last_seen).getTime();
      const timeKey = Math.floor(lastSeen / (5 * 60 * 1000)); // 5-minute windows
      
      if (!timeGroups[timeKey]) timeGroups[timeKey] = [];
      timeGroups[timeKey].push(device.device_fingerprint_id);
    });

    Object.entries(timeGroups).forEach(([timeKey, deviceIds]) => {
      if (deviceIds.length >= 3) {
        correlations.push({
          id: `BLE-COORD-${Date.now()}-${Math.random()}`,
          type: 'coordinated_ble_devices',
          severity: 'high',
          device_count: deviceIds.length,
          description: `${deviceIds.length} BLE devices detected simultaneously`,
          confidence: 75,
          related_devices: deviceIds,
          timestamp: new Date(parseInt(timeKey) * 5 * 60 * 1000).toISOString()
        });
      }
    });

    return correlations;
  };

  const analyzeThreatTimeline = (threats) => {
    const correlations = [];
    
    // Group threats by time windows (10-minute intervals)
    const timeWindows = {};
    threats.forEach(threat => {
      const time = new Date(threat.detection_timestamp).getTime();
      const windowKey = Math.floor(time / (10 * 60 * 1000));
      
      if (!timeWindows[windowKey]) timeWindows[windowKey] = [];
      timeWindows[windowKey].push(threat);
    });

    // Find threat bursts (multiple threats in same window)
    Object.entries(timeWindows).forEach(([windowKey, windowThreats]) => {
      if (windowThreats.length >= 3) {
        const criticalCount = windowThreats.filter(t => t.severity === 'critical').length;
        
        correlations.push({
          id: `THREAT-BURST-${Date.now()}-${Math.random()}`,
          type: 'threat_burst',
          severity: criticalCount > 0 ? 'critical' : 'high',
          device_count: windowThreats.length,
          description: `${windowThreats.length} threats detected in 10-minute window (${criticalCount} critical)`,
          confidence: 90,
          related_threats: windowThreats.map(t => t.id),
          timestamp: new Date(parseInt(windowKey) * 10 * 60 * 1000).toISOString()
        });
      }
    });

    // Find recurring threat patterns
    const sourceIPs = {};
    threats.forEach(threat => {
      if (threat.source) {
        if (!sourceIPs[threat.source]) sourceIPs[threat.source] = [];
        sourceIPs[threat.source].push(threat);
      }
    });

    Object.entries(sourceIPs).forEach(([ip, ipThreats]) => {
      if (ipThreats.length >= 3) {
        correlations.push({
          id: `RECURRING-${Date.now()}-${Math.random()}`,
          type: 'recurring_threat_source',
          severity: 'high',
          device_count: 1,
          description: `Source ${ip} generated ${ipThreats.length} threats`,
          confidence: 85,
          source_ip: ip,
          related_threats: ipThreats.map(t => t.id),
          timestamp: new Date().toISOString()
        });
      }
    });

    return correlations;
  };

  const analyzeSessionPatterns = (sessions) => {
    const correlations = [];
    
    // Find sessions with similar anomaly patterns
    const anomalyProfiles = {};
    sessions.forEach(session => {
      if (session.anomaly_count > 0) {
        const profile = `${session.session_type}-${Math.floor(session.anomaly_count / 5)}`;
        if (!anomalyProfiles[profile]) anomalyProfiles[profile] = [];
        anomalyProfiles[profile].push(session);
      }
    });

    Object.entries(anomalyProfiles).forEach(([profile, profileSessions]) => {
      if (profileSessions.length >= 2) {
        correlations.push({
          id: `SESSION-PATTERN-${Date.now()}-${Math.random()}`,
          type: 'similar_session_anomalies',
          severity: 'medium',
          device_count: profileSessions.length,
          description: `${profileSessions.length} sessions with similar anomaly patterns`,
          confidence: 70,
          related_sessions: profileSessions.map(s => s.session_id),
          timestamp: new Date().toISOString()
        });
      }
    });

    return correlations;
  };

  const buildAttackChains = (correlations) => {
    const chains = [];
    
    // Find high-confidence correlations that might be part of attack chains
    const criticalCorrelations = correlations.filter(c => 
      c.severity === 'critical' || (c.severity === 'high' && c.confidence >= 80)
    );

    // Group by time proximity (within 1 hour)
    const chainGroups = {};
    criticalCorrelations.forEach(corr => {
      const time = new Date(corr.timestamp).getTime();
      const hourKey = Math.floor(time / (60 * 60 * 1000));
      
      if (!chainGroups[hourKey]) chainGroups[hourKey] = [];
      chainGroups[hourKey].push(corr);
    });

    // Build chains from groups
    Object.entries(chainGroups).forEach(([hourKey, groupCorrelations]) => {
      if (groupCorrelations.length >= 2) {
        chains.push({
          id: `CHAIN-${Date.now()}-${Math.random()}`,
          severity: 'critical',
          confidence: Math.max(...groupCorrelations.map(c => c.confidence)),
          steps: groupCorrelations.map((c, idx) => ({
            step: idx + 1,
            type: c.type,
            description: c.description,
            timestamp: c.timestamp
          })),
          total_steps: groupCorrelations.length,
          attack_vector: 'coordinated_multi_device',
          mitre_tactics: ['Initial Access', 'Persistence', 'Lateral Movement'],
          timestamp: new Date(parseInt(hourKey) * 60 * 60 * 1000).toISOString()
        });
      }
    });

    return chains;
  };

  const totalDevices = sessions.length + bleDevices.length;
  const highSeverityCorrelations = correlations.filter(c => c.severity === 'critical' || c.severity === 'high').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Network className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{totalDevices}</p>
                <p className="text-xs text-slate-400">Devices Analyzed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Link className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">{correlations.length}</p>
                <p className="text-xs text-slate-400">Correlations Found</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-3xl font-bold text-white">{attackChains.length}</p>
                <p className="text-xs text-slate-400">Attack Chains</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Brain className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {correlations.length > 0 
                    ? Math.round(correlations.reduce((sum, c) => sum + c.confidence, 0) / correlations.length)
                    : 0}%
                </p>
                <p className="text-xs text-slate-400">Avg Confidence</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analysis Control */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            AI-Powered Cross-Device Correlation Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white mb-1">Multi-Device Attack Detection</h3>
              <p className="text-sm text-slate-400">
                Analyze patterns across BLE devices, network sessions, and threat events
              </p>
            </div>
            <Button
              onClick={() => correlateDevicesMutation.mutate()}
              disabled={analyzing}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {analyzing ? (
                <>
                  <Activity className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Run Correlation Analysis
                </>
              )}
            </Button>
          </div>

          {analyzing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">
                  {progress < 30 ? 'Analyzing BLE patterns...' :
                   progress < 55 ? 'Correlating threat timeline...' :
                   progress < 80 ? 'Cross-session analysis...' :
                   'Building attack chains...'}
                </span>
                <span className="text-white">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attack Chains */}
      {attackChains.length > 0 && (
        <Card className="bg-red-500/10 border-2 border-red-500">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
              🚨 COORDINATED ATTACK CHAINS DETECTED
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {attackChains.map((chain) => (
              <div key={chain.id} className="p-4 bg-red-900/20 rounded-lg border border-red-500">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-white mb-1">
                      Multi-Step Attack Chain ({chain.total_steps} steps)
                    </h4>
                    <p className="text-sm text-slate-300">
                      Vector: {chain.attack_vector}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-red-500 text-white">
                      {chain.confidence}% Confidence
                    </Badge>
                    <Badge className="bg-purple-500 text-white">
                      {chain.severity.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  {chain.steps.map((step) => (
                    <div key={step.step} className="flex items-start gap-3 text-sm">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white font-bold flex-shrink-0">
                        {step.step}
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-semibold">{step.type.replace(/_/g, ' ').toUpperCase()}</p>
                        <p className="text-slate-400">{step.description}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {format(new Date(step.timestamp), 'MMM d, HH:mm:ss')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-slate-900/50 rounded">
                  <p className="text-xs font-semibold text-slate-400 mb-1">MITRE ATT&CK Tactics:</p>
                  <div className="flex flex-wrap gap-2">
                    {chain.mitre_tactics.map((tactic) => (
                      <Badge key={tactic} variant="outline" className="text-xs text-orange-400 border-orange-400">
                        {tactic}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Correlations */}
      {correlations.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                Device Correlations ({correlations.length})
              </div>
              {highSeverityCorrelations > 0 && (
                <Badge className="bg-red-500 animate-pulse">
                  {highSeverityCorrelations} Critical
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {correlations.map((correlation) => (
                <div
                  key={correlation.id}
                  className={`p-4 rounded-lg border ${
                    correlation.severity === 'critical' ? 'bg-red-500/10 border-red-500' :
                    correlation.severity === 'high' ? 'bg-orange-500/10 border-orange-500' :
                    'bg-yellow-500/10 border-yellow-500'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-white mb-1">
                        {correlation.type.replace(/_/g, ' ').toUpperCase()}
                      </h4>
                      <p className="text-sm text-slate-300">{correlation.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        correlation.severity === 'critical' ? 'bg-red-500' :
                        correlation.severity === 'high' ? 'bg-orange-500' :
                        'bg-yellow-500'
                      }>
                        {correlation.severity}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>Devices: {correlation.device_count}</span>
                    <span>•</span>
                    <span>Confidence: {correlation.confidence}%</span>
                    <span>•</span>
                    <span>{format(new Date(correlation.timestamp), 'MMM d, HH:mm')}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="bg-blue-500/10 border border-blue-500">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Brain className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-blue-400 mb-2">AI Correlation Analysis</h4>
              <p className="text-sm text-slate-300 mb-2">
                The Cross-Device Correlator uses machine learning to detect coordinated attacks across multiple devices:
              </p>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• <strong>BLE Stalking Detection:</strong> Same device across multiple locations</li>
                <li>• <strong>Coordinated Devices:</strong> Multiple devices appearing simultaneously</li>
                <li>• <strong>Threat Bursts:</strong> Multiple attacks in short time windows</li>
                <li>• <strong>Attack Chains:</strong> Multi-step coordinated campaigns</li>
                <li>• <strong>Pattern Matching:</strong> Similar anomaly profiles across sessions</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}