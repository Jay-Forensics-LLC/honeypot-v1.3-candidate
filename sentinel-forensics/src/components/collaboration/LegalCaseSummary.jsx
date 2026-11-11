import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Scale,
  FileText,
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';

export default function LegalCaseSummary({ caseId, viewMode = 'legal' }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['case-summary', caseId, viewMode],
    queryFn: () => base44.functions.invoke('getLegalCaseSummary', {
      case_id: caseId,
      view_mode: viewMode
    }).then(res => res.data),
    staleTime: 300000 // 5 minutes
  });

  const summary = data?.summary;

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-400 mb-4" />
          <p className="text-slate-400">Generating {viewMode} summary...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            {viewMode === 'legal' ? (
              <Scale className="w-5 h-5 text-blue-400" />
            ) : (
              <FileText className="w-5 h-5 text-purple-400" />
            )}
            {viewMode === 'legal' ? 'Legal Summary' : 'Technical Summary'}
          </CardTitle>
          <Button
            onClick={() => refetch()}
            size="sm"
            variant="outline"
            className="border-slate-700"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {viewMode === 'legal' && summary ? (
          <>
            <div>
              <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                Executive Summary
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">{summary.executive_summary}</p>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-2">Evidence Overview</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{summary.evidence_overview}</p>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-2">Chain of Custody</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{summary.chain_of_custody_status}</p>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-2">Legal Readiness</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{summary.legal_readiness}</p>
            </div>

            {summary.admissibility_concerns?.length > 0 && (
              <div>
                <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  Admissibility Concerns
                </h3>
                <div className="space-y-2">
                  {summary.admissibility_concerns.map((concern, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-300">{concern}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.recommended_actions?.length > 0 && (
              <div>
                <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  Recommended Actions
                </h3>
                <div className="space-y-1">
                  {summary.recommended_actions.map((action, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-blue-400">•</span>
                      <span className="text-slate-300">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : viewMode === 'technical' && summary ? (
          <>
            <div>
              <h3 className="text-white font-semibold mb-2">Technical Overview</h3>
              <p className="text-slate-300 text-sm leading-relaxed font-mono">{summary.technical_overview}</p>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-2">Evidence Analysis</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{summary.evidence_analysis}</p>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-2">Integrity Status</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{summary.integrity_status}</p>
            </div>

            {summary.identified_patterns?.length > 0 && (
              <div>
                <h3 className="text-white font-semibold mb-2">Identified Patterns</h3>
                <div className="space-y-1">
                  {summary.identified_patterns.map((pattern, idx) => (
                    <Badge key={idx} className="bg-purple-500/20 text-purple-300 mr-2">
                      {pattern}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {summary.recommended_forensic_actions?.length > 0 && (
              <div>
                <h3 className="text-white font-semibold mb-2">Recommended Forensic Actions</h3>
                <div className="space-y-1">
                  {summary.recommended_forensic_actions.map((action, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-purple-400">•</span>
                      <span className="text-slate-300">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}