import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, Wifi, AlertTriangle, Shield, Play, Pause, Download, Filter, Zap 
} from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgList } from "../components/hooks/useOrgQuery";
import { auditLogger } from "../components/utils/auditLogger";

/**
 * PERFORMANCE OPTIMIZED NetworkMonitor v2.0
 * - Reduced packet generation from every 3s to every 5s
 * - Batch size increased to 50 for fewer DB calls
 * - No auto-polling when not monitoring
 * - Removed redundant imports
 */

export default function NetworkMonitor() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [liveData, setLiveData] = useState([]);
  const [filterProtocol, setFilterProtocol] = useState("all");
  const queryClient = useQueryClient();

  // ORG-SCOPED: Only fetch logs when NOT monitoring (no polling when monitoring)
  const { data: logs = [] } = useOrgList('NetworkLog', '-timestamp', 50, {
    enabled: !isMonitoring,
    staleTime: 5 * 60 * 1000
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // REMOVED: generateNetworkPacket - no more fake data generation

  // REMOVED: flushPendingLogs - no longer generating fake data

  const startMonitoringMutation = useMutation({
    mutationFn: async () => {
      await auditLogger.log({
        event_type: 'network_monitoring_started',
        severity: 'info',
        description: 'Network monitoring session initiated'
      });
    },
    onSuccess: () => {
      setIsMonitoring(true);
      toast.info('Live monitoring active - displaying real NetworkLog entity events');
      startLiveMonitoring();
    }
  });

  const stopMonitoringMutation = useMutation({
    mutationFn: async () => {
      await auditLogger.log({
        event_type: 'network_monitoring_stopped',
        severity: 'info',
        description: `Network monitoring ended. ${liveData.length} packets displayed.`,
        metadata: { packets_displayed: liveData.length }
      });
    },
    onSuccess: () => {
      setIsMonitoring(false);
      toast.success('Monitoring stopped');
      stopLiveMonitoring();
      setLiveData([]);
    }
  });

  // Real-time monitoring via entity subscriptions
  const startLiveMonitoring = () => {
    toast.info('Live monitoring requires real network capture agent');
    
    // Subscribe to real NetworkLog entity changes
    const unsubscribe = base44.entities.NetworkLog.subscribe((event) => {
      if (event.type === 'create') {
        setLiveData(prev => [event.data, ...prev].slice(0, 50));
        
        if (event.data.is_suspicious && event.data.threat_score > 80) {
          toast.warning(`⚠️ Suspicious traffic from ${event.data.source_ip}`);
        }
      }
    });
    
    window.networkMonitorUnsubscribe = unsubscribe;
  };

  const stopLiveMonitoring = () => {
    if (window.networkMonitorUnsubscribe) {
      window.networkMonitorUnsubscribe();
      window.networkMonitorUnsubscribe = null;
    }
  };

  useEffect(() => {
    return () => {
      stopLiveMonitoring();
    };
  }, []);

  const exportLogsMutation = useMutation({
    mutationFn: async () => {
      const logsToExport = isMonitoring ? liveData : logs;
      const csvContent = [
        ['Timestamp', 'Source IP', 'Destination IP', 'Protocol', 'Port', 'Suspicious', 'Threat Score'],
        ...logsToExport.map(log => [
          log.timestamp, log.source_ip, log.destination_ip, log.protocol, 
          log.port, log.is_suspicious ? 'Yes' : 'No', log.threat_score || 0
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `network-logs-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      return logsToExport.length;
    },
    onSuccess: (count) => toast.success(`Exported ${count} logs`)
  });

  const displayLogs = isMonitoring ? liveData : logs;
  const filteredLogs = filterProtocol === 'all' 
    ? displayLogs 
    : displayLogs.filter(l => l.protocol === filterProtocol);
    
  const suspiciousCount = filteredLogs.filter(l => l.is_suspicious).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Network Monitor</h1>
          <p className="text-slate-400">Real-time network traffic analysis</p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={() => exportLogsMutation.mutate()}
            disabled={displayLogs.length === 0}
            variant="outline"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button 
            onClick={() => isMonitoring ? stopMonitoringMutation.mutate() : startMonitoringMutation.mutate()}
            className={isMonitoring ? "bg-red-600" : "bg-blue-600"}
          >
            {isMonitoring ? (
              <><Pause className="w-4 h-4 mr-2" />Stop</>
            ) : (
              <><Play className="w-4 h-4 mr-2" />Start</>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isMonitoring ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-white font-semibold">{isMonitoring ? 'Live Subscription Active' : 'Idle'}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400">Total Packets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{filteredLogs.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400">Suspicious</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-2xl font-bold text-white">{suspiciousCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              {isMonitoring ? 'Live' : 'Historical'} Traffic
            </CardTitle>
            <Select value={filterProtocol} onValueChange={setFilterProtocol}>
              <SelectTrigger className="w-32 bg-slate-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="TCP">TCP</SelectItem>
                <SelectItem value="UDP">UDP</SelectItem>
                <SelectItem value="HTTPS">HTTPS</SelectItem>
                <SelectItem value="HTTP">HTTP</SelectItem>
                <SelectItem value="DNS">DNS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Wifi className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p>No traffic captured</p>
              </div>
            ) : (
              filteredLogs.map((log, idx) => (
                <div 
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    log.is_suspicious 
                      ? 'border-red-500/50 bg-red-500/10' 
                      : 'border-slate-800 bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-mono text-sm">
                      {log.source_ip} → {log.destination_ip}
                    </span>
                    <div className="flex gap-2">
                      <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                        {log.protocol}
                      </Badge>
                      {log.is_suspicious && (
                        <Badge className="bg-red-500/20 text-red-400 text-xs">
                          SUSPICIOUS
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}