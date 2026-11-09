import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  AlertTriangle,
  TrendingDown,
  Loader2,
  Sparkles,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { aiDeviceHealthPredictor } from '../../functions/aiDeviceHealthPredictor';

/**
 * AI-POWERED DEVICE HEALTH PREDICTION PANEL
 * Displays predictive insights into device health and potential failures
 */
export default function AIDeviceHealthPanel({ device }) {
  const [prediction, setPrediction] = useState(device.health_prediction_data || null);

  const predictMutation = useMutation({
    mutationFn: async () => {
      const response = await aiDeviceHealthPredictor({ device_id: device.device_id });
      return response.data;
    },
    onSuccess: (data) => {
      setPrediction(data.prediction);
      toast.success('Health prediction completed');
    },
    onError: (error) => {
      toast.error('Prediction failed', { description: error.message });
    }
  });

  const getHealthColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-purple-400" />
            AI Health Prediction
          </CardTitle>
          <Button
            size="sm"
            onClick={() => predictMutation.mutate()}
            disabled={predictMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {predictMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1" />
                Predict Health
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!prediction ? (
          <Alert className="bg-purple-500/10 border-purple-500/30">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <AlertDescription className="text-purple-300">
              Use AI to analyze device metrics and predict potential failures before they occur.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Health Score */}
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Overall Health Score</span>
                <Badge className={getRiskColor(prediction.failure_risk)}>
                  {prediction.failure_risk} risk
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Activity className={`w-8 h-8 ${getHealthColor(prediction.health_score)}`} />
                <span className={`text-4xl font-bold ${getHealthColor(prediction.health_score)}`}>
                  {prediction.health_score}/100
                </span>
              </div>
              {prediction.summary && (
                <p className="text-xs text-slate-400 mt-2">{prediction.summary}</p>
              )}
            </div>

            {/* Predicted Failures */}
            {prediction.predicted_failures && prediction.predicted_failures.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-orange-400" />
                  Predicted Failures
                </h4>
                <div className="space-y-2">
                  {prediction.predicted_failures.map((failure, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-semibold text-white">{failure.type}</span>
                        <Badge variant="outline" className="text-xs">
                          {Math.round(failure.probability * 100)}% probability
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          <span>Timeframe: {failure.timeframe}</span>
                        </div>
                        <p><strong>Impact:</strong> {failure.impact}</p>
                        {failure.indicators && failure.indicators.length > 0 && (
                          <div className="mt-2">
                            <strong>Indicators:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-0.5">
                              {failure.indicators.map((indicator, i) => (
                                <li key={i}>{indicator}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Degradation Indicators */}
            {prediction.degradation_indicators && prediction.degradation_indicators.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  Degradation Indicators
                </h4>
                <div className="space-y-1">
                  {prediction.degradation_indicators.map((indicator, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <XCircle className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <span>{indicator}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Actions */}
            {prediction.recommended_actions && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-white">Maintenance Priority</h4>
                  <Badge className={getPriorityColor(prediction.maintenance_priority)}>
                    {prediction.maintenance_priority}
                  </Badge>
                </div>

                {prediction.recommended_actions.immediate && prediction.recommended_actions.immediate.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-red-400 mb-2">Immediate Actions:</p>
                    <div className="space-y-1">
                      {prediction.recommended_actions.immediate.map((action, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {prediction.recommended_actions.preventive && prediction.recommended_actions.preventive.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-400 mb-2">Preventive Actions:</p>
                    <div className="space-y-1">
                      {prediction.recommended_actions.preventive.map((action, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {device.last_health_prediction && (
              <p className="text-xs text-slate-500 text-right">
                Last analyzed: {new Date(device.last_health_prediction).toLocaleString()}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}