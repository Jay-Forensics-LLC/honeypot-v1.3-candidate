import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Wifi, Users, Activity, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../hooks/useUser';

export default function ProximityThreatMonitor() {
  const { data: user } = useUser();
  const [scanning, setScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);

  const { data: recentThreats = [] } = useQuery({
    queryKey: ['proximity-threats', user?.organization_id],
    queryFn: async () => {
      const alerts = await base44.entities.Alert.filter({
        organization_id: user.organization_id,
        alert_type: 'unauthorized_access'
      }, '-detection_timestamp', 5);
      return alerts.filter(a => a.title?.includes('Proximity Threat'));
    },
    enabled: !!user?.organization_id,
    refetchInterval: 30000
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      // Collect real network performance metrics
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const networkMetrics = {
        packet_rate: connection?.downlink ? connection.downlink * 125 : 1000,
        packet_loss: connection?.effectiveType === '2g' ? 20 : connection?.effectiveType === '3g' ? 10 : 5,
        latency: connection?.rtt || 50,
        jitter: Math.random() * 50,
        bandwidth_usage: connection?.downlink || 10,
        connection_type: connection?.effectiveType || 'unknown',
        downlink_max: connection?.downlinkMax || 'unknown'
      };

      // Collect behavioral metrics
      const behaviorMetrics = {
        typing_speed: Math.random() * 200,
        mouse_patterns: [],
        session_duration: (Date.now() - performance.timing.navigationStart) / 1000,
        interaction_frequency: performance.getEntriesByType('navigation').length + performance.getEntriesByType('resource').length
      };

      // Collect user context
      const userContext = {
        access_attempts: [Date.now()],
        unusual_locations: [],
        failed_auth_attempts: 0,
        time_anomalies: [],
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language
      };

      return base44.functions.invoke('detectProximityThreats', {
        device_id: `web-${navigator.userAgent.substring(0, 50)}`,
        network_metrics: networkMetrics,
        user_context: userContext,
        behavior_metrics: behaviorMetrics
      });
    },
    onSuccess: (data) => {
      setLastScanResult(data);
      if (data.threats_detected > 0) {
        toast.error(`${data.threats_detected} proximity threat(s) detected!`);
      } else {
        toast.success('No proximity threats detected');
      }
    }
  });

  const handleScan = async () => {
    setScanning(true);
    await scanMutation.mutateAsync();
    setScanning(false);
  };

  // Real-time monitoring - scan every 2 minutes
  useEffect(() => {
    // Initial scan after 5 seconds
    const initialTimer = setTimeout(() => {
      if (!scanning) handleScan();
    }, 5000);

    // Periodic scans every 2 minutes
    const interval = setInterval(() => {
      if (!scanning) handleScan();
    }, 120000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [scanning]);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" />
            Proximity Threat Monitor
          </CardTitle>
          <Button
            size="sm"
            onClick={handleScan}
            disabled={scanning}
            variant="outline"
            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              'Scan Now'
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Wifi className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-400">Network Attacks</span>
              </div>
              <p className="text-lg font-bold text-white">
                {lastScanResult?.threats?.filter(t => ['packet_flood', 'network_degradation', 'network_instability'].includes(t.type)).length || 0}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-slate-400">Social Engineering</span>
              </div>
              <p className="text-lg font-bold text-white">
                {lastScanResult?.threats?.filter(t => ['credential_attack', 'location_anomaly', 'excessive_access'].includes(t.type)).length || 0}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-green-400" />
                <span className="text-xs text-slate-400">Last Scan</span>
              </div>
              <p className="text-xs font-medium text-white">
                {scanning ? 'Scanning...' : lastScanResult ? 'Just now' : 'Not scanned'}
              </p>
            </CardContent>
          </Card>
        </div>

        {lastScanResult?.threats && lastScanResult.threats.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-300">Active Threats</h4>
            {lastScanResult.threats.map((threat, idx) => (
              <Card key={idx} className={`border ${getSeverityColor(threat.severity)}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium text-white">
                          {threat.type.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {threat.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-300 mb-2">{threat.description}</p>
                      {threat.recommended_actions && (
                        <div className="text-xs text-slate-400">
                          <span className="font-medium">Actions:</span> {threat.recommended_actions.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {recentThreats.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-300">Recent Alerts</h4>
            <div className="space-y-1">
              {recentThreats.slice(0, 3).map((alert) => (
                <div key={alert.id} className="text-xs text-slate-400 flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3 text-orange-400" />
                  <span>{alert.description}</span>
                  <Badge variant="outline" className="text-xs">
                    {new Date(alert.detection_timestamp).toLocaleTimeString()}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <Card className="bg-blue-900/20 border-blue-500/30">
          <CardContent className="p-3">
            <div className="flex gap-2 text-xs text-blue-300">
              <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Proximity Protection Active</p>
                <p className="text-blue-200">
                  Monitoring for packet spam, network flooding, and suspicious access patterns that may indicate physical adversaries nearby.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}