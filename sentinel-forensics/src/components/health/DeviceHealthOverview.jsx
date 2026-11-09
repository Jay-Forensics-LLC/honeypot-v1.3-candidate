import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, AlertTriangle, TrendingUp, TrendingDown, 
  Activity, Loader2 
} from 'lucide-react';

export default function DeviceHealthOverview({ devices, alerts, isLoading }) {
  if (isLoading) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-600 mx-auto" />
        </CardContent>
      </Card>
    );
  }

  const riskCounts = {
    LOW: devices.filter(d => d.risk_band === 'LOW').length,
    MEDIUM: devices.filter(d => d.risk_band === 'MEDIUM').length,
    HIGH: devices.filter(d => d.risk_band === 'HIGH').length,
    CRITICAL: devices.filter(d => d.risk_band === 'CRITICAL').length
  };

  const avgHealthScore = devices.length > 0 
    ? Math.round(devices.reduce((sum, d) => sum + (d.health_score || 50), 0) / devices.length)
    : 0;

  const openAlerts = alerts.filter(a => a.status === 'OPEN').length;
  const criticalDevices = riskCounts.CRITICAL + riskCounts.HIGH;

  return (
    <div className="grid md:grid-cols-4 gap-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-400">
            Fleet Health Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold text-white">
              {avgHealthScore}
            </div>
            <Shield className={`w-8 h-8 ${
              avgHealthScore >= 80 ? 'text-green-400' : 
              avgHealthScore >= 60 ? 'text-yellow-400' : 
              'text-red-400'
            }`} />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Average across {devices.length} devices
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-400">
            Devices at Risk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold text-red-400">
              {criticalDevices}
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div className="flex gap-2 mt-2">
            {riskCounts.CRITICAL > 0 && (
              <Badge className="bg-red-500/20 text-red-400 text-xs">
                {riskCounts.CRITICAL} CRITICAL
              </Badge>
            )}
            {riskCounts.HIGH > 0 && (
              <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                {riskCounts.HIGH} HIGH
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-400">
            Open Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold text-yellow-400">
              {openAlerts}
            </div>
            <Activity className="w-8 h-8 text-yellow-400" />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {alerts.filter(a => a.escalated).length} escalated
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-400">
            Risk Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-green-400">LOW</span>
              <span className="text-white font-semibold">{riskCounts.LOW}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-yellow-400">MEDIUM</span>
              <span className="text-white font-semibold">{riskCounts.MEDIUM}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-orange-400">HIGH</span>
              <span className="text-white font-semibold">{riskCounts.HIGH}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-red-400">CRITICAL</span>
              <span className="text-white font-semibold">{riskCounts.CRITICAL}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}