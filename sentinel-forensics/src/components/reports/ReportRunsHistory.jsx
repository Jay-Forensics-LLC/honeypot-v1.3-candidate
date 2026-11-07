import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Download, CheckCircle, XCircle, Loader2, Calendar, User, Lock } from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import ReportReviewPanel from './ReportReviewPanel';
import ReportLockIndicator from './ReportLockIndicator';

export default function ReportRunsHistory({ caseId }) {
  const { data: runs = [] } = useQuery({
    queryKey: ['report-runs', caseId],
    queryFn: async () => {
      const allRuns = await base44.entities.ReportRun.filter({});
      
      // Filter by case (get definitions first)
      const definitions = await base44.entities.ReportDefinition.filter({ case_id: caseId });
      const defIds = definitions.map(d => d.id);
      
      return allRuns
        .filter(r => defIds.includes(r.definition_id))
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    },
    enabled: !!caseId
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'running': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      default: return <Loader2 className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'bg-green-500/20 text-green-300';
      case 'failed': return 'bg-red-500/20 text-red-300';
      case 'running': return 'bg-blue-500/20 text-blue-300';
      default: return 'bg-slate-500/20 text-slate-300';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white">Report Runs History</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No report runs yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <Card key={run.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusIcon(run.status)}
                        <Badge className={getStatusColor(run.status)}>
                          {run.status}
                        </Badge>
                        <Badge className="bg-purple-500/20 text-purple-300">
                          {run.run_type}
                        </Badge>
                        <ReportLockIndicator run={run} showDetails />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-slate-500">Started</p>
                          <p className="text-slate-300 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {DateUtils.safeFormatDateTime(run.started_at)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Triggered By</p>
                          <p className="text-slate-300 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {run.triggered_by}
                          </p>
                        </div>
                        {run.evidence_snapshot && (
                          <div>
                            <p className="text-slate-500">Evidence</p>
                            <p className="text-slate-300">{run.evidence_snapshot.evidence_count} items</p>
                          </div>
                        )}
                        {run.completed_at && (
                          <div>
                            <p className="text-slate-500">Duration</p>
                            <p className="text-slate-300">
                              {Math.round((new Date(run.completed_at) - new Date(run.started_at)) / 1000)}s
                            </p>
                          </div>
                        )}
                      </div>

                      {run.error_message && (
                        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
                          Error: {run.error_message}
                        </div>
                      )}
                    </div>

                    {run.status === 'success' && run.output_files?.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {run.output_files.map((file, idx) => (
                          <Button
                            key={idx}
                            size="sm"
                            variant="outline"
                            className="border-blue-500/50 text-blue-300"
                            disabled={!file.file_url}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            {file.format.toUpperCase()}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}