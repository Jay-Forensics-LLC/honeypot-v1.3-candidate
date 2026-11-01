import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, CheckCircle, Clock, TrendingUp, 
  Package, Wrench, Eye, Loader2 
} from 'lucide-react';
import { format } from 'date-fns';

export default function DeviceHealthDetail({ device, onClose }) {
  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['device-alerts', device.device_id],
    queryFn: async () => {
      return base44.entities.DeviceHealthAlert.filter({
        device_id: device.device_id
      }, '-created_date', 10);
    },
    initialData: []
  });

  const { data: recommendations = [], isLoading: recsLoading } = useQuery({
    queryKey: ['device-recommendations', device.device_id],
    queryFn: async () => {
      return base44.entities.DeviceHealthRecommendation.filter({
        device_id: device.device_id,
        status: 'PENDING'
      }, '-created_at', 5);
    },
    initialData: []
  });

  const getRiskColor = (band) => {
    switch (band) {
      case 'CRITICAL': return 'text-red-400';
      case 'HIGH': return 'text-orange-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'LOW': return 'text-green-400';
      default: return 'text-slate-400';
    }
  };

  const getRecTypeIcon = (type) => {
    switch (type) {
      case 'REPLACE': return Package;
      case 'MAINTENANCE': return Wrench;
      default: return Eye;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {device.hostname || device.device_id}
            <Badge className={`${getRiskColor(device.risk_band)} bg-opacity-20`}>
              {device.risk_band} RISK
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Health Metrics */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Health Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Health Score</p>
                  <p className={`text-2xl font-bold ${
                    device.health_score >= 80 ? 'text-green-400' : 
                    device.health_score >= 60 ? 'text-yellow-400' : 
                    'text-red-400'
                  }`}>
                    {device.health_score || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Failure Risk</p>
                  <p className="text-2xl font-bold text-white">
                    {device.failure_risk ? `${Math.round(device.failure_risk * 100)}%` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Predicted Window</p>
                  <p className="text-lg font-semibold text-white">
                    {device.predicted_failure_window || 'N/A'}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs text-slate-500">
                  Confidence: <span className="text-white">{device.health_confidence || 'N/A'}</span>
                  {' | '}
                  Last evaluated: <span className="text-white">
                    {device.health_evaluated_at 
                      ? format(new Date(device.health_evaluated_at), 'MMM d, h:mm a')
                      : 'Never'}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Risk Factors */}
          {device.top_risk_factors && device.top_risk_factors.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  Contributing Risk Factors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {device.top_risk_factors.map((factor, idx) => (
                    <div key={idx} className="p-2 bg-slate-900/50 rounded border border-slate-700">
                      <p className="text-sm text-white">{factor}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {recsLoading ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-600 mx-auto" />
              </CardContent>
            </Card>
          ) : recommendations.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recommendations.map(rec => {
                  const Icon = getRecTypeIcon(rec.recommendation_type);
                  return (
                    <div key={rec.id} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                      <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-blue-500/20 text-blue-400">
                              {rec.recommendation_type}
                            </Badge>
                            <Badge className="bg-slate-700 text-slate-300 text-xs">
                              {rec.confidence} CONFIDENCE
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-300 mb-3">{rec.justification}</p>
                          
                          {rec.actions && rec.actions.length > 0 && (
                            <div className="space-y-1 mb-3">
                              <p className="text-xs text-slate-400 font-semibold">Actions:</p>
                              {rec.actions.map((action, idx) => (
                                <div key={idx} className="flex items-start gap-2">
                                  <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-slate-300">{action}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {rec.parts_required && rec.parts_required.length > 0 && (
                            <div className="p-2 bg-slate-800 rounded border border-slate-600">
                              <p className="text-xs text-slate-400 font-semibold mb-1">Parts Required:</p>
                              {rec.parts_required.map((part, idx) => (
                                <p key={idx} className="text-xs text-slate-300">
                                  {part.sku} - {part.qty_available > 0 
                                    ? `${part.qty_available} in stock` 
                                    : `Out of stock (${part.lead_time_days}d lead time)`}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Recent Alerts */}
          {alertsLoading ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-600 mx-auto" />
              </CardContent>
            </Card>
          ) : alerts.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Recent Alerts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.map(alert => (
                  <div key={alert.id} className="p-3 bg-slate-900/50 rounded border border-slate-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`${getRiskColor(alert.severity)} bg-opacity-20`}>
                            {alert.severity}
                          </Badge>
                          <Badge className={`text-xs ${
                            alert.status === 'OPEN' ? 'bg-yellow-500/20 text-yellow-400' :
                            alert.status === 'ACKNOWLEDGED' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-green-500/20 text-green-400'
                          }`}>
                            {alert.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-white">{alert.reason}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {format(new Date(alert.created_date), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}