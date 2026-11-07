import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  UserPlus,
  Users,
  Shield,
  Scale,
  Code,
  Eye,
  X,
  Loader2
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';

export default function CaseRoleManager({ caseId }) {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('analyst');
  const queryClient = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['case-roles', caseId],
    queryFn: () => base44.functions.invoke('manageCaseRoles', {
      action: 'list',
      case_id: caseId
    }).then(res => res.data.roles)
  });

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }) => base44.functions.invoke('manageCaseRoles', {
      action: 'assign',
      case_id: caseId,
      user_email: email,
      role
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-roles', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-activities', caseId] });
      setShowInviteDialog(false);
      setInviteEmail('');
      setInviteRole('analyst');
      toast.success('User invited to case');
    },
    onError: (error) => {
      toast.error('Invitation failed', {
        description: error.message
      });
    }
  });

  const revokeMutation = useMutation({
    mutationFn: (roleId) => base44.functions.invoke('manageCaseRoles', {
      action: 'revoke',
      case_id: caseId,
      role_id: roleId
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-roles', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-activities', caseId] });
      toast.success('Access revoked');
    }
  });

  const getRoleIcon = (role) => {
    const icons = {
      lead_investigator: Shield,
      analyst: Code,
      legal_counsel: Scale,
      law_enforcement: Shield,
      external_counsel: Scale,
      observer: Eye
    };
    return icons[role] || Users;
  };

  const getRoleColor = (role) => {
    const colors = {
      lead_investigator: 'bg-red-500/20 text-red-400',
      analyst: 'bg-purple-500/20 text-purple-400',
      legal_counsel: 'bg-blue-500/20 text-blue-400',
      law_enforcement: 'bg-green-500/20 text-green-400',
      external_counsel: 'bg-cyan-500/20 text-cyan-400',
      observer: 'bg-slate-500/20 text-slate-400'
    };
    return colors[role] || colors.observer;
  };

  const handleInvite = (e) => {
    e.preventDefault();
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Case Team ({roles.length})
          </CardTitle>
          <Button
            onClick={() => setShowInviteDialog(true)}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invite User
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {roles.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No team members assigned</p>
          </div>
        ) : (
          <div className="space-y-2">
            {roles.map((caseRole) => {
              const Icon = getRoleIcon(caseRole.role);
              
              return (
                <div
                  key={caseRole.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                      <Icon className="w-4 h-4 text-slate-300" />
                    </div>
                    <div>
                      <p className="text-white font-medium text-sm">{caseRole.user_email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={getRoleColor(caseRole.role)}>
                          {caseRole.role.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          Added {DateUtils.safeRelativeTime(caseRole.assigned_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => revokeMutation.mutate(caseRole.id)}
                    disabled={revokeMutation.isPending}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Invite User to Case</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="bg-slate-800 border-slate-700"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="lead_investigator">Lead Investigator (Full Access)</SelectItem>
                  <SelectItem value="analyst">Analyst (Technical Access)</SelectItem>
                  <SelectItem value="legal_counsel">Legal Counsel (Legal View)</SelectItem>
                  <SelectItem value="law_enforcement">Law Enforcement</SelectItem>
                  <SelectItem value="external_counsel">External Counsel (Limited)</SelectItem>
                  <SelectItem value="observer">Observer (Read Only)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
              <p className="text-xs text-blue-200">
                <strong>Note:</strong> Users will receive an email invitation and gain access based on their assigned role permissions.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowInviteDialog(false)}
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviteMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {inviteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4 mr-2" />
                )}
                Send Invitation
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}