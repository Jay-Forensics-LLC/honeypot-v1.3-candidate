import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, CheckCircle, XCircle, Calendar, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { DateUtils } from '../components/utils/DateUtils';
import { toast } from 'sonner';

export default function ReviewerInbox() {
  const queryClient = useQueryClient();
  const [selectedReview, setSelectedReview] = useState(null);
  const [decision, setDecision] = useState('');
  const [comments, setComments] = useState('');

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['pending-reviews'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('manageReportReview', {
        action: 'list_pending_reviews'
      });
      return data.reviews || [];
    }
  });

  const decideMutation = useMutation({
    mutationFn: async ({ reviewRequestId, decision, comments }) => {
      const { data } = await base44.functions.invoke('manageReportReview', {
        action: 'submit_decision',
        reviewRequestId,
        decision,
        comments
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
      setSelectedReview(null);
      setComments('');
      toast.success('Review submitted');
    },
    onError: (error) => {
      toast.error('Failed to submit review', { description: error.message });
    }
  });

  const handleSubmitDecision = () => {
    if (decision === 'rejected' && !comments.trim()) {
      toast.error('Comments required for rejection');
      return;
    }

    decideMutation.mutate({
      reviewRequestId: selectedReview.id,
      decision,
      comments
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Reviewer Inbox</h1>
          <p className="text-slate-400">Pending report review requests assigned to you</p>
        </div>

        {reviews.length === 0 ? (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-12 text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <h2 className="text-xl font-semibold text-white mb-2">No Pending Reviews</h2>
              <p className="text-slate-400">All reports have been reviewed</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => {
              const isOverdue = review.deadline && new Date(review.deadline) < new Date();

              return (
                <Card key={review.id} className="bg-slate-900 border-slate-800">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <FileText className="w-5 h-5 text-blue-400" />
                          <h3 className="text-lg font-semibold text-white">
                            {review.definition?.name || 'Report Review'}
                          </h3>
                          {isOverdue && (
                            <Badge className="bg-red-500/20 text-red-300 animate-pulse">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Overdue
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                          <div>
                            <p className="text-slate-500">Case</p>
                            <p className="text-white font-mono">
                              {review.case?.case_number || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Requested By</p>
                            <p className="text-white">{review.requested_by}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Requested</p>
                            <p className="text-white">{DateUtils.safeFormatDate(review.requested_at)}</p>
                          </div>
                          {review.deadline && (
                            <div>
                              <p className="text-slate-500">Deadline</p>
                              <p className={isOverdue ? 'text-red-300' : 'text-white'}>
                                {DateUtils.safeFormatDate(review.deadline)}
                              </p>
                            </div>
                          )}
                        </div>

                        {review.request_notes && (
                          <div className="p-3 bg-slate-800 rounded-lg">
                            <p className="text-xs text-slate-400 mb-1">Request Notes</p>
                            <p className="text-sm text-slate-200">{review.request_notes}</p>
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={() => {
                          setSelectedReview(review);
                          setDecision('');
                          setComments('');
                        }}
                        className="bg-blue-600 hover:bg-blue-700 ml-4"
                      >
                        Review
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Decision Dialog */}
      <Dialog open={!!selectedReview} onOpenChange={() => setSelectedReview(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              Review Report: {selectedReview?.definition?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-xs text-blue-200 mb-2">
                <strong>Forensic Review Notice:</strong> Your decision will be logged in the case audit trail.
                Approved reports can be locked as final artifacts.
              </p>
            </div>

            {selectedReview?.case && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Case Number</p>
                  <p className="text-white font-mono">{selectedReview.case.case_number}</p>
                </div>
                <div>
                  <p className="text-slate-500">Case Title</p>
                  <p className="text-white">{selectedReview.case.title}</p>
                </div>
              </div>
            )}

            {selectedReview?.run?.evidence_snapshot && (
              <div>
                <p className="text-slate-500 text-sm mb-1">Evidence Snapshot</p>
                <p className="text-white text-sm">
                  {selectedReview.run.evidence_snapshot.evidence_count} items included
                </p>
              </div>
            )}

            <div>
              <Label className="text-slate-300">Decision *</Label>
              <div className="flex gap-3 mt-2">
                <Button
                  onClick={() => setDecision('approved')}
                  variant={decision === 'approved' ? 'default' : 'outline'}
                  className={decision === 'approved' 
                    ? 'bg-green-600 hover:bg-green-700 flex-1' 
                    : 'border-slate-700 flex-1'
                  }
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button
                  onClick={() => setDecision('rejected')}
                  variant={decision === 'rejected' ? 'default' : 'outline'}
                  className={decision === 'rejected' 
                    ? 'bg-red-600 hover:bg-red-700 flex-1' 
                    : 'border-slate-700 flex-1'
                  }
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-slate-300">
                Comments {decision === 'rejected' && <span className="text-red-400">*</span>}
              </Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={decision === 'rejected' 
                  ? 'Explain why report is being rejected...' 
                  : 'Optional approval comments...'
                }
                className="bg-slate-800 border-slate-700 text-white mt-1 h-32"
              />
            </div>

            <div className="pt-4 border-t border-slate-700">
              <Button
                onClick={handleSubmitDecision}
                disabled={!decision || decideMutation.isPending || (decision === 'rejected' && !comments.trim())}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {decideMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  `Submit ${decision === 'approved' ? 'Approval' : decision === 'rejected' ? 'Rejection' : 'Decision'}`
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}