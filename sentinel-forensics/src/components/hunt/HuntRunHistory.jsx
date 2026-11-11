import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function HuntRunHistory({ runs }) {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'running': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'queued': return <Clock className="w-4 h-4 text-slate-400" />;
      default: return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400';
      case 'failed': return 'bg-red-500/20 text-red-400';
      case 'running': return 'bg-blue-500/20 text-blue-400';
      case 'queued': return 'bg-slate-700 text-slate-400';
      default: return 'bg-slate-700 text-slate-400';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white">Hunt Run History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {runs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No hunt runs yet
            </div>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className="p-3 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(run.status)}
                    <span className="text-sm font-semibold text-white">
                      {run.run_id}
                    </span>
                    <Badge className={getStatusColor(run.status)}>
                      {run.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-slate-500">
                    {format(new Date(run.created_date), 'MMM d, h:mm a')}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-slate-500">Findings</p>
                    <p className="text-white font-semibold">{run.findings_count || 0}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Duration</p>
                    <p className="text-white font-semibold">
                      {run.duration_ms ? `${Math.round(run.duration_ms / 1000)}s` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Scope</p>
                    <p className="text-white font-semibold">{run.scope}</p>
                  </div>
                </div>

                {run.error_message && (
                  <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded">
                    <p className="text-xs text-red-300">{run.error_message}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}