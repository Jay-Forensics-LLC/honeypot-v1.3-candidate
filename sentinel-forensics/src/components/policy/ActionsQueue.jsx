import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Activity, CheckCircle, XCircle, Clock, AlertTriangle, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function ActionsQueue({ actions }) {
  const [selectedAction, setSelectedAction] = useState(null);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [actionToDeny, setActionToDeny] = useState(null);
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async (action) => {
      // Check if this is a policy change approval
      if (action.category === 'POLICY_CHANGE') {
        const response = await base44.functions.invoke('policyVersionLifecycle', {
          operation: 'approvePolicyVersion',
          approval_queue_item_id: action.id
        });
        return response.data;
      }
      
      // Original policy action approval
      const response = await base44.functions.invoke('policyEnforcement', {
        operation: 'approveAction',
        action_id: action.id
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['PolicyActionQueue'] });
      queryClient.invalidateQueries({ queryKey: ['ApprovalQueueItem'] });
      queryClient.invalidateQueries({ queryKey: ['cp-approval-queue'] });
      queryClient.invalidateQueries({ queryKey: ['policy-versions'] });
      queryClient.invalidateQueries({ queryKey: ['SecurityPolicy'] });
      toast.success('Action approved and executed');
      setSelectedAction(null);
    },
    onError: (error) => {
      toast.error('Approval failed', { description: error.message });
    }
  });

  const denyMutation = useMutation({
    mutationFn: async ({ action, reason }) => {
      // Check if this is a policy change rejection
      if (action.category === 'POLICY_CHANGE') {
        const response = await base44.functions.invoke('policyVersionLifecycle', {
          operation: 'rejectPolicyVersion',
          approval_queue_item_id: action.id,
          reason
        });
        return response.data;
      }

      // Original policy action denial
      const response = await base44.functions.invoke('policyEnforcement', {
        operation: 'denyAction',
        action_id: action.id,
        reason
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['PolicyActionQueue'] });
      queryClient.invalidateQueries({ queryKey: ['ApprovalQueueItem'] });
      queryClient.invalidateQueries({ queryKey: ['cp-approval-queue'] });
      queryClient.invalidateQueries({ queryKey: ['policy-versions'] });
      queryClient.invalidateQueries({ queryKey: ['SecurityPolicy'] });
      toast.success('Action denied');
      setDenyDialogOpen(false);
      setActionToDeny(null);
      setDenyReason('');
    },
    onError: (error) => {
      toast.error('Failed to deny action', { description: error.message });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (actionId) => {
      const response = await base44.functions.invoke('policyEnforcement', {
        operation: 'cancelAction',
        action_id: actionId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['PolicyActionQueue'] });
      toast.success('Action canceled');
      setSelectedAction(null);
    }
  });

  const getStatusColor = (status) => {
    const colors = {
      QUEUED: 'bg-blue-500/20 text-blue-400',
      PENDING_APPROVAL: 'bg-yellow-500/20 text-yellow-400',
      APPROVED: 'bg-green-500/20 text-green-400',
      RUNNING: 'bg-purple-500/20 text-purple-400',
      SUCCESS: 'bg-green-500/20 text-green-400',
      FAILED: 'bg-red-500/20 text-red-400',
      CANCELED: 'bg-slate-500/20 text-slate-400'
    };
    return colors[status] || colors.QUEUED;
  };

  const getStatusIcon = (status) => {
    const icons = {
      QUEUED: Clock,
      PENDING_APPROVAL: AlertTriangle,
      APPROVED: CheckCircle,
      RUNNING: Loader2,
      SUCCESS: CheckCircle,
      FAILED: XCircle,
      CANCELED: XCircle
    };
    const Icon = icons[status] || Activity;
    return <Icon className={`w-5 h-5 ${status === 'RUNNING' ? 'animate-spin' : ''}`} />;
  };

  const pendingActions = actions.filter(a => ['QUEUED', 'PENDING_APPROVAL'].includes(a.status));
  const completedActions = actions.filter(a => ['SUCCESS', 'FAILED', 'CANCELED'].includes(a.status));

  return (
    <>
      <div className="space-y-6">
        {/* Pending Actions */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Pending Actions ({pendingActions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingActions.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">No pending actions</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingActions.map((action) => (
                  <div
                    key={action.id}
                    className="p-4 bg-slate-800/30 rounded-lg border border-yellow-500/30"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {getStatusIcon(action.status)}
                          <span className="text-white font-semibold">
                            {action.action_type.replace(/_/g, ' ')}
                          </span>
                          <Badge className={getStatusColor(action.status)}>
                            {action.status}
                          </Badge>
                          {action.requires_approval && (
                            <Badge className="bg-orange-500/20 text-orange-400">
                              Approval Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Device: {action.device_id.slice(0, 8)}... • Requested by {action.requested_by}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {action.status === 'PENDING_APPROVAL' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(action)}
                              disabled={approveMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {approveMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4 mr-2" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActionToDeny(action);
                                setDenyDialogOpen(true);
                              }}
                              className="border-red-500 text-red-400"
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Deny
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedAction(action)}
                          className="border-slate-700"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Actions */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Action History ({completedActions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {completedActions.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">No completed actions</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {completedActions.map((action) => (
                  <div
                    key={action.id}
                    className="p-3 bg-slate-800/30 rounded border border-slate-700 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(action.status)}
                      <div>
                        <p className="text-white text-sm">{action.action_type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(action.executed_at || action.created_date), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(action.status)}>
                      {action.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deny Action Dialog */}
      <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Deny Action</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-slate-400">Reason for Denial *</Label>
              <Textarea
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                placeholder="Explain why this action is being denied..."
                className="bg-slate-800 border-slate-700 text-white mt-1"
                rows={4}
              />
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
              <p className="text-xs text-yellow-300">
                The denial reason will be logged in the audit trail and is required for compliance.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setDenyDialogOpen(false)}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => denyMutation.mutate({ action: actionToDeny, reason: denyReason })}
              disabled={!denyReason.trim() || denyMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {denyMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              Deny Action
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Details Dialog */}
      <Dialog open={!!selectedAction && !denyDialogOpen} onOpenChange={() => setSelectedAction(null)}>
        <DialogContent className="bg-slate-900 border-slate-800">
          {selectedAction && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">Action Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label className="text-slate-400">Action Type</Label>
                  <p className="text-white mt-1">{selectedAction.action_type.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <Label className="text-slate-400">Status</Label>
                  <Badge className={getStatusColor(selectedAction.status)}>
                    {selectedAction.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-slate-400">Device ID</Label>
                  <p className="text-white font-mono mt-1">{selectedAction.device_id}</p>
                </div>
                {selectedAction.execution_log && (
                  <div>
                    <Label className="text-slate-400">Execution Log</Label>
                    <pre className="bg-slate-800/50 rounded p-3 text-xs text-slate-300 mt-1">
                      {selectedAction.execution_log}
                    </pre>
                  </div>
                )}
                {selectedAction.payload_json && (
                  <div>
                    <Label className="text-slate-400">Payload</Label>
                    <pre className="bg-slate-800/50 rounded p-3 text-xs text-slate-300 mt-1 max-h-48 overflow-auto">
                      {JSON.stringify(selectedAction.payload_json, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}