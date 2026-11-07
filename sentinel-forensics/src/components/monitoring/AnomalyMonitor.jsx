import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Activity,
  TrendingUp,
  Shield,
  RefreshCw,
  Bell
} from 'lucide-react';
import { toast } from 'sonner';

export default function AnomalyMonitor({ sessionId, deviceFingerprintId }) {
  const [anomalyThreshold, setAnomalyThreshold] = useState(60);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: anomalies = [], isLoading, refetch } = useQuery({
    queryKey: ['anomalies', sessionId, deviceFingerprintId],
    queryFn: async () => {
      if (!sessionId && !deviceFingerprintId) return [];
      
      const response = await base44.functions.invoke('detectBLEAnomalies', {
        session_id: sessionId,
        device_fingerprint_id: deviceFingerprintId
      });
      
      return response.data.anomalies || [];
    },
    enabled: !!(sessionId || deviceFingerprintId),
    refetchInterval: autoRefresh ? 30000 : false
  });

  const highSeverityAnomalies = anomalies.filter(a => 
    a.severity === 'high' || a.severity === 'critical'
  );

  const recentAnomalies = anomalies.slice(-5);

  useEffect(() => {
    if (highSeverityAnomalies.length > 0 && anomalies.length > 0) {
      // Check if this is a new high-severity anomaly
      const latest = anomalies[anomalies.length - 1];
      if ((latest.severity === 'high' || latest.severity === 'critical') && 
          latest.confidence_score >= anomalyThreshold) {
        toast.error('High-Severity Anomaly Detected!', {
          description: latest.description,
          duration: 10000
        });
      }
    }
  }, [anomalies.length]);

  const severityColors = {
    info: 'bg-blue-500/20 text-blue-400',
    low: 'bg-green-500/20 text-green-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    high: 'bg-orange-500/20 text-orange-400',
    critical: 'bg-red-500/20 text-red-400'
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-purple-400" />
          <h3 className="text-xl font-bold text-white">Anomaly Detection</h3>
          {autoRefresh && (
            <Badge className="bg-green-500/20 text-green-400">
              <Activity className="w-3 h-3 mr-1 animate-pulse" />
              Live
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant="outline"
            size="sm"
            className="border-slate-700"
          >
            {autoRefresh ? 'Pause' : 'Resume'}
          </Button>
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            className="border-slate-700"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="text-xs text-slate-400">Total Anomalies</p>
                <p className="text-xl font-bold text-white">{anomalies.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-xs text-slate-400">High Severity</p>
                <p className="text-xl font-bold text-white">{highSeverityAnomalies.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-xs text-slate-400">Threat Score</p>
                <p className="text-xl font-bold text-white">
                  {anomalies.length > 0 ? Math.max(...anomalies.map(a => a.confidence_score)).toFixed(0) : 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Anomalies */}
      <Card className="bg-slate-800/30 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-orange-400" />
            Recent Detections
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-6">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-400" />
            </div>
          ) : recentAnomalies.length === 0 ? (
            <div className="text-center py-6 text-slate-400">
              <Shield className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-sm">No anomalies detected</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentAnomalies.reverse().map((anomaly, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-900/50 border border-slate-700 rounded-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={severityColors[anomaly.severity]}>
                          {anomaly.severity}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {anomaly.confidence_score}% confidence
                        </span>
                      </div>
                      <p className="text-sm text-white mb-1">{anomaly.description}</p>
                      <p className="text-xs text-slate-400">
                        Method: {anomaly.detection_method}
                      </p>
                      {anomaly.indicators && anomaly.indicators.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {anomaly.indicators.slice(0, 2).map((indicator, i) => (
                            <p key={i} className="text-xs text-slate-500">
                              • {indicator}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}