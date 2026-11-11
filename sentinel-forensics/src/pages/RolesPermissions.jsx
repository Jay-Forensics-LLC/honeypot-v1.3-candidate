import React from 'react';
import { Shield, Plus, Edit, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function RolesPermissions() {
  const [selectedRole, setSelectedRole] = React.useState(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: roles, isLoading } = useQuery({
    queryKey: ['org-roles'],
    queryFn: async () => {
      const result = await base44.functions.invoke('roleManagement', { action: 'list' });
      return result.data;
    }
  });

  const { data: permissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      try {
        // First try to list existing permissions
        const allPermissions = await base44.entities.Permission.list();
        
        // If no permissions exist, seed them
        if (allPermissions.length === 0) {
          const seedResult = await base44.functions.invoke('seedDefaultPermissions');
          return { permissions: seedResult.data.permissions || [] };
        }
        
        return { permissions: allPermissions };
      } catch (error) {
        console.error('Failed to load permissions:', error);
        return { permissions: [] };
      }
    }
  });

  const createRoleMutation = useMutation({
    mutationFn: async ({ name, description }) => {
      await base44.functions.invoke('roleManagement', {
        action: 'create',
        name,
        description
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-roles'] });
      toast.success('Role created');
      setShowCreateDialog(false);
    }
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId) => {
      await base44.functions.invoke('roleManagement', {
        action: 'delete',
        role_id: roleId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-roles'] });
      toast.success('Role deleted');
    }
  });

  const permissionsByCategory = React.useMemo(() => {
    const grouped = {};
    const permList = Array.isArray(permissions?.permissions) 
      ? permissions.permissions 
      : (permissions?.permissions || []);
    
    permList.forEach(p => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });
    return grouped;
  }, [permissions]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Roles & Permissions</h1>
            <p className="text-gray-600">Manage access control and permissions</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Role
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {roles?.roles?.map(role => (
              <Card key={role.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-blue-600" />
                      {role.name}
                      {role.is_system_role && (
                        <Badge variant="secondary">System</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedRole(role)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {!role.is_system_role && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600"
                          onClick={() => deleteRoleMutation.mutate(role.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">{role.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions?.slice(0, 5).map((perm, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {perm}
                      </Badge>
                    ))}
                    {role.permissions?.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{role.permissions.length - 5} more
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Role Dialog */}
      <CreateRoleDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={(data) => createRoleMutation.mutate(data)}
      />

      {/* Edit Permissions Dialog */}
      <PermissionsDialog
        role={selectedRole}
        permissions={permissionsByCategory}
        onClose={() => setSelectedRole(null)}
      />
    </div>
  );
}

function CreateRoleDialog({ open, onClose, onCreate }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Role</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Role Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onCreate({ name, description })} disabled={!name}>
              Create Role
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({ role, permissions, onClose }) {
  const [selectedPerms, setSelectedPerms] = React.useState([]);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (role) {
      setSelectedPerms(role.permissions || []);
    }
  }, [role]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await base44.functions.invoke('roleManagement', {
        action: 'set_permissions',
        role_id: role.id,
        permission_keys: selectedPerms
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-roles'] });
      toast.success('Permissions updated');
      onClose();
    }
  });

  if (!role) return null;

  return (
    <Dialog open={!!role} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit Permissions: {role.name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={Object.keys(permissions)[0]}>
          <TabsList className="w-full flex-wrap h-auto">
            {Object.keys(permissions).map(category => (
              <TabsTrigger key={category} value={category}>
                {category}
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.entries(permissions).map(([category, perms]) => (
            <TabsContent key={category} value={category} className="space-y-2">
              {perms.map(perm => (
                <div key={perm.key} className="flex items-start gap-3 p-3 border rounded">
                  <Checkbox
                    checked={selectedPerms.includes(perm.key)}
                    onCheckedChange={(checked) => {
                      setSelectedPerms(prev =>
                        checked ? [...prev, perm.key] : prev.filter(k => k !== perm.key)
                      );
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{perm.key}</div>
                    <div className="text-sm text-gray-600">{perm.description}</div>
                  </div>
                </div>
              ))}
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()}>
            Save Permissions
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}