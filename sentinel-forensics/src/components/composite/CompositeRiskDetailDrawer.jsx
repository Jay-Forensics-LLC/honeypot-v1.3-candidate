import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Shield, FileText, Activity, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function CompositeRiskDetailDrawer({ finding, caseId, onClose }) {
  const [status, setStatus] = React.useState(finding?.reviewed_status || 'unreviewed');
  const [notes, setNotes] = React.useState(finding?.analyst_notes || '');
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({
    queryKey: ['finding-events', finding?.id],
    queryFn: async () => {
      if (!finding?.evidence_refs?.event_ids) return [];
      const allEvents = await base44.entities.NormalizedEvent.filter({ case_id: caseId });
      return allEvents.filter(e => finding.evidence_refs.event_ids.includes(e.id));
    },
    enabled: !!finding
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.CompositeRiskFinding.update(finding.id, {
        reviewed_status: status,
        analyst_notes: notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['composite-risk-findings', caseId] });
      toast.success('Finding updated');
    }
  });

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      info: 'bg-slate-500/20 text-slate-400 border-slate-500/30'
    };
    return colors[severity] || colors.info;
  };

  if (!finding) return null;

  return (
    <Dialog open={!!finding} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#EF4444]" />
            Composite Risk Finding Detail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Header Info */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">{finding.title}</h3>
            <div className="flex items-center gap-2 mb-3">
              <Badge className={getSeverityColor(finding.severity)}>
                {finding.severity.toUpperCase()}
              </Badge>
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                {finding.finding_type}
              </Badge>
              <span className="text-sm text-slate-400">
                Score: {finding.risk_score}/100 | Confidence: {Math.round(finding.confidence * 100)}%
              </span>
            </div>
            <p className="text-slate-300">{finding.description}</p>
          </div>

          {/* Rationale */}
          {finding.rationale && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Analysis Rationale
              </h3>
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">
                  {finding.rationale}
                </pre>
              </div>
            </div>
          )}

          {/* Confidence Explanation */}
          {finding.confidence_explain && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Confidence Assessment</h3>
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-300">{finding.confidence_explain}</p>
              </div>
            </div>
          )}

          {/* Recommended Actions */}
          {finding.recommended_actions?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Recommended Actions
              </h3>
              <div className="space-y-2">
                {finding.recommended_actions.map((action, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <span className="text-[#EF4444] font-bold">{idx + 1}.</span>
                    <span className="text-sm text-slate-300">{action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence Summary */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Evidence Summary
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400">Events Analyzed</p>
                <p className="text-2xl font-bold text-white mt-1">{events.length}</p>
              </div>
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400">Fields Used</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {finding.evidence_refs?.fields_used?.length || 0}
                </p>
              </div>
            </div>
            {finding.evidence_refs?.time_range && (
              <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Time Range</p>
                <p className="text-sm text-white mt-1">
                  {format(new Date(finding.evidence_refs.time_range.start), 'MMM d, yyyy HH:mm')} - {' '}
                  {format(new Date(finding.evidence_refs.time_range.end), 'MMM d, yyyy HH:mm')}
                </p>
              </div>
            )}
          </div>

          {/* Sample Events */}
          {events.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Sample Events ({events.slice(0, 5).length} of {events.length})</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {events.slice(0, 5).map((event) => (
                  <div key={event.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        {event.event_type}
                      </Badge>
                      <span className="text-slate-500">
                        {format(new Date(event.event_time), 'MMM d, HH:mm:ss')}
                      </span>
                    </div>
                    {event.src_ip && <p className="text-slate-400">IP: {event.src_ip}</p>}
                    {event.actor_user && <p className="text-slate-400">User: {event.actor_user}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review Section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Analyst Review</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Status</label>
                <div className="flex gap-2">
                  {['unreviewed', 'reviewed', 'dismissed'].map(s => (
                    <Button
                      key={s}
                      size="sm"
                      variant={status === s ? 'default' : 'outline'}
                      onClick={() => setStatus(s)}
                      className={status === s ? 'bg-[#EF4444]' : 'border-slate-700'}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Notes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add analyst notes..."
                  className="bg-slate-800 border-slate-700 text-white"
                  rows={4}
                />
              </div>
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="w-full bg-[#EF4444] hover:bg-[#DC2626]"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Review'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}