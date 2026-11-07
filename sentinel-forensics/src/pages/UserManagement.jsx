import React from 'react';
import { Users, Shield, Plus, Edit } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function UserManagement() {
  const [search, setSearch] = React.useState('');
  const [selectedUser, setSelectedUser] = React.useState(null);
  const queryClient = useQueryClient();

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['org-users'],
    queryFn: async () => {
      const result = await base44.functions.invoke('userManagement', { action: 'list_users' });
      return result.data;
    }
  });

  const { data: roles } = useQuery({
    queryKey: ['org-roles'],
    queryFn: async () => {
      const result = await base44.functions.invoke('roleManagement', { action: 'list' });
      return result.data;
    }
  });

  const setRolesMutation = useMutation({
    mutationFn: async ({ userId, roleIds }) => {
      await base44.functions.invoke('userManagement', {
        action: 'set_roles',
        user_id: userId,
        role_ids: roleIds
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-users'] });
      toast.success('User roles updated');
      setSelectedUser(null);
    }
  });

  const filteredUsers = users?.users?.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600">Manage organization users and role assignments</p>
          </div>
          <Button onClick={() => base44.users.inviteUser('', 'user')}>
            <Plus className="w-4 h-4 mr-2" />
            Invite User
          </Button>
        </div>

        {/* Search */}
        <div className="max-w-md">
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Users Table */}
        {usersLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-4 font-medium text-gray-700">User</th>
                    <th className="text-left p-4 font-medium text-gray-700">Email</th>
                    <th className="text-left p-4 font-medium text-gray-700">Roles</th>
                    <th className="text-left p-4 font-medium text-gray-700">Built-in Role</th>
                    <th className="text-left p-4 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <div className="font-medium">{user.full_name || 'N/A'}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-gray-600">{user.email}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1 flex-wrap">
                          {user.roles?.length > 0 ? (
                            user.roles.map((role, idx) => (
                              <Badge key={idx} variant="secondary">{role}</Badge>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">No roles</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge className={user.role === 'admin' ? 'bg-red-600' : 'bg-gray-600'}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedUser(user)}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Roles
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Role Assignment Dialog */}
      <RoleAssignmentDialog
        user={selectedUser}
        roles={roles?.roles || []}
        onClose={() => setSelectedUser(null)}
        onSave={(roleIds) => setRolesMutation.mutate({ userId: selectedUser.email, roleIds })}
      />
    </div>
  );
}

function RoleAssignmentDialog({ user, roles, onClose, onSave }) {
  const [selectedRoles, setSelectedRoles] = React.useState([]);

  React.useEffect(() => {
    if (user) {
      const userRoleNames = user.roles || [];
      const roleIds = roles
        .filter(r => userRoleNames.includes(r.name))
        .map(r => r.id);
      setSelectedRoles(roleIds);
    }
  }, [user, roles]);

  if (!user) return null;

  const handleToggle = (roleId) => {
    setSelectedRoles(prev =>
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  return (
    <Dialog open={!!user} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Roles for {user.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {roles.map(role => (
            <div key={role.id} className="flex items-start gap-3 p-3 border rounded hover:bg-gray-50">
              <Checkbox
                checked={selectedRoles.includes(role.id)}
                onCheckedChange={() => handleToggle(role.id)}
              />
              <div className="flex-1">
                <div className="font-medium">{role.name}</div>
                {role.description && (
                  <div className="text-sm text-gray-600">{role.description}</div>
                )}
                <div className="flex gap-1 flex-wrap mt-1">
                  {role.permissions?.slice(0, 3).map((perm, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {perm}
                    </Badge>
                  ))}
                  {role.permissions?.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{role.permissions.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(selectedRoles)}>Save Roles</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}