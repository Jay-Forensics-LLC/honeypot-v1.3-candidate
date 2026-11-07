import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Shield, CheckCircle, XCircle, Clock, AlertCircle, 
  ThumbsUp, ThumbsDown 
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '../components/common/PageHeader';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function PolicyActionsQueue() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('QUEUED');
  const [approveTarget, setApproveTarget] = useState(null);
  const [denyTarget, setDenyTarget] = useState(null);
  const [denyReason, setDenyReason] = useState('');

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['policy-actions'],
    queryFn: async () => {
      const user = await base44.auth.me();
      return await base44.entities.PolicyActionQueue.filter({
        organization_id: user.organization_id
      }, '-created_date');
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (actionId) => {
      const response = await base44.functions.invoke('policyEnforcement', {
        operation: 'approveAction',
        action_id: actionId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-actions'] });
      setApproveTarget(null);
      toast.success('Action approved');
    },
    onError: (error) => {
      toast.error('Failed to approve action', { description: error.message });
    }
  });

  const denyMutation = useMutation({
    mutationFn: async ({ actionId, reason }) => {
      const response = await base44.functions.invoke('policyEnforcement', {
        operation: 'denyAction',
        action_id: actionId,
        reason
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-actions'] });
      setDenyTarget(null);
      setDenyReason('');
      toast.success('Action denied');
    },
    onError: (error) => {
      toast.error('Failed to deny action', { description: error.message });
    }
  });

  const handleDeny = () => {
    if (!denyReason.trim()) {
      toast.error('Denial reason is required');
      return;
    }
    denyMutation.mutate({ actionId: denyTarget.id, reason: denyReason });
  };

  const filteredActions = actions.filter(action => action.status === activeTab);

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

  const tabs = [
    { value: 'QUEUED', label: 'Pending', icon: Clock },
    { value: 'APPROVED', label: 'Approved', icon: CheckCircle },
    { value: 'CANCELED', label: 'Denied', icon: XCircle },
    { value: 'RUNNING', label: 'Executing', icon: AlertCircle },
    { value: 'SUCCESS', label: 'Success', icon: CheckCircle },
    { value: 'FAILED', label: 'Failed', icon: XCircle }
  ];

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader
        title="Policy Actions Queue"
        description="Review and approve policy enforcement actions"
        icon={Shield}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Clock className="w-10 h-10 text-yellow-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {actions.filter(a => a.status === 'QUEUED' || a.status === 'PENDING_APPROVAL').length}
                </p>
                <p className="text-xs text-slate-400">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {actions.filter(a => a.status === 'SUCCESS').length}
                </p>
                <p className="text-xs text-slate-400">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {actions.filter(a => a.status === 'FAILED').length}
                </p>
                <p className="text-xs text-slate-400">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="border-b border-slate-800">
              <TabsList className="bg-transparent w-full justify-start p-4">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const count = actions.filter(a => a.status === tab.value).length;
                  return (
                    <TabsTrigger 
                      key={tab.value} 
                      value={tab.value}
                      className="data-[state=active]:bg-slate-800"
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {tab.label} ({count})
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {tabs.map(tab => (
              <TabsContent key={tab.value} value={tab.value} className="p-6">
                {filteredActions.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <p className="text-slate-400">No {tab.label.toLowerCase()} actions</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredActions.map((action) => (
                      <div
                        key={action.id}
                        className="p-4 bg-slate-800/30 rounded border border-slate-700"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="text-white font-semibold">{action.action_type}</h4>
                              <Badge className={getStatusColor(action.status)}>
                                {action.status}
                              </Badge>
                              {action.requires_approval && (
                                <Badge variant="outline" className="text-yellow-400">
                                  Requires Approval
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-400 mb-2">
                              Device: {action.device_id.slice(0, 16)}... • Policy: {action.policy_id.slice(0, 8)}...
                            </p>
                            <p className="text-xs text-slate-500">
                              Requested: {format(new Date(action.created_date), 'MMM d, yyyy HH:mm')}
                              {action.requested_by && ` by ${action.requested_by}`}
                            </p>
                          </div>

                          {(action.status === 'QUEUED' || action.status === 'PENDING_APPROVAL') && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => setApproveTarget(action)}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <ThumbsUp className="w-4 h-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDenyTarget(action)}
                                className="border-slate-700 text-red-400 hover:text-red-300"
                              >
                                <ThumbsDown className="w-4 h-4 mr-2" />
                                Deny
                              </Button>
                            </div>
                          )}
                        </div>

                        {action.payload_json && (
                          <details className="mt-3">
                            <summary className="text-xs text-slate-500 cursor-pointer">Action Payload</summary>
                            <pre className="mt-2 bg-slate-800 p-3 rounded text-xs text-slate-300 overflow-auto">
                              {JSON.stringify(action.payload_json, null, 2)}
                            </pre>
                          </details>
                        )}

                        {action.execution_log && (
                          <div className="mt-3 p-3 bg-slate-800 rounded">
                            <p className="text-xs text-slate-400 mb-1">Execution Log:</p>
                            <p className="text-xs text-slate-300">{action.execution_log}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={!!approveTarget} onOpenChange={() => setApproveTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Approve Action</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to approve this action? It will be queued for execution on the target device.
              <div className="mt-4 p-3 bg-slate-800 rounded">
                <p className="text-sm text-white font-semibold mb-2">{approveTarget?.action_type}</p>
                <p className="text-xs text-slate-400">Device: {approveTarget?.device_id}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => approveMutation.mutate(approveTarget.id)}
              className="bg-green-600 hover:bg-green-700"
            >
              Approve Action
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!denyTarget} onOpenChange={() => { setDenyTarget(null); setDenyReason(''); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Deny Action</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Please provide a reason for denying this action (required for audit trail).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label className="text-slate-400">Denial Reason *</Label>
            <Textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Explain why this action is being denied..."
              className="bg-slate-800 border-slate-700 text-white mt-2"
              rows={4}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeny}
              className="bg-red-600 hover:bg-red-700"
            >
              Deny Action
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}