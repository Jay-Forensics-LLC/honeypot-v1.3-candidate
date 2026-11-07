import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '../components/common/PageHeader';
import PolicyAssignments from '../components/policy/PolicyAssignments';
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

export default function PolicyAssignmentsPage() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['policy-assignments'],
    queryFn: async () => {
      const user = await base44.auth.me();
      return await base44.entities.PolicyAssignment.filter({
        organization_id: user.organization_id
      }, '-created_date');
    }
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['security-policies'],
    queryFn: async () => {
      const user = await base44.auth.me();
      return await base44.entities.SecurityPolicy.filter({
        organization_id: user.organization_id,
        status: { $ne: 'ARCHIVED' }
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (assignmentId) => {
      const response = await base44.functions.invoke('policyAssignments', {
        operation: 'delete',
        assignment_id: assignmentId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-assignments'] });
      setDeleteTarget(null);
      toast.success('Assignment removed');
    },
    onError: (error) => {
      toast.error('Failed to remove assignment', { description: error.message });
    }
  });

  const getPolicyName = (policyId) => {
    const policy = policies.find(p => p.id === policyId);
    return policy?.name || 'Unknown Policy';
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader
        title="Policy Assignments"
        description="Assign policies to devices and device groups"
        icon={Shield}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Create Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <PolicyAssignments />
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Active Assignments ({assignments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-slate-400">Loading...</p>
            ) : assignments.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No assignments yet</p>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="p-4 bg-slate-800/30 rounded border border-slate-700 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-semibold">
                          {getPolicyName(assignment.policy_id)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {assignment.target_type}
                        </Badge>
                        <Badge className={
                          assignment.enforcement_mode === 'ENFORCE' ? 'bg-red-500/20 text-red-400' :
                          'bg-blue-500/20 text-blue-400'
                        }>
                          {assignment.enforcement_mode}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400">
                        Priority: {assignment.priority} • Target: {assignment.target_id.slice(0, 8)}...
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteTarget(assignment)}
                      className="border-slate-700 text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove Assignment</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to remove this policy assignment? This will affect policy resolution for the target device/group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove Assignment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}