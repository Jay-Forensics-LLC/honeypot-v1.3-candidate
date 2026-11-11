import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Target, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgList } from '../hooks/useOrgQuery';

export default function PolicyAssignments({ policies, assignments }) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState('');
  const [targetType, setTargetType] = useState('DEVICE');
  const [targetId, setTargetId] = useState('');
  const [enforcementMode, setEnforcementMode] = useState('AUDIT_ONLY');
  const [priority, setPriority] = useState(0);

  const queryClient = useQueryClient();
  const { data: devices = [] } = useOrgList('Device');
  const { data: groups = [] } = useOrgList('DeviceGroup');

  const assignMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('policyAssignments', {
        operation: 'create',
        policy_id: selectedPolicy,
        target_type: targetType,
        target_id: targetId,
        enforcement_mode: enforcementMode,
        priority: parseInt(priority)
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['PolicyAssignment'] });
      queryClient.invalidateQueries({ queryKey: ['EffectivePolicyResolution'] });
      toast.success('Policy assigned successfully');
      setAssignDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Assignment failed', { description: error.message });
    }
  });

  const unassignMutation = useMutation({
    mutationFn: async (assignmentId) => {
      const response = await base44.functions.invoke('policyAssignments', {
        operation: 'delete',
        assignment_id: assignmentId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['PolicyAssignment'] });
      toast.success('Policy unassigned');
    }
  });

  const resetForm = () => {
    setSelectedPolicy('');
    setTargetType('DEVICE');
    setTargetId('');
    setEnforcementMode('AUDIT_ONLY');
    setPriority(0);
  };

  const publishedPolicies = policies.filter(p => p.status === 'PUBLISHED');
  const activeAssignments = assignments.filter(a => a.is_active);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">Policy Assignments</CardTitle>
          <Button
            onClick={() => setAssignDialogOpen(true)}
            disabled={publishedPolicies.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Assignment
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {activeAssignments.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 mb-2">No policy assignments</p>
            <p className="text-sm text-slate-500">
              Assign published policies to devices or groups to enforce security controls
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAssignments.map((assignment) => {
              const policy = policies.find(p => p.id === assignment.policy_id);
              
              return (
                <div
                  key={assignment.id}
                  className="p-4 bg-slate-800/30 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-white font-semibold">
                          {policy?.name || 'Unknown Policy'}
                        </h4>
                        <Badge className="bg-purple-500/20 text-purple-400">
                          {assignment.target_type}
                        </Badge>
                        <Badge className={
                          assignment.enforcement_mode === 'ENFORCE'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }>
                          {assignment.enforcement_mode}
                        </Badge>
                        <Badge variant="outline" className="text-slate-400">
                          Priority: {assignment.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        Assigned by {assignment.assigned_by} • {new Date(assignment.created_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unassignMutation.mutate(assignment.id)}
                      disabled={unassignMutation.isPending}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Unassign
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Assign Policy</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-slate-400">Policy</Label>
              <Select value={selectedPolicy} onValueChange={setSelectedPolicy}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue placeholder="Select policy..." />
                </SelectTrigger>
                <SelectContent>
                  {publishedPolicies.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} (v{p.version})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-400">Target Type</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEVICE">Individual Device</SelectItem>
                  <SelectItem value="GROUP">Device Group</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-400">
                {targetType === 'DEVICE' ? 'Device' : 'Group'}
              </Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue placeholder={`Select ${targetType.toLowerCase()}...`} />
                </SelectTrigger>
                <SelectContent>
                  {targetType === 'DEVICE' ? (
                    devices.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.device_name || d.device_id}
                      </SelectItem>
                    ))
                  ) : (
                    groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-400">Enforcement Mode</Label>
              <Select value={enforcementMode} onValueChange={setEnforcementMode}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUDIT_ONLY">Audit Only (No Enforcement)</SelectItem>
                  <SelectItem value="ENFORCE">Enforce (Apply Actions)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-400">Priority (Conflict Resolution)</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="0 (higher = wins conflicts)"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setAssignDialogOpen(false)}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => assignMutation.mutate()}
              disabled={!selectedPolicy || !targetId || assignMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {assignMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Target className="w-4 h-4 mr-2" />
              )}
              Assign
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}