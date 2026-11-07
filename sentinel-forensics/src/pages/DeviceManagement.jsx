import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Monitor, Filter, Users, Activity, Download, Shield, Tag, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function DeviceManagement() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOS, setFilterOS] = useState('all');
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', user?.organization_id],
    queryFn: () => base44.entities.Device.filter({ organization_id: user.organization_id }),
    enabled: !!user?.organization_id
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['device-groups', user?.organization_id],
    queryFn: () => base44.entities.DeviceGroup.filter({ organization_id: user.organization_id }),
    enabled: !!user?.organization_id
  });

  const bulkActionMutation = useMutation({
    mutationFn: ({ device_ids, action, parameters }) => 
      base44.functions.invoke('bulkDeviceActions', { device_ids, action, parameters }),
    onSuccess: () => {
      queryClient.invalidateQueries(['devices']);
      setSelectedDevices([]);
      toast.success('Bulk action completed');
    }
  });

  const createGroupMutation = useMutation({
    mutationFn: (groupData) => base44.entities.DeviceGroup.create(groupData),
    onSuccess: () => {
      queryClient.invalidateQueries(['device-groups']);
      setShowGroupDialog(false);
      setNewGroupName('');
      toast.success('Group created');
    }
  });

  const deployAgentMutation = useMutation({
    mutationFn: ({ device_ids }) => base44.functions.invoke('deployAgent', { device_ids }),
    onSuccess: () => {
      toast.success('Agent deployment started');
      setSelectedDevices([]);
    }
  });

  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      const matchesSearch = !searchQuery || 
        device.device_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.ip_address?.includes(searchQuery);
      
      const matchesStatus = filterStatus === 'all' || device.status === filterStatus;
      const matchesOS = filterOS === 'all' || device.os_type === filterOS;
      
      return matchesSearch && matchesStatus && matchesOS;
    });
  }, [devices, searchQuery, filterStatus, filterOS]);

  const deviceHealth = useMemo(() => {
    const online = devices.filter(d => d.status === 'active').length;
    const offline = devices.filter(d => d.status === 'offline').length;
    const isolated = devices.filter(d => d.status === 'isolated').length;
    return { online, offline, isolated, total: devices.length };
  }, [devices]);

  const osDistribution = useMemo(() => {
    const dist = {};
    devices.forEach(d => {
      const os = d.os_type || 'Unknown';
      dist[os] = (dist[os] || 0) + 1;
    });
    return dist;
  }, [devices]);

  const toggleDevice = (deviceId) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]
    );
  };

  const selectAll = () => {
    if (selectedDevices.length === filteredDevices.length) {
      setSelectedDevices([]);
    } else {
      setSelectedDevices(filteredDevices.map(d => d.id));
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Device Management</h1>
            <p className="text-slate-400">Manage, group, and monitor all endpoints</p>
          </div>
          <Button onClick={() => setShowGroupDialog(true)}>
            <Users className="w-4 h-4 mr-2" />
            Create Group
          </Button>
        </div>

        {/* Health Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-400">Total Devices</p>
              <p className="text-2xl font-bold text-white">{deviceHealth.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-400">Online</p>
              <p className="text-2xl font-bold text-green-400">{deviceHealth.online}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-400">Offline</p>
              <p className="text-2xl font-bold text-yellow-400">{deviceHealth.offline}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-400">Isolated</p>
              <p className="text-2xl font-bold text-red-400">{deviceHealth.isolated}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-400">Selected</p>
              <p className="text-2xl font-bold text-blue-400">{selectedDevices.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Bulk Actions */}
        {selectedDevices.length > 0 && (
          <Card className="bg-blue-900/20 border-blue-500/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">{selectedDevices.length} devices selected</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => bulkActionMutation.mutate({ device_ids: selectedDevices, action: 'scan' })}>
                    <Activity className="w-4 h-4 mr-2" />
                    Scan
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => bulkActionMutation.mutate({ device_ids: selectedDevices, action: 'isolate' })}>
                    <Shield className="w-4 h-4 mr-2" />
                    Isolate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => deployAgentMutation.mutate({ device_ids: selectedDevices })}>
                    <Download className="w-4 h-4 mr-2" />
                    Deploy Agent
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="devices">
          <TabsList className="bg-slate-900/50 border-slate-800">
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="groups">Groups ({groups.length})</TabsTrigger>
            <TabsTrigger value="health">Health Monitor</TabsTrigger>
          </TabsList>

          <TabsContent value="devices">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">All Devices</CardTitle>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Search devices..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-slate-800 border-slate-700 text-white w-64"
                      />
                    </div>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white rounded-lg px-3"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="offline">Offline</option>
                      <option value="isolated">Isolated</option>
                    </select>
                    <select
                      value={filterOS}
                      onChange={(e) => setFilterOS(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white rounded-lg px-3"
                    >
                      <option value="all">All OS</option>
                      {Object.keys(osDistribution).map(os => (
                        <option key={os} value={os}>{os}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <Checkbox checked={selectedDevices.length === filteredDevices.length && filteredDevices.length > 0} onCheckedChange={selectAll} />
                    <span className="text-white font-medium">Select All ({filteredDevices.length})</span>
                  </div>
                  {filteredDevices.map(device => (
                    <div key={device.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500/50 transition-colors">
                      <Checkbox checked={selectedDevices.includes(device.id)} onCheckedChange={() => toggleDevice(device.id)} />
                      <Monitor className="w-5 h-5 text-slate-400" />
                      <div className="flex-1">
                        <h3 className="text-white font-medium">{device.device_name || device.id}</h3>
                        <p className="text-sm text-slate-400">{device.ip_address} • {device.os_type}</p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={device.status === 'active' ? 'default' : device.status === 'isolated' ? 'destructive' : 'secondary'}>
                          {device.status}
                        </Badge>
                        {device.agent_version && (
                          <Badge variant="outline">v{device.agent_version}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="groups">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Device Groups</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {groups.map(group => (
                    <div key={group.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white font-semibold">{group.name}</h3>
                        <Badge>{group.device_ids?.length || 0} devices</Badge>
                      </div>
                      <p className="text-sm text-slate-400">{group.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">OS Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(osDistribution).map(([os, count]) => (
                      <div key={os} className="flex items-center justify-between p-2 bg-slate-800/50 rounded">
                        <span className="text-white">{os}</span>
                        <Badge>{count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Status Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Health Score</span>
                      <span className="text-2xl font-bold text-green-400">
                        {Math.round((deviceHealth.online / deviceHealth.total) * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-green-400" style={{ width: `${(deviceHealth.online / deviceHealth.total) * 100}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create Device Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <Button onClick={() => createGroupMutation.mutate({
              organization_id: user.organization_id,
              name: newGroupName,
              device_ids: selectedDevices
            })} disabled={!newGroupName}>
              Create Group
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}