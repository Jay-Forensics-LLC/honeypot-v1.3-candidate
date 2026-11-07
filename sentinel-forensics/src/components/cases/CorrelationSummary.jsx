import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, TrendingUp, AlertCircle } from 'lucide-react';

export default function CorrelationSummary({ caseId }) {
  const { data: evidence = [] } = useQuery({
    queryKey: ['case-evidence', caseId],
    queryFn: () => base44.entities.EvidenceV2.filter({ case_id: caseId }),
    enabled: !!caseId
  });

  const { data: correlations = [] } = useQuery({
    queryKey: ['case-correlations', caseId],
    queryFn: async () => {
      if (evidence.length === 0) return [];
      const evidenceIds = evidence.map(e => e.id);
      const allCorrelations = await base44.entities.EvidenceCorrelation.filter({});
      return allCorrelations.filter(c => evidenceIds.includes(c.evidence_id));
    },
    enabled: evidence.length > 0
  });

  if (correlations.length === 0) return null;

  const uniqueExternalCases = [...new Set(correlations.map(c => c.matched_case_id))].length;
  const matchTypes = [...new Set(correlations.map(c => c.correlation_type))];
  const highConfidenceMatches = correlations.filter(c => c.confidence_score >= 0.9).length;

  return (
    <Card className="bg-gradient-to-r from-cyan-900/20 to-purple-900/20 border-cyan-500/30">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-cyan-400" />
          Cross-Case Pattern Detection
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-cyan-400">{correlations.length}</p>
            <p className="text-xs text-slate-400">Total Matches</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-purple-400">{uniqueExternalCases}</p>
            <p className="text-xs text-slate-400">Other Cases</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-400">{highConfidenceMatches}</p>
            <p className="text-xs text-slate-400">High Confidence</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-400">{matchTypes.length}</p>
            <p className="text-xs text-slate-400">Match Types</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {matchTypes.map(type => (
            <Badge key={type} className="bg-slate-800 border-slate-700 text-slate-300">
              {type.replace('_', ' ')}
            </Badge>
          ))}
        </div>

        <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-cyan-200">
              <strong>Insight:</strong> This case shares {correlations.length} artifacts with {uniqueExternalCases} other case{uniqueExternalCases !== 1 ? 's' : ''}. 
              Review individual evidence items for detailed correlation analysis.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}