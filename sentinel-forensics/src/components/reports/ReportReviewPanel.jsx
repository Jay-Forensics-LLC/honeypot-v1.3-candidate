import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, Lock, CheckCircle, XCircle, Calendar, Loader2, User } from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';

export default function ReportReviewPanel({ run, onUpdate }) {
  const queryClient = useQueryClient();
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [reviewer, setReviewer] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');

  const { data: reviewRequest } = useQuery({
    queryKey: ['review-request', run?.id],
    queryFn: async () => {
      const requests = await base44.entities.ReportReviewRequest.filter({
        report_run_id: run.id
      });
      return requests[0] || null;
    },
    enabled: !!run?.id
  });

  const { data: decision } = useQuery({
    queryKey: ['review-decision', reviewRequest?.id],
    queryFn: async () => {
      const decisions = await base44.entities.ReportReviewDecision.filter({
        review_request_id: reviewRequest.id
      });
      return decisions[0] || null;
    },
    enabled: !!reviewRequest?.id
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('manageReportReview', {
        action: 'request_review',
        reportRunId: run.id,
        reviewer,
        deadline: deadline || null,
        notes
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-request', run.id] });
      queryClient.invalidateQueries({ queryKey: ['report-runs'] });
      setShowRequestDialog(false);
      toast.success('Review requested');
      onUpdate?.();
    }
  });

  const lockMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('manageReportReview', {
        action: 'lock_final',
        reportRunId: run.id
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-runs'] });
      toast.success('Report locked as final - immutable artifact created');
      onUpdate?.();
    },
    onError: (error) => {
      toast.error('Failed to lock report', { description: error.message });
    }
  });

  const getStateColor = (state) => {
    switch (state) {
      case 'draft': return 'bg-slate-500/20 text-slate-300';
      case 'under_review': return 'bg-yellow-500/20 text-yellow-300';
      case 'approved': return 'bg-green-500/20 text-green-300';
      case 'rejected': return 'bg-red-500/20 text-red-300';
      case 'locked_final': return 'bg-blue-500/20 text-blue-300 border border-blue-500/50';
      default: return 'bg-slate-500/20 text-slate-300';
    }
  };

  if (!run) return null;

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-sm text-slate-400">Review Status</p>
                <Badge className={getStateColor(run.review_state)}>
                  {run.is_locked_final && <Lock className="w-3 h-3 mr-1" />}
                  {run.review_state?.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </div>

            <div className="flex gap-2">
              {run.review_state === 'draft' && (
                <Button
                  size="sm"
                  onClick={() => setShowRequestDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Request Review
                </Button>
              )}

              {run.review_state === 'approved' && !run.is_locked_final && (
                <Button
                  size="sm"
                  onClick={() => lockMutation.mutate()}
                  disabled={lockMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {lockMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Lock className="w-3 h-3 mr-1" />
                  )}
                  Lock Final
                </Button>
              )}
            </div>
          </div>

          {reviewRequest && (
            <div className="mt-4 pt-4 border-t border-slate-700 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <User className="w-3 h-3 text-slate-500" />
                <span className="text-slate-400">Reviewer:</span>
                <span className="text-white">{reviewRequest.reviewer}</span>
              </div>
              {reviewRequest.deadline && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-400">Deadline:</span>
                  <span className="text-white">{DateUtils.safeFormatDateTime(reviewRequest.deadline)}</span>
                </div>
              )}
              {reviewRequest.request_notes && (
                <div>
                  <p className="text-slate-400 mb-1">Request Notes:</p>
                  <p className="text-slate-300">{reviewRequest.request_notes}</p>
                </div>
              )}
            </div>
          )}

          {decision && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="flex items-start gap-3">
                {decision.decision === 'approved' ? (
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-white mb-1">
                    {decision.decision === 'approved' ? 'Approved' : 'Rejected'} by {decision.decided_by}
                  </p>
                  <p className="text-xs text-slate-400">
                    {DateUtils.safeFormatDateTime(decision.decided_at)}
                  </p>
                  {decision.comments && (
                    <div className="mt-2 p-2 bg-slate-800 rounded text-xs text-slate-300">
                      {decision.comments}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {run.is_locked_final && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="text-blue-200 font-medium mb-1">Locked Final Artifact</p>
                    <p className="text-blue-300">
                      Finalized {DateUtils.safeFormatDateTime(run.finalized_at)} by {run.finalized_by}
                    </p>
                    <p className="text-blue-400 mt-1">
                      This report is immutable. Any modifications require generating a new version.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Request Report Review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Reviewer Email *</Label>
              <Input
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="attorney@example.com"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-slate-300">Deadline (Optional)</Label>
              <Input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-slate-300">Review Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context or instructions for reviewer..."
                className="bg-slate-800 border-slate-700 text-white mt-1 h-24"
              />
            </div>

            <div className="pt-4 border-t border-slate-700">
              <Button
                onClick={() => requestMutation.mutate()}
                disabled={!reviewer.trim() || requestMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {requestMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending Request...
                  </>
                ) : (
                  'Send Review Request'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}