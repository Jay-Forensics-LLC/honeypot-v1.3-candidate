import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shield, AlertTriangle, CheckCircle, TrendingUp, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const CONFIDENCE_COLORS = {
  very_high: { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/50', icon: CheckCircle },
  high: { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/50', icon: TrendingUp },
  moderate: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/50', icon: Shield },
  low: { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/50', icon: AlertTriangle },
  very_low: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/50', icon: AlertTriangle }
};

export default function EvidenceConfidenceCard({ evidenceId }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = React.useState(false);

  const { data: confidenceScore, isLoading } = useQuery({
    queryKey: ['confidence-score', evidenceId],
    queryFn: async () => {
      const scores = await base44.entities.EvidenceConfidenceScore.filter({ evidence_id: evidenceId });
      return scores[0] || null;
    },
    enabled: !!evidenceId
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('calculateEvidenceConfidence', { evidenceId });
      return data.confidence_score;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['confidence-score', evidenceId] });
      toast.success('Confidence score calculated');
    },
    onError: (error) => {
      toast.error('Failed to calculate confidence', { description: error.message });
    }
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  if (!confidenceScore) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Evidence Confidence Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No confidence score calculated yet</p>
            <Button
              onClick={() => calculateMutation.mutate()}
              disabled={calculateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {calculateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Shield className="w-4 h-4 mr-2" />
              )}
              Calculate Confidence Score
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const confidenceConfig = CONFIDENCE_COLORS[confidenceScore.confidence_level];
  const Icon = confidenceConfig.icon;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Evidence Confidence Score
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => calculateMutation.mutate()}
            disabled={calculateMutation.isPending}
            className="border-slate-700"
          >
            {calculateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className={`p-4 rounded-lg border ${confidenceConfig.bg} ${confidenceConfig.border}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon className={`w-6 h-6 ${confidenceConfig.text}`} />
              <div>
                <p className={`text-lg font-bold ${confidenceConfig.text}`}>
                  {confidenceScore.overall_score}/100
                </p>
                <p className={`text-xs ${confidenceConfig.text}`}>
                  {confidenceScore.confidence_level.replace('_', ' ').toUpperCase()}
                </p>
              </div>
            </div>
            <Badge className={confidenceConfig.bg + ' ' + confidenceConfig.text}>
              v{confidenceScore.scoring_version}
            </Badge>
          </div>
          <Progress value={confidenceScore.overall_score} className="h-2" />
        </div>

        {/* Component Scores */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-300">Score Breakdown</p>
          {Object.entries(confidenceScore.component_scores).map(([key, value]) => (
            <div key={key} className="bg-slate-800/50 p-3 rounded">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-slate-300 capitalize">
                  {key.replace('_', ' ')}
                </span>
                <span className="text-sm font-semibold text-white">{value}/25</span>
              </div>
              <Progress value={(value / 25) * 100} className="h-1" />
            </div>
          ))}
        </div>

        {/* Expandable Details */}
        <Button
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-slate-400 hover:text-white"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-2" />
              Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-2" />
              Show Details
            </>
          )}
        </Button>

        {expanded && (
          <div className="space-y-4 pt-2 border-t border-slate-800">
            {/* Strengths */}
            {confidenceScore.strengths?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-green-300 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Strengths ({confidenceScore.strengths.length})
                </p>
                <div className="space-y-1">
                  {confidenceScore.strengths.map((strength, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-green-400">✓</span>
                      <span>{strength}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Flags */}
            {confidenceScore.risk_flags?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-yellow-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Risk Flags ({confidenceScore.risk_flags.length})
                </p>
                <div className="space-y-1">
                  {confidenceScore.risk_flags.map((risk, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-yellow-400">⚠</span>
                      <span>{risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {confidenceScore.recommendations?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Recommendations ({confidenceScore.recommendations.length})
                </p>
                <div className="space-y-1">
                  {confidenceScore.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-blue-400">→</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="pt-2 border-t border-slate-800 text-xs text-slate-500">
              <p>Scored: {new Date(confidenceScore.scored_at).toLocaleString()}</p>
              <p>By: {confidenceScore.scored_by}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}