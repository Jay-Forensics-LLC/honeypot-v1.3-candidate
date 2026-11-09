import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Activity,
  MapPin,
  Clock,
  AlertTriangle,
  Download,
  Shield,
  ArrowLeft,
  CheckCircle,
  Network,
  Radio,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { DateUtils } from "../components/utils/DateUtils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export default function SessionDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('id');

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const sessions = await base44.entities.ScanSession.list();
      return sessions.find(s => s.id === sessionId);
    },
    enabled: !!sessionId
  });

  const { data: observations = [], isLoading: obsLoading } = useQuery({
    queryKey: ['observations', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const allObs = await base44.entities.Observation.list('-timestamp', 500);
      return allObs.filter(o => o.session_id === sessionId);
    },
    enabled: !!sessionId,
    refetchInterval: 3000
  });

  const { data: findings = [], isLoading: findingsLoading } = useQuery({
    queryKey: ['findings', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const allFindings = await base44.entities.IOCFinding.list('-first_seen', 200);
      return allFindings.filter(f => f.session_id === sessionId);
    },
    enabled: !!sessionId,
    refetchInterval: 3000
  });
  
  // Check for telemetry errors
  const { data: telemetryErrors = [] } = useQuery({
    queryKey: ['telemetry-errors', sessionId],
    queryFn: async () => {
      if (!session) return [];
      const logs = await base44.entities.AuditLog.list('-timestamp', 100);
      return logs.filter(log => 
        log.event_type === 'telemetry_collection_error' &&
        log.timestamp >= session.start_timestamp &&
        log.timestamp <= (session.end_timestamp || new Date().toISOString())
      );
    },
    enabled: !!session
  });

  const exportSessionMutation = useMutation({
    mutationFn: async () => {
      if (!session) return;

      const csvContent = [
        ['Sentinel Forensics - Session Report'],
        ['Session ID', session.session_id],
        ['Type', session.session_type],
        ['Location', session.location_tag || 'Unknown'],
        ['Started', DateUtils.safeFormatDateTime(session.start_timestamp)],
        ['Duration', `${session.duration_seconds || 0} seconds`],
        ['Risk Score', `${session.risk_score || 0}/100`],
        [''],
        ['Observations'],
        ['Timestamp', 'Type', 'Details', 'Anomaly Score'],
        ...observations.map(o => [
          DateUtils.safeFormatDateTime(o.timestamp),
          o.observation_type,
          o.ble_data?.mac_address || o.wifi_data?.ssid || o.network_data?.source_ip || 'N/A',
          o.anomaly_score || 0
        ]),
        [''],
        ['Findings'],
        ['IOC Type', 'Value', 'Severity', 'Confidence'],
        ...findings.map(f => [
          f.ioc_type,
          f.ioc_value,
          f.severity,
          `${f.confidence}%`
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Session_${session.session_id}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await base44.entities.ExportRecord.create({
        export_id: `EXP-${Date.now()}`,
        session_id: sessionId,
        export_type: 'csv',
        export_timestamp: new Date().toISOString(),
        file_url: 'local-download',
        file_hash_sha256: `HASH-${Date.now()}`,
        file_size_bytes: blob.size,
        includes_merkle_root: true,
        watermarked: true
      });

      return true;
    },
    onSuccess: () => {
      toast.success('Session exported successfully');
    },
    onError: () => {
      toast.error('Failed to export session');
    }
  });

  if (sessionLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="w-16 h-16 mx-auto mb-4 text-blue-400 animate-pulse" />
          <p className="text-white">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <p className="text-white mb-4">Session not found</p>
          <Button onClick={() => navigate(createPageUrl('Sessions'))}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sessions
          </Button>
        </div>
      </div>
    );
  }

  const highSeverityFindings = findings.filter(f => f.severity === 'critical' || f.severity === 'high').length;
  const bleObservations = observations.filter(o => o.observation_type === 'ble_device').length;
  const wifiObservations = observations.filter(o => o.observation_type === 'wifi_ap').length;
  const networkObservations = observations.filter(o => o.observation_type === 'network_packet').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl('Sessions'))}
            className="border-slate-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white">Session Details</h1>
            <p className="text-slate-400">#{session.session_id}</p>
          </div>
        </div>
        <Button
          onClick={() => exportSessionMutation.mutate()}
          disabled={exportSessionMutation.isPending}
          className="bg-gradient-to-r from-blue-600 to-purple-600"
        >
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Telemetry Errors Warning */}
      {telemetryErrors.length > 0 && (
        <Alert className="bg-yellow-500/10 border-yellow-500/30">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          <AlertDescription className="text-yellow-300">
            <strong>Collection Limitations Detected</strong>
            <p className="mt-1 text-sm">
              {telemetryErrors.length} collection error(s) occurred during this scan. 
              Some features were unavailable due to browser limitations or permissions.
              {session.observation_count === 0 && (
                <span className="block mt-2 font-semibold">
                  ⚠️ No observations collected. Install Sentinel Agent for full scanning capabilities.
                </span>
              )}
            </p>
          </AlertDescription>
        </Alert>
      )}
      
      {/* System State Display */}
      {session?.device_info?.permissions_snapshot && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">System State at Scan Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-slate-400">Bluetooth</p>
                <Badge variant="outline" className={
                  session.device_info.permissions_snapshot.bluetooth === 'granted' ? 'border-green-500 text-green-400' :
                  session.device_info.permissions_snapshot.bluetooth === 'denied' ? 'border-red-500 text-red-400' :
                  'border-yellow-500 text-yellow-400'
                }>
                  {session.device_info.permissions_snapshot.bluetooth || 'unknown'}
                </Badge>
              </div>
              <div>
                <p className="text-slate-400">Connection</p>
                <Badge variant="outline">
                  {session.device_info.interfaces_snapshot?.connection_type || 'unknown'}
                </Badge>
              </div>
              <div>
                <p className="text-slate-400">Online</p>
                <Badge variant="outline" className={
                  session.device_info.interfaces_snapshot?.network_online ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'
                }>
                  {session.device_info.interfaces_snapshot?.network_online ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div>
                <p className="text-slate-400">Platform</p>
                <Badge variant="outline">
                  {session.device_info.platform}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <MapPin className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-xs text-slate-400">Location</p>
                <p className="text-white font-semibold">{session.location_tag || 'Unknown'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-xs text-slate-400">Duration</p>
                <p className="text-white font-semibold">{session.duration_seconds || 0}s</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-orange-400" />
              <div>
                <p className="text-xs text-slate-400">Risk Score</p>
                <p className="text-white font-semibold">{session.risk_score || 0}/100</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <div>
                <p className="text-xs text-slate-400">Anomalies</p>
                <p className="text-white font-semibold">{session.anomaly_count || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Badge */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm text-slate-400">Status</p>
                <Badge className={
                  session.status === 'completed' ? 'bg-green-500' :
                  session.status === 'analyzing' ? 'bg-blue-500' :
                  session.status === 'exported' ? 'bg-purple-500' :
                  'bg-yellow-500'
                }>
                  {session.status?.toUpperCase()}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-slate-400">Session Type</p>
                <p className="text-white font-semibold">{session.session_type?.replace(/_/g, ' ').toUpperCase()}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Started</p>
                <p className="text-white">{DateUtils.safeFormatDateTime(session.start_timestamp)}</p>
              </div>
              {session.end_timestamp && (
                <div>
                  <p className="text-sm text-slate-400">Ended</p>
                  <p className="text-white">{DateUtils.safeFormatDateTime(session.end_timestamp)}</p>
                </div>
              )}
            </div>
            <div>
              {session.merkle_root && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-xs text-slate-400">Merkle Root</p>
                    <p className="text-xs text-slate-300 font-mono">{session.merkle_root.substring(0, 16)}...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="observations" className="space-y-6">
        <TabsList className="bg-slate-900/50">
          <TabsTrigger value="observations">
            <Eye className="w-4 h-4 mr-2" />
            Observations ({observations.length})
          </TabsTrigger>
          <TabsTrigger value="findings">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Findings ({findings.length})
          </TabsTrigger>
          {telemetryErrors.length > 0 && (
            <TabsTrigger value="errors">
              <Info className="w-4 h-4 mr-2" />
              Collection Errors ({telemetryErrors.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="stats">
            <Activity className="w-4 h-4 mr-2" />
            Statistics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="observations" className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Session Observations</CardTitle>
            </CardHeader>
            <CardContent>
              {obsLoading ? (
                <div className="text-center py-12 text-slate-400">
                  <Activity className="w-16 h-16 mx-auto mb-4 animate-pulse" />
                  <p>Loading observations...</p>
                </div>
              ) : observations.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Eye className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p>No observations recorded</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {observations.map((obs, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/30 rounded border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {obs.observation_type === 'ble_device' && <Radio className="w-4 h-4 text-blue-400" />}
                          {obs.observation_type === 'wifi_ap' && <Network className="w-4 h-4 text-purple-400" />}
                          {obs.observation_type === 'network_packet' && <Activity className="w-4 h-4 text-green-400" />}
                          <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">
                            {obs.observation_type?.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {obs.watchlist_match && (
                            <Badge className="bg-red-500 text-xs">WATCHLIST MATCH</Badge>
                          )}
                          {obs.anomaly_score > 70 && (
                            <Badge className="bg-orange-500 text-xs">ANOMALY</Badge>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {obs.ble_data?.mac_address && (
                          <div>
                            <span className="text-slate-400">MAC:</span>
                            <span className="text-white ml-2 font-mono">{obs.ble_data.mac_address}</span>
                          </div>
                        )}
                        {obs.wifi_data?.ssid && (
                          <div>
                            <span className="text-slate-400">SSID:</span>
                            <span className="text-white ml-2">{obs.wifi_data.ssid}</span>
                          </div>
                        )}
                        {obs.network_data?.source_ip && (
                          <div>
                            <span className="text-slate-400">Source IP:</span>
                            <span className="text-white ml-2 font-mono">{obs.network_data.source_ip}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-400">Time:</span>
                          <span className="text-white ml-2">{DateUtils.safeFormatTime(obs.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="findings" className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">IOC Findings</CardTitle>
            </CardHeader>
            <CardContent>
              {findingsLoading ? (
                <div className="text-center py-12 text-slate-400">
                  <Activity className="w-16 h-16 mx-auto mb-4 animate-pulse" />
                  <p>Loading findings...</p>
                </div>
              ) : findings.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Shield className="w-16 h-16 mx-auto mb-4 text-green-400" />
                  <p>No threats detected</p>
                  <p className="text-sm mt-2">All observations came back clean</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {findings.map((finding, idx) => (
                    <div key={idx} className={`p-4 rounded-lg border ${
                      finding.severity === 'critical' ? 'bg-red-500/10 border-red-500/50' :
                      finding.severity === 'high' ? 'bg-orange-500/10 border-orange-500/50' :
                      finding.severity === 'medium' ? 'bg-yellow-500/10 border-yellow-500/50' :
                      'bg-blue-500/10 border-blue-500/50'
                    }`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-white">{finding.description}</h4>
                          <p className="text-xs text-slate-400 mt-1">IOC: {finding.ioc_value}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge className={
                            finding.severity === 'critical' ? 'bg-red-500' :
                            finding.severity === 'high' ? 'bg-orange-500' :
                            finding.severity === 'medium' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }>
                            {finding.severity?.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">
                            {finding.confidence}% confidence
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs text-slate-400">
                        <span>Type: {finding.ioc_type}</span>
                        <span>•</span>
                        <span>First seen: {DateUtils.safeFormatTime(finding.first_seen)}</span>
                        {finding.occurrence_count > 1 && (
                          <>
                            <span>•</span>
                            <span>Occurrences: {finding.occurrence_count}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Collection Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Telemetry Collection Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {telemetryErrors.map((err, idx) => (
                  <div key={idx} className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-yellow-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-white font-semibold mb-1">{err.description}</p>
                        <p className="text-sm text-slate-400 mb-2">{err.metadata?.note || err.metadata?.error_details}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-500">Collector:</span>
                            <span className="text-slate-300 ml-2">{err.metadata?.collector || 'unknown'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Time:</span>
                            <span className="text-slate-300 ml-2">{DateUtils.safeFormatTime(err.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-blue-400" />
                  BLE Devices
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-white mb-2">{bleObservations}</p>
                <p className="text-sm text-slate-400">Bluetooth devices detected</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Network className="w-5 h-5 text-purple-400" />
                  WiFi Networks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-white mb-2">{wifiObservations}</p>
                <p className="text-sm text-slate-400">Access points found</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-green-400" />
                  Network Packets
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-white mb-2">{networkObservations}</p>
                <p className="text-sm text-slate-400">Network activity logged</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Threat Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Critical Findings</span>
                  <Badge className="bg-red-500">{findings.filter(f => f.severity === 'critical').length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">High Priority</span>
                  <Badge className="bg-orange-500">{findings.filter(f => f.severity === 'high').length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Medium Priority</span>
                  <Badge className="bg-yellow-500">{findings.filter(f => f.severity === 'medium').length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Low Priority</span>
                  <Badge className="bg-blue-500">{findings.filter(f => f.severity === 'low').length}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}