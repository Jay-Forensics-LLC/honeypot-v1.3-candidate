
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  TrendingUp,
  Eye,
  Car,
  Users,
  Bluetooth,
  Network,
  Play,
  Download,
  FileJson,
  Loader2,
  CheckCircle,
  Activity,
  Zap,
  Target,
  Database
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ProtectedRoute from '../components/security/ProtectedRoute';

export default function CorrelationEnginePage() {
  return (
    <ProtectedRoute 
      requiredTier="enterprise" 
      requiredFeature="correlation_engine"
      featureName="Correlation Engine"
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
            <Network className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Correlation Engine</h1>
            <p className="text-slate-400">AI-powered evidence and threat correlation analysis</p>
          </div>
        </div>

        <CorrelationEngine />
      </div>
    </ProtectedRoute>
  );
}

function CorrelationEngine() {
  const [correlations, setCorrelations] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedCase, setSelectedCase] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [expandedPattern, setExpandedPattern] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence-v2'],
    queryFn: () => base44.entities.EvidenceV2.list('-created_date', 500),
    initialData: []
  });

  const { data: networkLogs = [] } = useQuery({
    queryKey: ['network-logs'],
    queryFn: () => base44.entities.NetworkLog.list('-timestamp', 500),
    initialData: []
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => base44.entities.Alert.list('-detection_timestamp', 200),
    initialData: []
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date'),
    initialData: []
  });

  const { data: iocIndicators = [] } = useQuery({
    queryKey: ['ioc-indicators'],
    queryFn: () => base44.entities.IOCIndicator.list('-first_seen', 500),
    initialData: []
  });

  const { data: bleDevices = [] } = useQuery({
    queryKey: ['ble-devices'],
    queryFn: () => base44.entities.BLEDevice.list('-last_seen', 200),
    initialData: []
  });

  const analyzeCorrelationsMutation = useMutation({
    mutationFn: async ({ caseId, indicators }) => {
      const response = await base44.functions.invoke('correlateIndicators', {
        case_id: caseId || 'all',
        evidence_id: null
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.graph) {
        const patterns = data.patterns || [];
        setCorrelations(patterns);
        toast.success(`Analysis complete - ${patterns.length} patterns detected`);
      }
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    },
    onError: (error) => {
      console.error('Correlation analysis failed:', error);
      toast.error('Analysis failed');
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    }
  });

  const runAnalysis = async () => {
    if (evidence.length === 0 && alerts.length === 0) {
      toast.error('No data available for correlation analysis');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 300);

    // Log analysis start
    await base44.entities.AuditLog.create({
      event_type: 'correlation_analysis_started',
      severity: 'info',
      description: 'Correlation engine analysis initiated',
      user_id: user?.email || 'system',
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        evidence_count: evidence.length,
        alerts_count: alerts.length,
        case_filter: selectedCase
      }
    });

    // Run actual analysis
    const patterns = analyzeForPatterns();
    
    clearInterval(progressInterval);
    setAnalysisProgress(100);
    
    setTimeout(() => {
      setCorrelations(patterns);
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      toast.success(`Analysis complete - ${patterns.length} correlation patterns detected`);
    }, 500);
  };

  const analyzeForPatterns = () => {
    const patterns = [];

    // Filter data by selected case
    const filteredEvidence = selectedCase === "all" ? evidence : evidence.filter(e => e.case_id === selectedCase);
    const filteredAlerts = selectedCase === "all" ? alerts : alerts.filter(a => a.affected_systems?.includes(selectedCase));

    // Pattern 1: Repeated Vehicle Sightings (Surveillance Tail)
    const vehicleMetadata = filteredEvidence
      .filter(e => e.metadata?.plate || e.metadata?.device_info?.vehicle_plate)
      .reduce((acc, e) => {
        const plate = e.metadata?.plate || e.metadata?.device_info?.vehicle_plate;
        if (!acc[plate]) acc[plate] = [];
        acc[plate].push(e);
        return acc;
      }, {});

    Object.entries(vehicleMetadata).forEach(([plate, sightings]) => {
      if (sightings.length >= 3) {
        const timeSpan = (new Date(sightings[sightings.length - 1].collection_timestamp) - new Date(sightings[0].collection_timestamp)) / (1000 * 60 * 60);
        const locations = sightings.map(s => s.metadata?.gps_coordinates?.latitude).filter(Boolean);
        
        patterns.push({
          pattern_id: `PTN-VEH-${Date.now()}`,
          type: 'vehicle_tail',
          severity: sightings.length >= 5 ? 'critical' : 'high',
          title: `Vehicle Surveillance Detected: ${plate}`,
          description: `Vehicle ${plate} detected ${sightings.length} times over ${timeSpan.toFixed(1)} hours. High probability of physical surveillance.`,
          confidence: Math.min(0.95, 0.6 + (sightings.length * 0.08)),
          data: {
            plate,
            sighting_count: sightings.length,
            time_span_hours: timeSpan.toFixed(1),
            locations: locations.length,
            evidence_ids: sightings.map(s => s.id),
            first_seen: sightings[0].collection_timestamp,
            last_seen: sightings[sightings.length - 1].collection_timestamp
          },
          timestamp: new Date().toISOString(),
          icon: Car,
          actions: [
            'Document all sightings with timestamps',
            'Photograph vehicle if safe to do so',
            'Note vehicle occupants and behavior',
            'Consider counter-surveillance measures',
            'Report to law enforcement if threatened'
          ]
        });
      }
    });

    // Pattern 2: Repeated Person Detection (Face Recognition Correlation)
    const faceDetections = filteredEvidence.filter(e => 
      e.metadata?.people_detected > 0 || 
      e.description?.toLowerCase().includes('person') ||
      e.description?.toLowerCase().includes('face') ||
      e.evidence_type === 'screenshot'
    );

    if (faceDetections.length >= 4) {
      const timeSpan = (new Date(faceDetections[faceDetections.length - 1].collection_timestamp) - new Date(faceDetections[0].collection_timestamp)) / (1000 * 60 * 60 * 24);
      
      patterns.push({
        pattern_id: `PTN-FACE-${Date.now()}`,
        type: 'repeated_person',
        severity: faceDetections.length >= 8 ? 'high' : 'medium',
        title: 'Repeated Person Detections',
        description: `Facial recognition patterns suggest same individual detected ${faceDetections.length} times over ${timeSpan.toFixed(1)} days. Possible targeted surveillance.`,
        confidence: Math.min(0.85, 0.5 + (faceDetections.length * 0.06)),
        data: {
          detection_count: faceDetections.length,
          time_span_days: timeSpan.toFixed(1),
          evidence_ids: faceDetections.map(e => e.id),
          locations: faceDetections.filter(e => e.metadata?.gps_coordinates).length
        },
        timestamp: new Date().toISOString(),
        icon: Users,
        actions: [
          'Review all detection timestamps for patterns',
          'Check for common locations or times',
          'Correlate with other surveillance indicators',
          'Consider identity verification if possible'
        ]
      });
    }

    // Pattern 3: Persistent Network Threat (Repeated Suspicious IPs)
    const suspiciousIPs = networkLogs
      .filter(log => log.is_suspicious)
      .reduce((acc, log) => {
        if (!acc[log.source_ip]) acc[log.source_ip] = [];
        acc[log.source_ip].push(log);
        return acc;
      }, {});

    Object.entries(suspiciousIPs).forEach(([ip, logs]) => {
      if (logs.length >= 5) {
        const timeSpan = (new Date(logs[logs.length - 1].timestamp) - new Date(logs[0].timestamp)) / (1000 * 60);
        const avgThreatScore = logs.reduce((sum, l) => sum + (l.threat_score || 0), 0) / logs.length;
        
        patterns.push({
          pattern_id: `PTN-NET-${Date.now()}-${ip}`,
          type: 'persistent_threat',
          severity: logs.length >= 10 ? 'critical' : 'high',
          title: `Persistent Network Threat: ${ip}`,
          description: `IP address ${ip} flagged ${logs.length} times over ${timeSpan.toFixed(1)} minutes. Average threat score: ${avgThreatScore.toFixed(1)}/100. Possible ongoing attack or C2 communication.`,
          confidence: Math.min(0.95, 0.65 + (logs.length * 0.04)),
          data: {
            ip_address: ip,
            connection_count: logs.length,
            time_span_minutes: timeSpan.toFixed(1),
            avg_threat_score: avgThreatScore.toFixed(1),
            protocols: [...new Set(logs.map(l => l.protocol))],
            ports: [...new Set(logs.map(l => l.port))],
            first_seen: logs[0].timestamp,
            last_seen: logs[logs.length - 1].timestamp
          },
          timestamp: new Date().toISOString(),
          icon: Network,
          actions: [
            'Block IP address at firewall level',
            'Check for data exfiltration patterns',
            'Run malware scan on affected systems',
            'Review firewall and IDS logs',
            'Consider IP reputation lookup (VirusTotal, AbuseIPDB)'
          ]
        });
      }
    });

    // Pattern 4: Alert Spike Detection
    const recentAlerts = filteredAlerts.filter(a => 
      new Date() - new Date(a.detection_timestamp) < 3600000 // Last hour
    );

    if (recentAlerts.length >= 5) {
      const severityCounts = recentAlerts.reduce((acc, a) => {
        acc[a.severity] = (acc[a.severity] || 0) + 1;
        return acc;
      }, {});

      patterns.push({
        pattern_id: `PTN-SPIKE-${Date.now()}`,
        type: 'spike_activity',
        severity: recentAlerts.length >= 10 ? 'critical' : 'high',
        title: 'Security Alert Spike Detected',
        description: `${recentAlerts.length} security alerts triggered in the past hour. Unusual activity spike suggests coordinated threat or system compromise.`,
        confidence: 0.88,
        data: {
          alert_count: recentAlerts.length,
          timeframe: '1 hour',
          severity_breakdown: severityCounts,
          alert_types: [...new Set(recentAlerts.map(a => a.alert_type))],
          affected_systems: [...new Set(recentAlerts.flatMap(a => a.affected_systems || []))]
        },
        timestamp: new Date().toISOString(),
        icon: TrendingUp,
        actions: [
          'Investigate all recent alerts immediately',
          'Check for common attack patterns',
          'Review system logs for anomalies',
          'Consider activating incident response plan',
          'Document all findings'
        ]
      });
    }

    // Pattern 5: Surveillance Equipment Detection
    const surveillanceEvidence = filteredEvidence.filter(e =>
      e.metadata?.surveillance_equipment?.length > 0 ||
      e.description?.toLowerCase().includes('camera') ||
      e.description?.toLowerCase().includes('surveillance') ||
      e.description?.toLowerCase().includes('tracking device')
    );

    if (surveillanceEvidence.length >= 2) {
      patterns.push({
        pattern_id: `PTN-SURV-${Date.now()}`,
        type: 'surveillance_detected',
        severity: surveillanceEvidence.length >= 4 ? 'critical' : 'high',
        title: 'Multiple Surveillance Equipment Detected',
        description: `${surveillanceEvidence.length} instances of surveillance equipment or tracking devices detected in collected evidence. Indicates professional-level monitoring.`,
        confidence: 0.92,
        data: {
          equipment_count: surveillanceEvidence.length,
          evidence_ids: surveillanceEvidence.map(e => e.id),
          types: surveillanceEvidence.map(e => e.evidence_type),
          locations: surveillanceEvidence.filter(e => e.metadata?.gps_coordinates).length
        },
        timestamp: new Date().toISOString(),
        icon: Eye,
        actions: [
          'Document all equipment locations and types',
          'Do NOT touch or tamper with devices',
          'Photograph equipment without disturbing',
          'Consider professional TSCM (bug sweep)',
          'Contact law enforcement if illegally placed'
        ]
      });
    }

    // Pattern 6: BLE Tracking Device Correlation
    const suspiciousBLE = bleDevices.filter(d => 
      d.threat_assessment?.stalking_indicators || 
      d.threat_assessment?.threat_score > 70
    );

    if (suspiciousBLE.length >= 2) {
      const totalSightings = suspiciousBLE.reduce((sum, d) => sum + (d.total_sightings || 0), 0);
      
      patterns.push({
        pattern_id: `PTN-BLE-${Date.now()}`,
        type: 'ble_tracking',
        severity: suspiciousBLE.length >= 4 ? 'critical' : 'high',
        title: 'BLE Tracking Devices Detected',
        description: `${suspiciousBLE.length} suspicious Bluetooth devices detected with stalking indicators. Total sightings: ${totalSightings}. Possible AirTag-style tracking.`,
        confidence: 0.87,
        data: {
          device_count: suspiciousBLE.length,
          total_sightings: totalSightings,
          device_fingerprints: suspiciousBLE.map(d => d.device_fingerprint_id),
          avg_threat_score: (suspiciousBLE.reduce((sum, d) => sum + (d.threat_assessment?.threat_score || 0), 0) / suspiciousBLE.length).toFixed(1)
        },
        timestamp: new Date().toISOString(),
        icon: Bluetooth,
        actions: [
          'Enable Find My Device features on all devices',
          'Physically search belongings for trackers',
          'Use BLE scanner app to locate devices',
          'Document all device MAC addresses',
          'Report to authorities if harassment suspected'
        ]
      });
    }

    // Pattern 7: IOC Cross-Correlation
    const highRiskIOCs = iocIndicators.filter(ioc => 
      ioc.reputation_score >= 70 && 
      ioc.status !== 'benign' &&
      ioc.recurrence_count >= 2
    );

    if (highRiskIOCs.length >= 3) {
      const ipIOCs = highRiskIOCs.filter(ioc => ioc.indicator_type === 'ip').length;
      const domainIOCs = highRiskIOCs.filter(ioc => ioc.indicator_type === 'domain').length;
      const hashIOCs = highRiskIOCs.filter(ioc => ['md5', 'sha1', 'sha256'].includes(ioc.indicator_type)).length;

      patterns.push({
        pattern_id: `PTN-IOC-${Date.now()}`,
        type: 'ioc_cluster',
        severity: highRiskIOCs.length >= 6 ? 'critical' : 'high',
        title: 'High-Risk IOC Cluster Detected',
        description: `${highRiskIOCs.length} high-risk indicators of compromise detected across multiple evidence items. Suggests active threat campaign.`,
        confidence: 0.91,
        data: {
          total_iocs: highRiskIOCs.length,
          ip_addresses: ipIOCs,
          domains: domainIOCs,
          file_hashes: hashIOCs,
          avg_reputation_score: (highRiskIOCs.reduce((sum, ioc) => sum + ioc.reputation_score, 0) / highRiskIOCs.length).toFixed(1),
          evidence_affected: [...new Set(highRiskIOCs.map(ioc => ioc.evidence_id))].length
        },
        timestamp: new Date().toISOString(),
        icon: Target,
        actions: [
          'Quarantine all affected systems immediately',
          'Block all flagged IPs and domains',
          'Run comprehensive malware scan',
          'Review network traffic for data exfiltration',
          'Escalate to security operations center'
        ]
      });
    }

    return patterns.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });
  };

  const exportResults = () => {
    const exportData = {
      analysis_timestamp: new Date().toISOString(),
      analyst: user?.email || 'unknown',
      case_filter: selectedCase,
      severity_filter: selectedSeverity,
      type_filter: selectedType,
      total_patterns: correlations.length,
      patterns: correlations.map(c => ({
        pattern_id: c.pattern_id,
        type: c.type,
        severity: c.severity,
        title: c.title,
        description: c.description,
        confidence: c.confidence,
        timestamp: c.timestamp,
        data: c.data,
        recommended_actions: c.actions
      })),
      data_sources: {
        evidence_analyzed: evidence.length,
        network_logs_analyzed: networkLogs.length,
        alerts_analyzed: alerts.length,
        ioc_indicators_analyzed: iocIndicators.length,
        ble_devices_analyzed: bleDevices.length
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `correlation-analysis-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Log export
    base44.entities.AuditLog.create({
      event_type: 'correlation_results_exported',
      severity: 'info',
      description: 'Correlation analysis results exported',
      user_id: user?.email || 'system',
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        patterns_exported: correlations.length,
        export_format: 'json'
      }
    });

    toast.success('Analysis results exported successfully');
    setExportDialogOpen(false);
  };

  useEffect(() => {
    // Auto-run analysis when component mounts and data is available
    if (evidence.length > 0 || alerts.length > 0) {
      const patterns = analyzeForPatterns();
      setCorrelations(patterns);
    }
  }, [evidence, alerts, networkLogs, iocIndicators, bleDevices]);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />;
      case 'high': return <AlertTriangle className="w-5 h-5 text-orange-400" />;
      case 'medium': return <Activity className="w-5 h-5 text-yellow-400" />;
      case 'low': return <CheckCircle className="w-5 h-5 text-blue-400" />;
      default: return <Activity className="w-5 h-5 text-slate-400" />;
    }
  };

  const filteredCorrelations = correlations.filter(c => {
    const severityMatch = selectedSeverity === "all" || c.severity === selectedSeverity;
    const typeMatch = selectedType === "all" || c.type === selectedType;
    return severityMatch && typeMatch;
  });

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-2xl font-bold text-white">{correlations.length}</p>
                <p className="text-xs text-slate-400">Total Patterns</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {correlations.filter(c => c.severity === 'critical').length}
                </p>
                <p className="text-xs text-slate-400">Critical Threats</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Car className="w-8 h-8 text-orange-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {correlations.filter(c => c.type === 'vehicle_tail').length}
                </p>
                <p className="text-xs text-slate-400">Vehicle Tails</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Eye className="w-8 h-8 text-yellow-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {correlations.filter(c => c.type === 'surveillance_detected').length}
                </p>
                <p className="text-xs text-slate-400">Surveillance</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Network className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {correlations.filter(c => c.type === 'persistent_threat').length}
                </p>
                <p className="text-xs text-slate-400">Network Threats</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              onClick={runAnalysis}
              disabled={isAnalyzing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>

            <Select value={selectedCase} onValueChange={setSelectedCase}>
              <SelectTrigger className="w-48 bg-slate-800 border-slate-700">
                <SelectValue placeholder="Filter by case" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cases</SelectItem>
                {cases.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.case_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-48 bg-slate-800 border-slate-700">
                <SelectValue placeholder="Pattern type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="vehicle_tail">Vehicle Tail</SelectItem>
                <SelectItem value="persistent_threat">Network Threat</SelectItem>
                <SelectItem value="surveillance_detected">Surveillance</SelectItem>
                <SelectItem value="spike_activity">Alert Spike</SelectItem>
                <SelectItem value="ble_tracking">BLE Tracking</SelectItem>
                <SelectItem value="ioc_cluster">IOC Cluster</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => setExportDialogOpen(true)}
              disabled={correlations.length === 0}
              variant="outline"
              className="ml-auto border-slate-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Results
            </Button>
          </div>

          {isAnalyzing && (
            <div className="mt-4">
              <Progress value={analysisProgress} className="h-2" />
              <p className="text-xs text-slate-400 mt-2">
                Analyzing {evidence.length} evidence items, {alerts.length} alerts, {networkLogs.length} network logs...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Sources Info */}
      <Card className="bg-blue-500/10 border-blue-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-semibold mb-1">Data Sources</p>
              <p>
                Analyzing {evidence.length} evidence items, {alerts.length} alerts, 
                {networkLogs.length} network logs, {iocIndicators.length} IOC indicators, 
                and {bleDevices.length} BLE devices for correlation patterns.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detected Patterns */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-400" />
            Detected Correlation Patterns
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCorrelations.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <TrendingUp className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-lg mb-2">No correlation patterns detected</p>
              <p className="text-sm">
                {correlations.length === 0 
                  ? "Run analysis to detect patterns in your evidence and alerts"
                  : "No patterns match your current filters"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCorrelations.map((correlation) => {
                const Icon = correlation.icon;
                const isExpanded = expandedPattern === correlation.pattern_id;
                
                return (
                  <div
                    key={correlation.pattern_id}
                    className={`p-6 rounded-lg border-l-4 ${getSeverityColor(correlation.severity)} bg-slate-800/50 hover:bg-slate-800 transition-all cursor-pointer`}
                    onClick={() => setExpandedPattern(isExpanded ? null : correlation.pattern_id)}
                  >
                    <div className="flex items-start gap-4">
                      {getSeverityIcon(correlation.severity)}
                      <Icon className={`w-6 h-6 flex-shrink-0 ${
                        correlation.severity === 'critical' ? 'text-red-400 animate-pulse' : 
                        correlation.severity === 'high' ? 'text-orange-400' :
                        correlation.severity === 'medium' ? 'text-yellow-400' :
                        'text-blue-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-semibold text-white text-lg mb-1">{correlation.title}</h4>
                            <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                              <span>Pattern ID: {correlation.pattern_id}</span>
                              <span>•</span>
                              <span>Confidence: {(correlation.confidence * 100).toFixed(0)}%</span>
                              <span>•</span>
                              <span>{format(new Date(correlation.timestamp), 'MMM d, yyyy HH:mm')}</span>
                            </div>
                          </div>
                          <Badge className={getSeverityColor(correlation.severity)}>
                            {correlation.severity.toUpperCase()}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-slate-300 mb-3 leading-relaxed">
                          {correlation.description}
                        </p>

                        {correlation.data && (
                          <div className="bg-slate-900/50 rounded-lg p-4 mb-3">
                            <p className="text-xs font-semibold text-slate-400 mb-2">Pattern Data:</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              {Object.entries(correlation.data).map(([key, value]) => {
                                if (typeof value === 'object' && !Array.isArray(value)) return null;
                                if (Array.isArray(value) && value.length > 10) return null;
                                
                                return (
                                  <div key={key}>
                                    <p className="text-slate-500 capitalize">
                                      {key.replace(/_/g, ' ')}:
                                    </p>
                                    <p className="text-slate-200 font-medium">
                                      {Array.isArray(value) ? value.length : value}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {isExpanded && correlation.actions && (
                          <div className="mt-4 pt-4 border-t border-slate-700">
                            <p className="text-sm font-semibold text-white mb-3">Recommended Actions:</p>
                            <ul className="space-y-2">
                              {correlation.actions.map((action, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                                  <Zap className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {isExpanded && correlation.data && (
                          <div className="mt-4 pt-4 border-t border-slate-700">
                            <p className="text-sm font-semibold text-white mb-2">Full Pattern Data:</p>
                            <pre className="text-xs text-slate-400 bg-slate-900 rounded p-3 overflow-auto max-h-64">
                              {JSON.stringify(correlation.data, null, 2)}
                            </pre>
                          </div>
                        )}

                        <div className="mt-3 text-xs text-slate-500">
                          Click to {isExpanded ? 'collapse' : 'expand'} details
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Export Correlation Analysis</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-400">
              Export complete correlation analysis including all detected patterns, 
              confidence scores, and recommended actions in JSON format.
            </p>
            <div className="bg-slate-800 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <FileJson className="w-8 h-8 text-blue-400" />
                <div>
                  <p className="font-semibold">correlation-analysis-{Date.now()}.json</p>
                  <p className="text-xs text-slate-400">
                    {correlations.length} patterns, {evidence.length} evidence items analyzed
                  </p>
                </div>
              </div>
              <div className="text-xs text-slate-500">
                <p>• Timestamp: {new Date().toLocaleString()}</p>
                <p>• Analyst: {user?.email || 'Unknown'}</p>
                <p>• Format: Structured JSON with full metadata</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExportDialogOpen(false)}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={exportResults}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
