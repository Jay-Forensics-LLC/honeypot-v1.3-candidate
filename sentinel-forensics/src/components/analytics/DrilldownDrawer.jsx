import React from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

export default function DrilldownDrawer({ 
  open, 
  onClose, 
  title, 
  data, 
  page, 
  totalPages, 
  onPageChange 
}) {
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[70vh]">
          <div className="space-y-3">
            {data.map((item, idx) => (
              <div key={idx} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-white">{item.title || item.finding_type || 'Unknown'}</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      ID: <code>{item.id}</code>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={getSeverityColor(item.severity)}>
                      {item.severity || 'unknown'}
                    </Badge>
                    {item.confidence !== undefined && (
                      <Badge variant="outline">
                        Conf: {Math.round(item.confidence * 100)}%
                      </Badge>
                    )}
                  </div>
                </div>

                {item.description && (
                  <p className="text-sm text-slate-300 mb-2">{item.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Created: </span>
                    <span className="text-white">{format(new Date(item.created_date), 'MMM d, HH:mm')}</span>
                  </div>
                  {item.case_id && (
                    <div>
                      <span className="text-slate-400">Case: </span>
                      <code className="text-white text-xs">{item.case_id.substring(0, 8)}</code>
                    </div>
                  )}
                </div>

                {item.evidence_refs?.artifact_ids?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-400">Evidence refs: {item.evidence_refs.artifact_ids.length}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="border-slate-700"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-slate-400">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="border-slate-700"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getSeverityColor(severity) {
  const colors = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/50',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    info: 'bg-slate-500/20 text-slate-400 border-slate-500/50'
  };
  return colors[severity] || colors.info;
}