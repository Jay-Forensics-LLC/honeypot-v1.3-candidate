import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Loader2, RefreshCw, ExternalLink, AlertTriangle, Hash, Wifi, Globe, Monitor, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

const CORRELATION_CONFIG = {
  hash_match: { icon: Hash, color: 'text-purple-400', label: 'Hash Match', confidence: 1.0 },
  mac_match: { icon: Wifi, color: 'text-blue-400', label: 'MAC Address', confidence: 0.9 },
  uuid_match: { icon: Hash, color: 'text-green-400', label: 'UUID Match', confidence: 0.95 },
  ip_match: { icon: Globe, color: 'text-orange-400', label: 'IP Address', confidence: 0.85 },
  domain_match: { icon: Globe, color: 'text-cyan-400', label: 'Domain', confidence: 0.8 },
  device_id_match: { icon: Monitor, color: 'text-pink-400', label: 'Device ID', confidence: 0.9 }
};

export default function CrossCaseCorrelation({ evidenceId }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = React.useState(false);

  const { data: correlations = [], isLoading } = useQuery({
    queryKey: ['evidence-correlations', evidenceId],
    queryFn: async () => {
      const items = await base44.entities.EvidenceCorrelation.filter({ evidence_id: evidenceId });
      return items;
    },
    enabled: !!evidenceId
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['correlation-cases', correlations.map(c => c.matched_case_id)],
    queryFn: async () => {
      if (correlations.length === 0) return [];
      const caseIds = [...new Set(correlations.map(c => c.matched_case_id))];
      const caseData = await base44.entities.Case.filter({});
      return caseData.filter(c => caseIds.includes(c.id));
    },
    enabled: correlations.length > 0
  });

  const runCorrelationMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('correlateEvidence', { evidenceId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-correlations', evidenceId] });
      toast.success('Correlation analysis complete');
    },
    onError: (error) => {
      toast.error('Correlation failed', { description: error.message });
    }
  });

  const matchedCaseIds = [...new Set(correlations.map(c => c.matched_case_id))];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-cyan-400" />
            Cross-Case Correlations
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runCorrelationMutation.mutate()}
            disabled={runCorrelationMutation.isPending}
            className="border-slate-700"
          >
            {runCorrelationMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : correlations.length === 0 ? (
          <div className="text-center py-8">
            <GitBranch className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No correlations detected yet</p>
            <Button
              onClick={() => runCorrelationMutation.mutate()}
              disabled={runCorrelationMutation.isPending}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {runCorrelationMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <GitBranch className="w-4 h-4 mr-2" />
              )}
              Run Correlation Analysis
            </Button>
            <p className="text-xs text-slate-500 mt-3">
              Detects recurring artifacts (hashes, IPs, MACs, UUIDs) across other cases
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-slate-800/50 p-3 rounded">
                <p className="text-2xl font-bold text-cyan-400">{correlations.length}</p>
                <p className="text-xs text-slate-400">Total Matches</p>
              </div>
              <div className="bg-slate-800/50 p-3 rounded">
                <p className="text-2xl font-bold text-purple-400">{matchedCaseIds.length}</p>
                <p className="text-xs text-slate-400">Other Cases</p>
              </div>
              <div className="bg-slate-800/50 p-3 rounded">
                <p className="text-2xl font-bold text-blue-400">
                  {[...new Set(correlations.map(c => c.correlation_type))].length}
                </p>
                <p className="text-xs text-slate-400">Match Types</p>
              </div>
            </div>

            {/* Correlation Types Summary */}
            <div className="flex flex-wrap gap-2">
              {[...new Set(correlations.map(c => c.correlation_type))].map(type => {
                const config = CORRELATION_CONFIG[type];
                const Icon = config.icon;
                const count = correlations.filter(c => c.correlation_type === type).length;
                return (
                  <Badge key={type} className="bg-slate-800 border-slate-700">
                    <Icon className={`w-3 h-3 mr-1 ${config.color}`} />
                    {config.label} ({count})
                  </Badge>
                );
              })}
            </div>

            {/* Expand/Collapse */}
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
                  Show {correlations.length} Matches
                </>
              )}
            </Button>

            {/* Detailed Matches */}
            {expanded && (
              <div className="space-y-3 pt-2 border-t border-slate-800">
                {correlations.map((corr, idx) => {
                  const config = CORRELATION_CONFIG[corr.correlation_type];
                  const Icon = config.icon;
                  const matchedCase = cases.find(c => c.id === corr.matched_case_id);

                  return (
                    <Card key={idx} className="bg-slate-800/50 border-slate-700">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            <Icon className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-semibold text-white">
                                  {config.label}
                                </p>
                                <Badge className="bg-blue-500/20 text-blue-300 text-xs">
                                  {Math.round(corr.confidence_score * 100)}% confidence
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-400 mb-2">
                                Match: <span className="font-mono text-cyan-300">{corr.match_value}</span>
                              </p>
                              {matchedCase && (
                                <Link to={createPageUrl(`CaseDetail?id=${matchedCase.id}`)}>
                                  <p className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                    Case {matchedCase.case_number}: {matchedCase.title}
                                    <ExternalLink className="w-3 h-3" />
                                  </p>
                                </Link>
                              )}
                              <p className="text-xs text-slate-500 mt-1">
                                {corr.detection_metadata?.matched_title}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Warning */}
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-200">
                  <strong>Pattern Detection:</strong> Recurring artifacts may indicate repeat actors, shared infrastructure, or campaign activity. Correlations are read-only and auditable.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}