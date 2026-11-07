import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { format } from 'date-fns';

const statusIcons = {
  queued: Clock,
  running: Loader2,
  success: CheckCircle2,
  failed: XCircle,
  canceled: XCircle
};

const statusColors = {
  queued: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  success: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  canceled: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
};

export default function EnrichmentRunHistoryTable({ runs }) {
  const sortedRuns = [...runs].sort((a, b) => 
    new Date(b.started_at) - new Date(a.started_at)
  );

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white">Enrichment Runs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sortedRuns.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400">No enrichment runs yet</p>
            </div>
          ) : (
            sortedRuns.map((run) => {
              const StatusIcon = statusIcons[run.status] || Clock;
              return (
                <div
                  key={run.id}
                  className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon className={`w-5 h-5 ${run.status === 'running' ? 'animate-spin' : ''} text-slate-400`} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-medium">
                          {run.run_type.replace(/_/g, ' ').toUpperCase()}
                        </p>
                        <Badge className={statusColors[run.status]}>
                          {run.status}
                        </Badge>
                        {run.court_admissible_mode && (
                          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                            Court Admissible
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span>Provider: {run.provider}</span>
                        <span>Indicators: {run.input_indicator_ids.length}</span>
                        <span>Started: {format(new Date(run.started_at), 'MMM d, HH:mm:ss')}</span>
                        {run.finished_at && (
                          <span>Finished: {format(new Date(run.finished_at), 'MMM d, HH:mm:ss')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-mono">
                      {run.run_fingerprint.slice(0, 12)}...
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}