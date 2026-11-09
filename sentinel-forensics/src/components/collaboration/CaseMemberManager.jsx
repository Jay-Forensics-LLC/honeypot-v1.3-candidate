import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Trash2, Shield, Eye, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

/**
 * CASE MEMBER MANAGER
 * Manages multi-user case assignments with role-based permissions
 * 
 * SECURITY:
 * - Only owners/admins can add/remove members
 * - Enforces org boundaries
 * - Logs all membership changes to activity feed
 */
export default function CaseMemberManager({ caseId, caseData }) {
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('analyst');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['case-members', caseId],
    queryFn: () => base44.entities.CaseMember.filter({ case_id: caseId }),
    enabled: !!caseId,
  });

  const { data: orgUsers = [] } = useQuery({
    queryKey: ['org-users'],
    queryFn: async () => {
      const users = await base44.entities.User.filter({ 
        organization_id: user?.organization_id 
      });
      return users;
    },
    enabled: !!user?.organization_id,
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ email, role }) => {
      const targetUser = orgUsers.find(u => u.email === email);
      if (!targetUser) {
        throw new Error('User not found in organization');
      }

      // Check if already member
      const existing = members.find(m => m.user_email === email);
      if (existing) {
        throw new Error('User is already a member of this case');
      }

      // Add member
      const member = await base44.entities.CaseMember.create({
        organization_id: user.organization_id,
        case_id: caseId,
        user_email: email,
        user_name: targetUser.full_name,
        role,
        assigned_by: user.email,
        assigned_at: new Date().toISOString(),
      });

      // Log activity
      await base44.entities.CaseActivity.create({
        organization_id: user.organization_id,
        case_id: caseId,
        user_email: user.email,
        user_name: user.full_name,
        type: 'member_added',
        content: `Added ${targetUser.full_name} as ${role}`,
        metadata: { member_id: member.id, role },
      });

      return member;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-members', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-activity', caseId] });
      setShowAddDialog(false);
      setNewMemberEmail('');
      setNewMemberRole('analyst');
      toast.success('Member added to case');
    },
    onError: (error) => {
      toast.error('Failed to add member: ' + error.message);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId) => {
      const member = members.find(m => m.id === memberId);
      if (!member) return;

      await base44.entities.CaseMember.delete(memberId);

      // Log activity
      await base44.entities.CaseActivity.create({
        organization_id: user.organization_id,
        case_id: caseId,
        user_email: user.email,
        user_name: user.full_name,
        type: 'member_removed',
        content: `Removed ${member.user_name} from case`,
        metadata: { member_id: memberId, role: member.role },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-members', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-activity', caseId] });
      toast.success('Member removed from case');
    },
    onError: () => {
      toast.error('Failed to remove member');
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, newRole }) => {
      const member = members.find(m => m.id === memberId);
      if (!member) return;

      await base44.entities.CaseMember.update(memberId, { role: newRole });

      // Log activity
      await base44.entities.CaseActivity.create({
        organization_id: user.organization_id,
        case_id: caseId,
        user_email: user.email,
        user_name: user.full_name,
        type: 'assignment_change',
        content: `Changed ${member.user_name}'s role from ${member.role} to ${newRole}`,
        metadata: { member_id: memberId, old_role: member.role, new_role: newRole },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-members', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-activity', caseId] });
      toast.success('Role updated');
    },
    onError: () => {
      toast.error('Failed to update role');
    },
  });

  // SECURITY: Check if current user can manage members
  const currentMember = members.find(m => m.user_email === user?.email);
  const canManage = user?.role === 'admin' || currentMember?.role === 'owner';

  const getRoleIcon = (role) => {
    switch (role) {
      case 'owner':
        return <Shield className="w-4 h-4 text-red-400" />;
      case 'analyst':
        return <Users className="w-4 h-4 text-blue-400" />;
      case 'viewer':
        return <Eye className="w-4 h-4 text-slate-400" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'owner':
        return 'bg-red-500/20 text-red-300 border-red-500/50';
      case 'analyst':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      case 'viewer':
        return 'bg-slate-500/20 text-slate-300 border-slate-500/50';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/50';
    }
  };

  const availableUsers = orgUsers.filter(
    u => !members.some(m => m.user_email === u.email)
  );

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              Case Members ({members.length})
            </CardTitle>
            {canManage && (
              <Button
                onClick={() => setShowAddDialog(true)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center py-8">
              <UserPlus className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400">No members assigned to this case</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      {getRoleIcon(member.role)}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{member.user_name}</p>
                      <p className="text-sm text-slate-400">{member.user_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {canManage && member.role !== 'owner' ? (
                      <Select
                        value={member.role}
                        onValueChange={(role) => 
                          updateRoleMutation.mutate({ memberId: member.id, newRole: role })
                        }
                      >
                        <SelectTrigger className="w-32 bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="analyst">Analyst</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={getRoleBadgeColor(member.role)}>
                        {member.role}
                      </Badge>
                    )}
                    {canManage && member.role !== 'owner' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeMemberMutation.mutate(member.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Add Case Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300">User</label>
              <Select value={newMemberEmail} onValueChange={setNewMemberEmail}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map(u => (
                    <SelectItem key={u.email} value={u.email}>
                      {u.full_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Role</label>
              <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analyst">Analyst (can contribute)</SelectItem>
                  <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => addMemberMutation.mutate({ 
                email: newMemberEmail, 
                role: newMemberRole 
              })}
              disabled={!newMemberEmail || addMemberMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {addMemberMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}