import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shield, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Activity } from 'lucide-react';

export default function SecurityHealthScore({ alerts, bleAnomalies, networkLogs, userBehavior, auditLogs }) {
  const healthScore = useMemo(() => {
    let score = 100;
    
    // Deduct for critical alerts (10 points each)
    const criticalCount = [...alerts, ...bleAnomalies].filter(a => 
      a.severity === 'critical' || a.anomaly_type === 'stalking_pattern'
    ).length;
    score -= Math.min(criticalCount * 10, 50);

    // Deduct for high severity alerts (5 points each)
    const highCount = alerts.filter(a => a.severity === 'high').length;
    score -= Math.min(highCount * 5, 30);

    // Deduct for suspicious network activity (2 points each)
    const suspiciousNetwork = networkLogs.filter(l => l.is_suspicious).length;
    score -= Math.min(suspiciousNetwork * 2, 15);

    // Deduct for behavior anomalies (3 points each)
    score -= Math.min(userBehavior.length * 3, 20);

    // Bonus for resolved alerts
    const resolvedCount = alerts.filter(a => a.status === 'resolved').length;
    score += Math.min(resolvedCount * 2, 15);

    return Math.max(0, Math.min(100, score));
  }, [alerts, bleAnomalies, networkLogs, userBehavior]);

  const healthStatus = useMemo(() => {
    if (healthScore >= 90) return { label: 'Excellent', color: 'green', icon: CheckCircle };
    if (healthScore >= 75) return { label: 'Good', color: 'blue', icon: Shield };
    if (healthScore >= 60) return { label: 'Fair', color: 'yellow', icon: Activity };
    if (healthScore >= 40) return { label: 'Poor', color: 'orange', icon: AlertTriangle };
    return { label: 'Critical', color: 'red', icon: AlertTriangle };
  }, [healthScore]);

  const metrics = useMemo(() => {
    const totalThreats = alerts.length + bleAnomalies.length + userBehavior.length;
    const criticalThreats = [...alerts, ...bleAnomalies].filter(a => 
      a.severity === 'critical' || a.anomaly_type === 'stalking_pattern'
    ).length;
    const resolvedThreats = alerts.filter(a => a.status === 'resolved').length;
    
    return {
      threatPressure: Math.min(100, (criticalThreats / Math.max(totalThreats, 1)) * 100),
      responseRate: Math.min(100, (resolvedThreats / Math.max(totalThreats, 1)) * 100),
      networkHealth: Math.max(0, 100 - (networkLogs.filter(l => l.is_suspicious).length / Math.max(networkLogs.length, 1)) * 100),
      behaviorHealth: Math.max(0, 100 - (userBehavior.length * 10))
    };
  }, [alerts, bleAnomalies, networkLogs, userBehavior]);

  const StatusIcon = healthStatus.icon;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Main Health Score */}
      <Card className={`bg-gradient-to-br from-${healthStatus.color}-950/50 to-${healthStatus.color}-900/30 border-${healthStatus.color}-500/30 lg:col-span-1`}>
        <CardContent className="p-8">
          <div className="text-center">
            <StatusIcon className={`w-16 h-16 mx-auto mb-4 text-${healthStatus.color}-400`} />
            <p className="text-sm text-slate-400 mb-2">Security Health Score</p>
            <div className="flex items-baseline justify-center gap-2 mb-2">
              <p className="text-5xl font-bold text-white">{healthScore}</p>
              <span className="text-2xl text-slate-400">/100</span>
            </div>
            <Badge className={`bg-${healthStatus.color}-500/20 text-${healthStatus.color}-300 text-lg px-4 py-1`}>
              {healthStatus.label}
            </Badge>
            <div className="mt-6">
              <Progress 
                value={healthScore} 
                className="h-2"
                indicatorClassName={`bg-${healthStatus.color}-500`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Metrics */}
      <Card className="bg-slate-900/50 border-slate-800 lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-white text-lg">Security Metrics Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-white">Threat Pressure</span>
              </div>
              <span className="text-sm font-medium text-white">{metrics.threatPressure.toFixed(0)}%</span>
            </div>
            <Progress 
              value={metrics.threatPressure} 
              className="h-2"
              indicatorClassName="bg-red-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Ratio of critical threats to total alerts
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-white">Response Rate</span>
              </div>
              <span className="text-sm font-medium text-white">{metrics.responseRate.toFixed(0)}%</span>
            </div>
            <Progress 
              value={metrics.responseRate} 
              className="h-2"
              indicatorClassName="bg-green-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Percentage of threats successfully resolved
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-white">Network Health</span>
              </div>
              <span className="text-sm font-medium text-white">{metrics.networkHealth.toFixed(0)}%</span>
            </div>
            <Progress 
              value={metrics.networkHealth} 
              className="h-2"
              indicatorClassName="bg-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Network traffic cleanliness index
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-white">Behavior Health</span>
              </div>
              <span className="text-sm font-medium text-white">{metrics.behaviorHealth.toFixed(0)}%</span>
            </div>
            <Progress 
              value={metrics.behaviorHealth} 
              className="h-2"
              indicatorClassName="bg-purple-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              User behavior pattern normality
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}