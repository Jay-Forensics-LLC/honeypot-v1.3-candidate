import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, AlertCircle, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';

export default function DeviceHealthList({ devices, onSelectDevice, filter }) {
  const filtered = devices.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'at-risk') return d.risk_band === 'HIGH' || d.risk_band === 'CRITICAL';
    return d.risk_band === filter;
  });

  const sorted = filtered.sort((a, b) => {
    const riskOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return riskOrder[b.risk_band] - riskOrder[a.risk_band];
  });

  const getRiskColor = (band) => {
    switch (band) {
      case 'CRITICAL': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'HIGH': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'LOW': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-slate-700 text-slate-400';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span>Device Health Status</span>
          <Badge className="bg-slate-800 text-slate-300">
            {sorted.length} devices
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No devices match the selected filter
            </div>
          ) : (
            sorted.map(device => (
              <div
                key={device.id}
                className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-white font-semibold">
                        {device.hostname || device.device_id}
                      </h3>
                      <Badge className={getRiskColor(device.risk_band)}>
                        {device.risk_band}
                      </Badge>
                      {device.health_score < 60 && (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-slate-400">Health Score</p>
                        <p className={`text-sm font-semibold ${
                          device.health_score >= 80 ? 'text-green-400' : 
                          device.health_score >= 60 ? 'text-yellow-400' : 
                          'text-red-400'
                        }`}>
                          {device.health_score || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Failure Risk</p>
                        <p className="text-sm font-semibold text-white">
                          {device.failure_risk ? `${Math.round(device.failure_risk * 100)}%` : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Predicted Window</p>
                        <p className="text-sm font-semibold text-white">
                          {device.predicted_failure_window || 'N/A'}
                        </p>
                      </div>
                    </div>

                    {device.top_risk_factors && device.top_risk_factors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {device.top_risk_factors.slice(0, 2).map((factor, idx) => (
                          <Badge 
                            key={idx}
                            className="bg-slate-700/50 text-slate-300 text-xs"
                          >
                            {factor}
                          </Badge>
                        ))}
                        {device.top_risk_factors.length > 2 && (
                          <Badge className="bg-slate-700/50 text-slate-300 text-xs">
                            +{device.top_risk_factors.length - 2} more
                          </Badge>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-slate-500">
                      Last evaluated: {device.health_evaluated_at 
                        ? format(new Date(device.health_evaluated_at), 'MMM d, h:mm a')
                        : 'Never'}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSelectDevice(device)}
                    className="border-slate-700"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Details
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}