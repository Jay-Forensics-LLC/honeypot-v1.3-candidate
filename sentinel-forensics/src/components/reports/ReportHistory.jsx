import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Download, Lock, Clock, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function ReportHistory({ runs = [] }) {
  if (runs.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-12 text-center">
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No reports generated yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map(run => (
        <Card key={run.id} className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {run.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                {run.status === 'generating' && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
                {run.status === 'failed' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white font-semibold">{run.report_title}</p>
                    {run.sealed && <Lock className="w-4 h-4 text-yellow-500" />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{run.report_number}</span>
                    <span>•</span>
                    <Clock className="w-3 h-3" />
                    <span>{formatDistanceToNow(new Date(run.created_date), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={
                  run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  run.status === 'generating' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-red-500/20 text-red-400'
                }>
                  {run.status}
                </Badge>
                {run.status === 'completed' && (
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}