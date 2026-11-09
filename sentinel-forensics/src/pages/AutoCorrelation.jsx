import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network, Link as LinkIcon, AlertTriangle, TrendingUp } from 'lucide-react';

export default function AutoCorrelation() {
  const { data: correlations = [], isLoading } = useQuery({
    queryKey: ['auto-correlations'],
    queryFn: async () => {
      try {
        // Find indicators that appear across multiple evidence items
        const allIndicators = await base44.entities.IOCIndicator.list();
        
        const valueMap = {};
        allIndicators.forEach(ind => {
          if (!valueMap[ind.value]) {
            valueMap[ind.value] = [];
          }
          valueMap[ind.value].push(ind);
        });

        const correlations = [];
        Object.entries(valueMap).forEach(([value, indicators]) => {
          if (indicators.length > 1) {
            const evidenceIds = [...new Set(indicators.map(i => i.evidence_id))];
            const caseIds = [...new Set(indicators.map(i => i.case_id))];

            correlations.push({
              value,
              type: indicators[0].indicator_type,
              occurrence_count: indicators.length,
              evidence_count: evidenceIds.length,
              case_count: caseIds.length,
              evidence_ids: evidenceIds,
              case_ids: caseIds,
              indicators,
              first_seen: indicators[0].first_seen,
              last_seen: indicators[indicators.length - 1].last_seen
            });
          }
        });

        return correlations.sort((a, b) => b.occurrence_count - a.occurrence_count);
      } catch {
        return [];
      }
    },
    initialData: []
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Auto-Correlation Engine</h1>
        <p className="text-slate-400">Automatically linked indicators across cases and evidence</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Network className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{correlations.length}</p>
                <p className="text-xs text-slate-400">Correlations Found</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <LinkIcon className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {correlations.filter(c => c.case_count > 1).length}
                </p>
                <p className="text-xs text-slate-400">Cross-Case Links</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {correlations.filter(c => c.occurrence_count >= 5).length}
                </p>
                <p className="text-xs text-slate-400">High Recurrence</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Correlated Indicators</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {correlations.map((corr, idx) => (
              <Card key={idx} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className="bg-purple-500/20 text-purple-400">
                          {corr.type}
                        </Badge>
                        <Badge className={corr.occurrence_count >= 5 ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}>
                          <TrendingUp className="w-3 h-3 mr-1" />
                          {corr.occurrence_count} occurrences
                        </Badge>
                      </div>
                      <p className="text-white font-mono text-sm mb-2">{corr.value}</p>
                      <div className="flex gap-4 text-xs text-slate-400">
                        <span>{corr.evidence_count} evidence items</span>
                        <span>{corr.case_count} cases</span>
                        <span>First: {new Date(corr.first_seen).toLocaleDateString()}</span>
                        <span>Last: {new Date(corr.last_seen).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {correlations.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                No correlations found yet. Upload more evidence to detect patterns.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}