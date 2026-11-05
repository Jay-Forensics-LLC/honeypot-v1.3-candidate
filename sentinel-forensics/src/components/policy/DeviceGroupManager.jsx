import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgList } from '../hooks/useOrgQuery';

export default function DeviceGroupManager() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [membershipType, setMembershipType] = useState('STATIC');
  const [selectedDevices, setSelectedDevices] = useState([]);

  const queryClient = useQueryClient();
  const { data: groups = [] } = useOrgList('DeviceGroup');
  const { data: devices = [] } = useOrgList('Device');

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      
      const group = await base44.entities.DeviceGroup.create({
        organization_id: user.organization_id,
        name,
        description,
        membership_type: membershipType,
        device_count: selectedDevices.length
      });

      // Add members for static groups
      if (membershipType === 'STATIC' && selectedDevices.length > 0) {
        await Promise.all(
          selectedDevices.map(deviceId =>
            base44.entities.DeviceGroupMembership.create({
              organization_id: user.organization_id,
              group_id: group.id,
              device_id: deviceId
            })
          )
        );
      }

      return group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['DeviceGroup'] });
      queryClient.invalidateQueries({ queryKey: ['DeviceGroupMembership'] });
      toast.success('Device group created');
      setCreateDialogOpen(false);
      setName('');
      setDescription('');
      setSelectedDevices([]);
    },
    onError: (error) => {
      toast.error('Failed to create group', { description: error.message });
    }
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId) => {
      await base44.entities.DeviceGroup.delete(groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['DeviceGroup'] });
      toast.success('Group deleted');
    }
  });

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              Device Groups
            </CardTitle>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Group
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">No device groups</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 flex items-center justify-between"
                >
                  <div>
                    <h4 className="text-white font-semibold">{group.name}</h4>
                    <p className="text-sm text-slate-400">{group.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {group.membership_type}
                      </Badge>
                      <Badge variant="outline" className="text-slate-400">
                        {group.device_count || 0} devices
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteGroupMutation.mutate(group.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Group Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create Device Group</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-slate-400">Group Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Executive Devices"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-slate-400">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Group purpose..."
                className="bg-slate-800 border-slate-700 text-white mt-1"
                rows={2}
              />
            </div>

            <div>
              <Label className="text-slate-400">Membership Type</Label>
              <Select value={membershipType} onValueChange={setMembershipType}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STATIC">Static (Manual Selection)</SelectItem>
                  <SelectItem value="DYNAMIC">Dynamic (Auto-assigned by criteria)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {membershipType === 'STATIC' && (
              <div>
                <Label className="text-slate-400">Select Devices</Label>
                <div className="max-h-48 overflow-y-auto space-y-2 mt-2 p-3 bg-slate-800/50 rounded border border-slate-700">
                  {devices.map(device => (
                    <label key={device.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDevices.includes(device.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDevices([...selectedDevices, device.id]);
                          } else {
                            setSelectedDevices(selectedDevices.filter(id => id !== device.id));
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-white text-sm">
                        {device.device_name || device.device_id}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate()}
              disabled={!name || createGroupMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {createGroupMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Group
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}