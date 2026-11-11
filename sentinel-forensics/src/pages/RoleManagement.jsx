import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Shield, Users, Lock, Loader2, Edit, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AdminOnly } from '../components/security/RBACGuard';
import { Roles, getRoleDisplayName, getRoleDescription, getRolePermissions } from '../components/security/RBACConfig';

export default function RoleManagement() {
  const [editDialog, setEditDialog] = useState(null);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    retry: 1
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }) => {
      const user = users.find(u => u.id === userId);
      
      // Update user role
      await base44.entities.User.update(userId, { role: newRole });
      
      // Log permission change
      await base44.functions.invoke('logPermissionChange', {
        targetUserId: userId,
        targetUserEmail: user.email,
        previousRole: user.role,
        newRole,
        changeType: 'role_change',
        reason
      });
      
      return { userId, newRole };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditDialog(null);
      setReason('');
      toast.success('Role updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update role', { description: error.message });
    }
  });

  const roleStats = {
    admin: users.filter(u => u.role === Roles.ADMIN).length,
    analyst: users.filter(u => u.role === Roles.ANALYST).length,
    auditor: users.filter(u => u.role === Roles.AUDITOR).length,
    viewer: users.filter(u => u.role === Roles.VIEWER).length
  };

  return (
    <AdminOnly>
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Role Management</h1>
            <p className="text-slate-400">Manage user roles and permissions</p>
          </div>

          {/* Role Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <Shield className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-white">{roleStats.admin}</p>
                    <p className="text-xs text-slate-400">Administrators</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-white">{roleStats.analyst}</p>
                    <p className="text-xs text-slate-400">Analysts</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-white">{roleStats.auditor}</p>
                    <p className="text-xs text-slate-400">Auditors</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Lock className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-white">{roleStats.viewer}</p>
                    <p className="text-xs text-slate-400">Viewers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Users List */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Users & Roles</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
                  <p className="text-slate-400">Loading users...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg">
                      <div className="flex-1">
                        <p className="font-semibold text-white">{user.full_name || user.email}</p>
                        <p className="text-sm text-slate-400">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={
                          user.role === Roles.ADMIN ? 'text-red-400 border-red-500/30' :
                          user.role === Roles.ANALYST ? 'text-blue-400 border-blue-500/30' :
                          user.role === Roles.AUDITOR ? 'text-green-400 border-green-500/30' :
                          'text-purple-400 border-purple-500/30'
                        }>
                          {getRoleDisplayName(user.role)}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditDialog(user)}
                          className="border-slate-700 text-white hover:bg-slate-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Role Permissions Reference */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Role Permissions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {Object.values(Roles).map(role => (
                  <div key={role} className="bg-slate-800/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline" className={
                        role === Roles.ADMIN ? 'text-red-400 border-red-500/30' :
                        role === Roles.ANALYST ? 'text-blue-400 border-blue-500/30' :
                        role === Roles.AUDITOR ? 'text-green-400 border-green-500/30' :
                        'text-purple-400 border-purple-500/30'
                      }>
                        {getRoleDisplayName(role)}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{getRoleDescription(role)}</p>
                    <p className="text-xs text-slate-500">
                      {getRolePermissions(role).length} permissions
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edit Role Dialog */}
        <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>Update User Role</DialogTitle>
            </DialogHeader>
            {editDialog && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-400 mb-1">User</p>
                  <p className="font-semibold text-white">{editDialog.full_name || editDialog.email}</p>
                  <p className="text-sm text-slate-500">{editDialog.email}</p>
                </div>

                <div className="space-y-2">
                  <Label>New Role</Label>
                  <Select
                    defaultValue={editDialog.role}
                    onValueChange={(value) => setEditDialog({ ...editDialog, newRole: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      {Object.values(Roles).map(role => (
                        <SelectItem key={role} value={role}>
                          {getRoleDisplayName(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    {getRoleDescription(editDialog.newRole || editDialog.role)}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Reason for Change (Required)</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why this role change is necessary..."
                    className="bg-slate-800 border-slate-700 text-white"
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditDialog(null);
                      setReason('');
                    }}
                    className="border-slate-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => updateRoleMutation.mutate({
                      userId: editDialog.id,
                      newRole: editDialog.newRole || editDialog.role
                    })}
                    disabled={
                      updateRoleMutation.isPending ||
                      !reason.trim() ||
                      (editDialog.newRole || editDialog.role) === editDialog.role
                    }
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {updateRoleMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Role'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminOnly>
  );
}