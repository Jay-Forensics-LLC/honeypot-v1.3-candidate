import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * PHASE 6: AI Suggestion Approval Component
 * Human-in-the-loop workflow for AI findings
 */
export default function AISuggestionApproval({ finding, onApproved, onRejected }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const approveMutation = useMutation({
    mutationFn: async ({ status, notes }) => {
      const response = await base44.functions.invoke('approveFinding', {
        finding_id: finding.id,
        approval_status: status,
        approval_notes: notes
      });
      return response;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['analytics-findings'] });
      toast.success(`Finding ${variables.status}`);
      if (variables.status === 'accepted') {
        onApproved?.(finding);
      } else {
        onRejected?.(finding);
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Approval failed');
    }
  });

  if (finding.approval_status !== 'pending') {
    return (
      <div className="flex items-center gap-2">
        {finding.approval_status === 'accepted' ? (
          <Badge className="bg-green-500/20 text-green-400">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Accepted
          </Badge>
        ) : (
          <Badge className="bg-red-500/20 text-red-400">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        )}
        {finding.approved_by && (
          <span className="text-xs text-slate-400">
            by {finding.approved_by}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Pending Review
        </Badge>
      </div>
      
      {showNotes && (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add review notes (optional)..."
          className="bg-slate-800 border-slate-700 text-white"
        />
      )}
      
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (!showNotes) {
              setShowNotes(true);
            } else {
              approveMutation.mutate({ status: 'accepted', notes });
            }
          }}
          disabled={approveMutation.isPending}
          className="bg-green-600 hover:bg-green-700"
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Accept
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (!showNotes) {
              setShowNotes(true);
            } else {
              approveMutation.mutate({ status: 'rejected', notes });
            }
          }}
          disabled={approveMutation.isPending}
          variant="outline"
          className="border-red-500/50 text-red-400 hover:bg-red-500/10"
        >
          <XCircle className="w-4 h-4 mr-2" />
          Reject
        </Button>
      </div>
    </div>
  );
}