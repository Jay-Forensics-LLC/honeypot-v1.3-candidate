import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { aiAlertTriageAdvanced } from '@/functions/aiAlertTriageAdvanced';
import { 
  Brain, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  Zap,
  Users,
  Target,
  Play
} from 'lucide-react';
import { toast } from 'sonner';

export default function AITriagePanel({ alert }) {
  const queryClient = useQueryClient();
  const [triageResults, setTriageResults] = useState(null);

  const triageMutation = useMutation({
    mutationFn: async () => {
      return await aiAlertTriageAdvanced({ alert_id: alert.id });
    },
    onSuccess: (data) => {
      setTriageResults(data.triage);
      if (data.auto_triggered) {
        toast.success(`Auto-triggered: ${data.auto_triggered.playbook_name}`);
      }
      queryClient.invalidateQueries(['alerts']);
    },
    onError: (error) => {
      toast.error('AI triage failed: ' + error.message);
    }
  });

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'critical': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'low': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Brain className="w-5 h-5 text-purple-500" />
          AI Alert Triage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!triageResults ? (
          <div className="text-center py-6">
            <Button
              onClick={() => triageMutation.mutate()}
              disabled={triageMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {triageMutation.isPending ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Run AI Triage
                </>
              )}
            </Button>
            <p className="text-xs text-slate-500 mt-2">
              AI will analyze patterns, correlate events, and recommend actions
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <h4 className="text-white font-medium mb-2">Summary</h4>
              <p className="text-slate-300 text-sm">{triageResults.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                  <span className="text-xs text-slate-400">Urgency</span>
                </div>
                <Badge className={getUrgencyColor(triageResults.urgency)}>
                  {triageResults.urgency.toUpperCase()}
                </Badge>
              </div>

              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="text-xs text-slate-400">Human Required</span>
                </div>
                {triageResults.requires_human_intervention ? (
                  <Badge className="bg-red-500/20 text-red-300 border-red-500/30">
                    YES
                  </Badge>
                ) : (
                  <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                    NO
                  </Badge>
                )}
              </div>
            </div>

            {triageResults.requires_human_intervention && triageResults.intervention_reason && (
              <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-300">Intervention Required</span>
                </div>
                <p className="text-xs text-red-200">{triageResults.intervention_reason}</p>
              </div>
            )}

            {triageResults.correlation_analysis?.pattern_detected && (
              <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium text-purple-300">Pattern Detected</span>
                </div>
                <div className="space-y-1 text-xs">
                  {triageResults.correlation_analysis.attack_stage && (
                    <p className="text-slate-300">
                      Attack Stage: <span className="text-purple-300 font-medium">
                        {triageResults.correlation_analysis.attack_stage}
                      </span>
                    </p>
                  )}
                  <p className="text-slate-300">
                    Confidence: <span className="text-purple-300 font-medium">
                      {(triageResults.correlation_analysis.confidence * 100).toFixed(0)}%
                    </span>
                  </p>
                  {triageResults.correlation_analysis.related_alerts?.length > 0 && (
                    <p className="text-slate-400">
                      Related to {triageResults.correlation_analysis.related_alerts.length} recent alerts
                    </p>
                  )}
                </div>
              </div>
            )}

            {triageResults.recommended_playbooks?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-500" />
                  Recommended Playbooks
                </h4>
                <div className="space-y-2">
                  {triageResults.recommended_playbooks.map((rec, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium text-sm">{rec.playbook_name}</span>
                        <Badge className={
                          rec.confidence > 0.85 ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                          rec.confidence > 0.7 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                          'bg-slate-500/20 text-slate-300 border-slate-500/30'
                        }>
                          {(rec.confidence * 100).toFixed(0)}% match
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">{rec.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {triageResults.investigation_steps?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-white mb-2">Investigation Steps</h4>
                <ol className="space-y-1 text-xs text-slate-300 list-decimal list-inside">
                  {triageResults.investigation_steps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {triageResults.estimated_mttr_minutes && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Clock className="w-4 h-4" />
                <span>Estimated response time: {triageResults.estimated_mttr_minutes} minutes</span>
              </div>
            )}

            {triageResults.false_positive_indicators?.length > 0 && (
              <div className="p-3 bg-yellow-950/20 border border-yellow-500/30 rounded-lg">
                <h4 className="text-sm font-medium text-yellow-300 mb-2">⚠️ False Positive Indicators</h4>
                <ul className="space-y-1 text-xs text-yellow-200 list-disc list-inside">
                  {triageResults.false_positive_indicators.map((indicator, idx) => (
                    <li key={idx}>{indicator}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              onClick={() => triageMutation.mutate()}
              variant="outline"
              size="sm"
              className="w-full border-slate-700 text-white"
            >
              Re-analyze
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}