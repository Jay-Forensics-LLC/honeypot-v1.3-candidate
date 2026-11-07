import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { useOrgQuery } from '../components/hooks/useOrgQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../components/utils';
import { Monitor, Search, Filter, AlertCircle, CheckCircle, Clock, Activity, Download, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import DeviceHealthOverview from '../components/health/DeviceHealthOverview';
import DeviceHealthList from '../components/health/DeviceHealthList';
import DeviceHealthDetail from '../components/health/DeviceHealthDetail';

export default function DeviceInventory() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCompliance, setFilterCompliance] = useState('all');
  const [filterOS, setFilterOS] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [selectedDevice, setSelectedDevice] = useState(null);

  const { data: devices = [], isLoading } = useOrgQuery('Device', {}, '-agent_last_seen_at', 500);
  const { data: healthAlerts = [] } = useQuery({
    queryKey: ['device-health-alerts'],
    queryFn: async () => base44.entities.DeviceHealthAlert.list('-created_date', 50),
    initialData: []
  });

  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      const matchesSearch = !searchQuery || 
        device.hostname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.user?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.serial?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = filterStatus === 'all' || device.agent_status === filterStatus;
      const matchesCompliance = filterCompliance === 'all' || device.compliance_status === filterCompliance;
      const matchesOS = filterOS === 'all' || device.os_family === filterOS;
      
      return matchesSearch && matchesStatus && matchesCompliance && matchesOS;
    });
  }, [devices, searchQuery, filterStatus, filterCompliance, filterOS]);

  const stats = useMemo(() => {
    const online = devices.filter(d => d.agent_status === 'online').length;
    const offline = devices.filter(d => d.agent_status === 'offline').length;
    const stale = devices.filter(d => d.agent_status === 'stale').length;
    const compliant = devices.filter(d => d.compliance_status === 'pass').length;
    const nonCompliant = devices.filter(d => d.compliance_status === 'fail').length;
    return { online, offline, stale, compliant, nonCompliant, total: devices.length };
  }, [devices]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online': return <CheckCircle className="w-3 h-3" />;
      case 'offline': return <AlertCircle className="w-3 h-3" />;
      case 'stale': return <Clock className="w-3 h-3" />;
      default: return <Monitor className="w-3 h-3" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'offline': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'stale': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const getComplianceColor = (status) => {
    switch (status) {
      case 'pass': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'warn': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'fail': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const runHealthEvaluation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('evaluateDeviceHealth', {});
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['Device']);
      queryClient.invalidateQueries(['device-health-alerts']);
      toast.success(`Evaluated ${data.devices_evaluated} devices. Generated ${data.alerts_generated} alerts.`);
    },
    onError: (error) => {
      toast.error('Evaluation failed: ' + error.message);
    }
  });

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Device Inventory</h1>
            <p className="text-slate-300">Full asset view with health, compliance, and risk posture</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-300">Total Devices</p>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-300">Online</p>
              <p className="text-2xl font-bold text-green-400">{stats.online}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-300">Offline</p>
              <p className="text-2xl font-bold text-red-400">{stats.offline}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-300">Compliant</p>
              <p className="text-2xl font-bold text-green-400">{stats.compliant}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-300">Non-Compliant</p>
              <p className="text-2xl font-bold text-red-400">{stats.nonCompliant}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="inventory" className="space-y-6">
          <TabsList className="bg-slate-900">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="health">Health Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="text-white">All Devices ({filteredDevices.length})</CardTitle>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search hostname, user, serial..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-slate-800 border-slate-700 text-white w-64"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white rounded-lg px-3 py-2"
                >
                  <option value="all">All Status</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="stale">Stale</option>
                </select>
                <select
                  value={filterCompliance}
                  onChange={(e) => setFilterCompliance(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white rounded-lg px-3 py-2"
                >
                  <option value="all">All Compliance</option>
                  <option value="pass">Pass</option>
                  <option value="warn">Warn</option>
                  <option value="fail">Fail</option>
                </select>
                <select
                  value={filterOS}
                  onChange={(e) => setFilterOS(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white rounded-lg px-3 py-2"
                >
                  <option value="all">All OS</option>
                  <option value="Windows">Windows</option>
                  <option value="macOS">macOS</option>
                  <option value="Linux">Linux</option>
                  <option value="iOS">iOS</option>
                  <option value="Android">Android</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-slate-300">Loading devices...</div>
            ) : filteredDevices.length === 0 ? (
              <div className="text-center py-8 text-slate-300">No devices found</div>
            ) : (
              <div className="space-y-2">
                {filteredDevices.map(device => (
                  <Link key={device.id} to={createPageUrl('DeviceDetail', { id: device.id })}>
                    <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Monitor className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            <h3 className="text-white font-medium truncate">{device.hostname || device.device_id}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                            <span>{device.user || 'Unassigned'}</span>
                            <span>•</span>
                            <span>{device.os_family} {device.os_version}</span>
                            {device.agent_version && (
                              <>
                                <span>•</span>
                                <span>Agent v{device.agent_version}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 items-start">
                          <Badge className={`flex items-center gap-1 ${getStatusColor(device.agent_status)}`}>
                            {getStatusIcon(device.agent_status)}
                            {device.agent_status}
                          </Badge>
                          <Badge className={`${getComplianceColor(device.compliance_status)}`}>
                            {device.compliance_status}
                          </Badge>
                          {device.risk_score > 50 && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                              Risk: {device.risk_score}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="health" className="space-y-6">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => runHealthEvaluation.mutate()}
                disabled={runHealthEvaluation.isPending}
                className="border-slate-700"
              >
                {runHealthEvaluation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Run Health Evaluation
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="border-slate-700"
                disabled
              >
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            </div>

            <DeviceHealthOverview 
              devices={devices} 
              alerts={healthAlerts} 
              isLoading={isLoading}
            />

            <DeviceHealthList 
              devices={devices}
              onSelectDevice={setSelectedDevice}
              filter={healthFilter}
            />

            {selectedDevice && (
              <DeviceHealthDetail 
                device={selectedDevice}
                onClose={() => setSelectedDevice(null)}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}