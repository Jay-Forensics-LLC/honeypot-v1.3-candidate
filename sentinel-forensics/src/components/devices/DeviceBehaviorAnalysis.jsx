import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';

export default function DeviceBehaviorAnalysis({ device }) {
  const behaviorMetrics = device.behavior_metrics || {};
  const anomalyScore = device.anomaly_score || 0;
  
  const getRiskLevel = (score) => {
    if (score >= 80) return { level: 'Critical', color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50' };
    if (score >= 60) return { level: 'High', color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/50' };
    if (score >= 40) return { level: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/50' };
    if (score >= 20) return { level: 'Low', color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/50' };
    return { level: 'Normal', color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/50' };
  };

  const risk = getRiskLevel(anomalyScore);

  const behaviorIndicators = [
    {
      name: 'Login Pattern',
      value: behaviorMetrics.login_anomaly ? 'Anomalous' : 'Normal',
      trend: behaviorMetrics.login_anomaly ? 'up' : 'stable',
      severity: behaviorMetrics.login_anomaly ? 'high' : 'normal'
    },
    {
      name: 'Network Activity',
      value: behaviorMetrics.network_anomaly ? 'Unusual' : 'Normal',
      trend: behaviorMetrics.network_anomaly ? 'up' : 'stable',
      severity: behaviorMetrics.network_anomaly ? 'medium' : 'normal'
    },
    {
      name: 'Process Execution',
      value: behaviorMetrics.process_anomaly ? 'Suspicious' : 'Normal',
      trend: behaviorMetrics.process_anomaly ? 'up' : 'stable',
      severity: behaviorMetrics.process_anomaly ? 'critical' : 'normal'
    },
    {
      name: 'File Access',
      value: behaviorMetrics.file_access_anomaly ? 'Abnormal' : 'Normal',
      trend: behaviorMetrics.file_access_anomaly ? 'up' : 'stable',
      severity: behaviorMetrics.file_access_anomaly ? 'medium' : 'normal'
    }
  ];

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Behavioral Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Anomaly Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Overall Anomaly Score</span>
            <Badge className={`${risk.bg} ${risk.color} ${risk.border}`}>
              {risk.level}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={anomalyScore} className="flex-1" />
            <span className={`text-2xl font-bold ${risk.color}`}>{anomalyScore}%</span>
          </div>
        </div>

        {/* Behavior Indicators */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white">Activity Indicators</h4>
          {behaviorIndicators.map((indicator, idx) => {
            const isAnomalous = indicator.severity !== 'normal';
            return (
              <div key={idx} className={`p-3 rounded-lg border ${isAnomalous ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {indicator.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-red-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-400" />
                    )}
                    <span className="text-sm text-slate-300">{indicator.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isAnomalous ? 'text-red-400' : 'text-green-400'}`}>
                      {indicator.value}
                    </span>
                    {isAnomalous && <AlertTriangle className="w-4 h-4 text-red-400" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Anomalies */}
        {device.recent_anomalies && device.recent_anomalies.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white">Recent Anomalies</h4>
            {device.recent_anomalies.slice(0, 3).map((anomaly, idx) => (
              <div key={idx} className="p-2 bg-red-950/20 border border-red-500/30 rounded text-xs">
                <div className="flex items-center gap-2 text-red-400 mb-1">
                  <Zap className="w-3 h-3" />
                  <span className="font-semibold">{anomaly.type}</span>
                  <Clock className="w-3 h-3 ml-auto" />
                  <span>{format(new Date(anomaly.timestamp), 'MMM d, HH:mm')}</span>
                </div>
                <p className="text-slate-400">{anomaly.description}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}