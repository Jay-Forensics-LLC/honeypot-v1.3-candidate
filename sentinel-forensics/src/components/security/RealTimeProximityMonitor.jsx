import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Wifi, WifiOff, Activity, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function RealTimeProximityMonitor() {
  const [status, setStatus] = useState('monitoring');
  const [networkQuality, setNetworkQuality] = useState('good');
  const [threatCount, setThreatCount] = useState(0);
  const lastScanRef = useRef(Date.now());

  const detectMutation = useMutation({
    mutationFn: (metrics) => base44.functions.invoke('detectProximityThreats', metrics),
    onSuccess: (data) => {
      if (data.threats_detected > 0) {
        setThreatCount(prev => prev + data.threats_detected);
        toast.error(`${data.threats_detected} proximity threat(s) detected!`, {
          description: data.threats[0]?.description || 'Check security dashboard'
        });
      }
      lastScanRef.current = Date.now();
    },
    onError: () => {
      setStatus('error');
    }
  });

  // Monitor network quality in real-time
  useEffect(() => {
    const monitorNetwork = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (connection) {
        const effectiveType = connection.effectiveType;
        const rtt = connection.rtt;

        if (effectiveType === '4g' && rtt < 100) {
          setNetworkQuality('excellent');
        } else if (effectiveType === '4g' || (effectiveType === '3g' && rtt < 200)) {
          setNetworkQuality('good');
        } else if (rtt > 500 || effectiveType === '2g') {
          setNetworkQuality('poor');
          // Trigger scan on poor network quality (possible interference)
          if (Date.now() - lastScanRef.current > 30000) {
            runProximityScan();
          }
        } else {
          setNetworkQuality('fair');
        }
      }
    };

    monitorNetwork();
    const interval = setInterval(monitorNetwork, 10000);

    return () => clearInterval(interval);
  }, []);

  const runProximityScan = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    const metrics = {
      device_id: `web-${navigator.userAgent.substring(0, 50)}`,
      network_metrics: {
        packet_rate: connection?.downlink ? connection.downlink * 125 : 1000,
        packet_loss: connection?.effectiveType === '2g' ? 25 : connection?.effectiveType === '3g' ? 12 : 3,
        latency: connection?.rtt || 50,
        jitter: Math.random() * 50,
        bandwidth_usage: connection?.downlink || 10,
        connection_type: connection?.effectiveType || 'unknown'
      },
      user_context: {
        access_attempts: [Date.now()],
        unusual_locations: [],
        failed_auth_attempts: 0,
        time_anomalies: []
      },
      behavior_metrics: {
        typing_speed: Math.random() * 200,
        session_duration: (Date.now() - performance.timing.navigationStart) / 1000,
        interaction_frequency: performance.getEntriesByType('navigation').length
      }
    };

    detectMutation.mutate(metrics);
  };

  const getStatusColor = () => {
    if (status === 'error') return 'text-red-400';
    if (threatCount > 0) return 'text-orange-400';
    return 'text-green-400';
  };

  const getNetworkIcon = () => {
    if (networkQuality === 'poor') return <WifiOff className="w-4 h-4 text-red-400" />;
    return <Wifi className="w-4 h-4 text-green-400" />;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className={`w-5 h-5 ${getStatusColor()}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">Proximity Defense</span>
                <Badge variant="outline" className="text-xs">
                  {status === 'monitoring' ? 'Active' : 'Error'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {getNetworkIcon()}
                <span className="text-xs text-slate-400">
                  Network: {networkQuality}
                </span>
              </div>
            </div>
          </div>

          {threatCount > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-orange-400">{threatCount}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}