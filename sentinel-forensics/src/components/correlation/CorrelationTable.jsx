import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Network, ArrowRight, Filter, SlidersHorizontal } from 'lucide-react';
import CorrelationRiskView from './CorrelationRiskView';

export default function CorrelationTable({ caseId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [minRisk, setMinRisk] = useState(0);
  const [maxRisk, setMaxRisk] = useState(100);
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const { data: correlations = [], isLoading } = useQuery({
    queryKey: ['correlations', caseId],
    queryFn: async () => {
      const corr = await base44.entities.CorrelationGraph.list();
      return corr.filter(c => c.metadata?.case_id === caseId);
    },
    enabled: !!caseId
  });

  const { data: assessments = [] } = useQuery({
    queryKey: ['all-risk-assessments', caseId],
    queryFn: () => base44.entities.CorrelationRiskAssessment.filter({ case_id: caseId }),
    enabled: !!caseId
  });

  // Join correlations with latest risk scores
  const enrichedCorrelations = correlations.map(corr => {
    const corrAssessments = assessments.filter(a => a.correlation_id === corr.id);
    const latest = corrAssessments.sort((a, b) => 
      new Date(b.scored_at).getTime() - new Date(a.scored_at).getTime()
    )[0];
    return { ...corr, latestRisk: latest };
  });

  // Apply filters
  const filtered = enrichedCorrelations.filter(corr => {
    const riskScore = corr.latestRisk?.risk_score ?? 0;
    const confidenceBand = corr.latestRisk?.risk_confidence_band ?? 'low';
    
    if (riskScore < minRisk || riskScore > maxRisk) return false;
    if (confidenceFilter !== 'all' && confidenceBand !== confidenceFilter) return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        corr.metadata?.observable_value?.toLowerCase().includes(q) ||
        corr.source_id?.toLowerCase().includes(q)
      );
    }
    
    return true;
  });

  // Sort by risk score desc
  const sorted = filtered.sort((a, b) => 
    (b.latestRisk?.risk_score ?? 0) - (a.latestRisk?.risk_score ?? 0)
  );

  if (isLoading) {
    return <div className="text-slate-400">Loading correlations...</div>;
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-red-400" />
            IOC Correlations ({sorted.length})
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showFilters && (
          <div className="grid md:grid-cols-3 gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Search Observable</label>
              <Input
                placeholder="IP, domain, hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Min Risk Score</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={minRisk}
                onChange={(e) => setMinRisk(parseInt(e.target.value))}
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Confidence Band</label>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value)}
                className="w-full h-10 px-3 rounded bg-slate-900 border border-slate-700 text-white"
              >
                <option value="all">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="text-center py-12">
            <Network className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No correlations found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map(corr => (
              <div key={corr.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-500/20 text-blue-400">
                        {corr.metadata?.observable_type || 'unknown'}
                      </Badge>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <span className="text-white font-mono text-sm">
                        {corr.metadata?.observable_value || 'N/A'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                      <div>Source: {corr.metadata?.ioc_source || 'Unknown'}</div>
                      <div>Matched: {new Date(corr.metadata?.matched_at || corr.created_date).toLocaleString()}</div>
                      {corr.metadata?.ioc_source && (
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {corr.correlation_type}
                          </Badge>
                          <span>• {corr.confidence}% confidence</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <CorrelationRiskView correlationId={corr.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}