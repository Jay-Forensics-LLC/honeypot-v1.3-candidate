import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Eye, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import EnrichmentDetailDrawer from './EnrichmentDetailDrawer';

export default function EnrichmentResultList({ results, indicators }) {
  const [selectedResult, setSelectedResult] = useState(null);

  const getRiskColor = (score) => {
    if (!score) return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    if (score >= 70) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score >= 40) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  };

  const getRiskLabel = (score) => {
    if (!score) return 'Unknown';
    if (score >= 70) return 'High Risk';
    if (score >= 40) return 'Medium Risk';
    return 'Low Risk';
  };

  const getIndicatorValue = (indicatorId) => {
    const indicator = indicators.find(i => i.id === indicatorId);
    return indicator?.value || 'Unknown';
  };

  const sortedResults = [...results].sort((a, b) => 
    new Date(b.created_date) - new Date(a.created_date)
  );

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Enrichment Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sortedResults.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400">No enrichment results yet</p>
              </div>
            ) : (
              sortedResults.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Shield className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-mono text-sm truncate">
                        {getIndicatorValue(result.indicator_id)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={getRiskColor(result.risk_score)}>
                          {getRiskLabel(result.risk_score)}
                          {result.risk_score !== null && ` (${result.risk_score})`}
                        </Badge>
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                          {result.provider}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          Confidence: {Math.round(result.confidence * 100)}%
                        </span>
                        {result.raw_json_sha256 && (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        )}
                      </div>
                      {result.summary && (
                        <p className="text-sm text-slate-400 mt-1 line-clamp-1">
                          {result.summary}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <p className="text-xs text-slate-400">
                      {format(new Date(result.created_date), 'MMM d, HH:mm')}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedResult(result)}
                      className="border-slate-700"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {selectedResult && (
        <EnrichmentDetailDrawer
          result={selectedResult}
          indicator={indicators.find(i => i.id === selectedResult.indicator_id)}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </>
  );
}