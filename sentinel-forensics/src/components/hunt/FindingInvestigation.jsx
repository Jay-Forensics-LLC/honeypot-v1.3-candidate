import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, AlertCircle, User } from 'lucide-react';
import { toast } from 'sonner';

export default function FindingInvestigation({ finding }) {
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async (newStatus) => {
      await base44.entities.HuntFinding.update(finding.id, {
        status: newStatus,
        owner: (await base44.auth.me()).email
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hunt-findings'] });
      toast.success('Finding status updated');
    }
  });

  const assignInvestigator = useMutation({
    mutationFn: async () => {
      await base44.entities.HuntFinding.update(finding.id, {
        assigned_to: (await base44.auth.me()).email,
        status: 'investigating'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hunt-findings'] });
      toast.success('Investigation assigned to you');
    }
  });

  const statusActions = [
    { id: 'investigating', label: 'Start Investigation', icon: AlertCircle, color: 'yellow' },
    { id: 'contained', label: 'Mark Contained', icon: CheckCircle, color: 'green' },
    { id: 'false_positive', label: 'False Positive', icon: XCircle, color: 'slate' },
    { id: 'closed', label: 'Close Finding', icon: CheckCircle, color: 'blue' }
  ];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white">Investigation Workflow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
          <div>
            <p className="text-sm text-slate-400">Current Status</p>
            <Badge className="mt-1">
              {finding.status.replace(/_/g, ' ').toUpperCase()}
            </Badge>
          </div>
          {!finding.assigned_to && (
            <Button
              size="sm"
              onClick={() => assignInvestigator.mutate()}
              disabled={assignInvestigator.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <User className="w-4 h-4 mr-2" />
              Assign to Me
            </Button>
          )}
        </div>

        {finding.assigned_to && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-300">
              Assigned to: {finding.assigned_to}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm text-slate-400 font-semibold">Update Status</p>
          <div className="grid grid-cols-2 gap-2">
            {statusActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id}
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatus.mutate(action.id)}
                  disabled={updateStatus.isPending || finding.status === action.id}
                  className="border-slate-700"
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-400 font-semibold">Investigation Notes</p>
          <Textarea
            placeholder="Add investigation notes, findings, or observations..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-slate-800 border-slate-700 text-white min-h-24"
          />
        </div>
      </CardContent>
    </Card>
  );
}