import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, Shield, Hash } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function CorrelationRiskView({ correlationId }) {
  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ['correlation-risk', correlationId],
    queryFn: () => base44.entities.CorrelationRiskAssessment.filter({ 
      correlation_id: correlationId 
    }),
    enabled: !!correlationId
  });

  // Get latest assessment
  const latest = assessments.sort((a, b) => 
    new Date(b.scored_at).getTime() - new Date(a.scored_at).getTime()
  )[0];

  if (isLoading) {
    return <div className="text-slate-400 text-sm">Loading risk score...</div>;
  }

  if (!latest) {
    return (
      <Badge className="bg-slate-500/20 text-slate-400">
        Not scored
      </Badge>
    );
  }

  const getRiskColor = (score) => {
    if (score >= 80) return 'bg-red-500/20 text-red-400 border-red-500/50';
    if (score >= 60) return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
    if (score >= 40) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
  };

  const getConfidenceColor = (band) => {
    const colors = {
      high: 'bg-green-500/20 text-green-400',
      medium: 'bg-yellow-500/20 text-yellow-400',
      low: 'bg-red-500/20 text-red-400'
    };
    return colors[band] || colors.medium;
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-400" />
          Risk Assessment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-white">{latest.risk_score}</p>
            <p className="text-xs text-slate-400">Risk Score</p>
          </div>
          <Badge className={getConfidenceColor(latest.risk_confidence_band)}>
            {latest.risk_confidence_band} confidence
          </Badge>
        </div>

        {latest.risk_explain?.explanation_text && (
          <div className="bg-slate-900/50 rounded p-3">
            <p className="text-xs text-slate-300">{latest.risk_explain.explanation_text}</p>
          </div>
        )}

        {latest.risk_explain?.top_factors && latest.risk_explain.top_factors.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-1">Top Factors:</p>
            <div className="flex flex-wrap gap-1">
              {latest.risk_explain.top_factors.map((factor, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {factor}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {latest.risk_components && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Source</p>
              <p className="text-white">{latest.risk_components.source_reliability}/100</p>
            </div>
            <div>
              <p className="text-slate-500">Recency</p>
              <p className="text-white">{latest.risk_components.recency}/100</p>
            </div>
            <div>
              <p className="text-slate-500">Match</p>
              <p className="text-white">{latest.risk_components.match_strength}/100</p>
            </div>
            <div>
              <p className="text-slate-500">Feed Signals</p>
              <p className="text-white">{latest.risk_components.feed_signals}/100</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Hash className="w-3 h-3" />
          <span className="font-mono">{latest.risk_inputs_hash.substring(0, 16)}...</span>
          <span>• v{latest.risk_model_version}</span>
        </div>

        {assessments.length > 1 && (
          <div className="text-xs text-slate-500">
            {assessments.length} assessments in history
          </div>
        )}
      </CardContent>
    </Card>
  );
}