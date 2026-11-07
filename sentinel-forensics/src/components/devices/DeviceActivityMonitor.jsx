import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  Zap,
  TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';

export default function DeviceActivityMonitor({ device }) {
  const systemMetrics = device.system_metrics || {};
  const networkMetrics = device.network_metrics || {};
  
  const realtimeMetrics = [
    {
      name: 'CPU Usage',
      value: systemMetrics.cpu_usage || 0,
      unit: '%',
      icon: Cpu,
      threshold: 80,
      color: 'blue'
    },
    {
      name: 'Memory Usage',
      value: systemMetrics.memory_usage || 0,
      unit: '%',
      icon: HardDrive,
      threshold: 85,
      color: 'purple'
    },
    {
      name: 'Network Activity',
      value: networkMetrics.bandwidth_usage || 0,
      unit: 'Mbps',
      icon: Wifi,
      threshold: 100,
      color: 'green'
    },
    {
      name: 'Active Processes',
      value: systemMetrics.active_processes || 0,
      unit: '',
      icon: Activity,
      threshold: 200,
      color: 'orange'
    }
  ];

  const getMetricColor = (value, threshold, color) => {
    if (value >= threshold) return 'text-red-400';
    return {
      blue: 'text-blue-400',
      purple: 'text-purple-400',
      green: 'text-green-400',
      orange: 'text-orange-400'
    }[color] || 'text-slate-400';
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-400" />
            Real-time Activity Monitor
          </CardTitle>
          {device.last_seen_at && (
            <Badge className="bg-slate-700 text-slate-300">
              Last update: {format(new Date(device.last_seen_at), 'HH:mm:ss')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {realtimeMetrics.map((metric, idx) => {
          const Icon = metric.icon;
          const isOverThreshold = metric.value >= metric.threshold;
          
          return (
            <div key={idx}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-300">{metric.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold ${getMetricColor(metric.value, metric.threshold, metric.color)}`}>
                    {metric.value}{metric.unit}
                  </span>
                  {isOverThreshold && <TrendingUp className="w-4 h-4 text-red-400" />}
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isOverThreshold ? 'bg-red-500' : `bg-${metric.color}-500`
                  }`}
                  style={{ width: `${Math.min(metric.value, 100)}%` }}
                />
              </div>
            </div>
          );
        })}

        {/* Active Threats */}
        {device.active_threats && device.active_threats.length > 0 && (
          <div className="pt-4 border-t border-slate-700">
            <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Active Threats Detected
            </h4>
            <div className="space-y-1">
              {device.active_threats.slice(0, 3).map((threat, idx) => (
                <div key={idx} className="text-xs text-slate-400 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {threat.name || threat.type}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}