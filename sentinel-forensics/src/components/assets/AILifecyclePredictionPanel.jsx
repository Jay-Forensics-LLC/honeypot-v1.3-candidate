import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, TrendingDown, Loader2, Calendar, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { aiAssetLifecyclePrediction } from '../../functions/aiAssetLifecyclePrediction';

export default function AILifecyclePredictionPanel({ asset }) {
  const [prediction, setPrediction] = useState(asset?.lifecycle_prediction || null);

  const predictMutation = useMutation({
    mutationFn: async () => {
      const response = await aiAssetLifecyclePrediction({ asset_id: asset.id });
      return response.data;
    },
    onSuccess: (data) => {
      setPrediction(data.prediction);
      toast.success('Lifecycle prediction complete');
    },
    onError: (error) => {
      toast.error('Prediction failed', { description: error.message });
    }
  });

  const getStageColor = (stage) => {
    switch (stage) {
      case 'new': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'active': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'mature': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'aging': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'end_of_life': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getRecommendationColor = (rec) => {
    switch (rec) {
      case 'keep': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'monitor': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'plan_replacement': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'replace_urgently': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  if (!asset) return null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-purple-400" />
            AI Lifecycle Prediction
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
                <TrendingDown className="w-4 h-4 mr-1" />
                Predict
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
              Predict asset lifecycle and get refresh/decommissioning recommendations.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <p className="text-xs text-slate-400 mb-1">Lifecycle Stage</p>
                <Badge className={getStageColor(prediction.current_lifecycle_stage)}>
                  {prediction.current_lifecycle_stage?.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <p className="text-xs text-slate-400 mb-1">Recommendation</p>
                <Badge className={getRecommendationColor(prediction.refresh_recommendation)}>
                  {prediction.refresh_recommendation?.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>

            {prediction.expected_eol_date && (
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-orange-400" />
                  <p className="text-sm font-semibold text-white">Expected End-of-Life</p>
                </div>
                <p className="text-sm text-slate-300">{new Date(prediction.expected_eol_date).toLocaleDateString()}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {prediction.remaining_useful_life_months} months remaining
                </p>
              </div>
            )}

            {prediction.financial_analysis && (
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <p className="text-sm font-semibold text-white">Financial Analysis</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-slate-400">TCO</p>
                    <p className="text-white font-semibold">
                      ${prediction.financial_analysis.total_cost_of_ownership?.toLocaleString() || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Current Value</p>
                    <p className="text-white font-semibold">
                      ${prediction.financial_analysis.current_value?.toLocaleString() || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Replacement Cost</p>
                    <p className="text-white font-semibold">
                      ${prediction.financial_analysis.estimated_replacement_cost?.toLocaleString() || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">ROI</p>
                    <p className="text-green-400 font-semibold">
                      {prediction.financial_analysis.roi_of_replacement || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {prediction.recommended_actions && prediction.recommended_actions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Recommended Actions</h4>
                <div className="space-y-2">
                  {prediction.recommended_actions.slice(0, 5).map((action, idx) => (
                    <div key={idx} className="p-2 bg-slate-800/30 rounded text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-semibold">{action.action}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {action.priority}
                        </Badge>
                      </div>
                      <p className="text-slate-400">
                        {action.timeframe} • ${action.estimated_cost?.toLocaleString() || 'N/A'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {prediction.summary && (
              <p className="text-xs text-slate-400 italic">{prediction.summary}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}