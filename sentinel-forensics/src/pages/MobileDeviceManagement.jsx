import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Smartphone,
  Shield,
  Lock,
  Settings,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Upload,
  Eye,
  X,
  RefreshCw,
  Plus,
  Search
} from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '../components/utils/formatters';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import MDMEffectivePolicyViewer from '../components/mdm/EffectivePolicyViewer';
import MDMLegalDisclaimer from '../components/legal/MDMLegalDisclaimer';
import DeviceRiskAlertsTab from '../components/mdm/DeviceRiskAlertsTab';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export default function MobileDeviceManagement() {
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [enrollmentData, setEnrollmentData] = useState({
    device_name: '',
    platform: 'ios'
  });
  const [actionData, setActionData] = useState({
    action_type: 'lock',
    justification: ''
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['mobile-devices'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('MobileDevice', '-enrolled_at', 100, 15000);
      } catch (error) {
        console.warn('Failed to load devices:', error);
        return [];
      }
    },
    initialData: [],
    retry: 1,
    staleTime: 60000,
    refetchOnWindowFocus: false
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['mdm-policies'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('MDMPolicy', '-created_date', 50, 10000);
      } catch (error) {
        console.warn('Failed to load policies:', error);
        return [];
      }
    },
    initialData: [],
    retry: 0,
    staleTime: 120000
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const deviceFingerprint = {
        model: 'User-provided',
        manufacturer: enrollmentData.platform === 'ios' ? 'Apple' : 'Android OEM',
        os_version: 'Unknown',
        device_id: `TEMP-${Date.now()}`
      };

      const response = await resilientAPI.callFunction('enrollMobileDevice', {
        device_name: enrollmentData.device_name,
        platform: enrollmentData.platform,
        device_fingerprint: deviceFingerprint,
        enrollment_method: 'manual'
      });

      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mobile-devices'] });
      setEnrollDialogOpen(false);
      setEnrollmentData({ device_name: '', platform: 'ios' });
      toast.success('Device enrolled successfully!', {
        description: data.enrollment_token ? `Token: ${data.enrollment_token.substring(0, 20)}...` : 'Device enrolled'
      });
    },
    onError: (error) => {
      toast.error('Enrollment failed', { description: error.message });
    }
  });

  const applyPolicyMutation = useMutation({
    mutationFn: async (policyId) => {
      const response = await resilientAPI.callFunction('applyMDMPolicy', {
        device_id: selectedDevice.id,
        policy_id: policyId
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mobile-devices'] });
      setPolicyDialogOpen(false);
      
      toast.success('Policy applied!', {
        description: data.compliance_percentage ? 
          `Compliance: ${data.compliance_percentage}% (${data.passed_checks}/${data.total_checks} checks)` :
          'Policy applied successfully'
      });
    },
    onError: (error) => {
      toast.error('Policy failed', { description: error.message });
    }
  });

  const actionMutation = useMutation({
    mutationFn: async () => {
      const response = await resilientAPI.callFunction('executeMDMAction', {
        device_id: selectedDevice.id,
        action_type: actionData.action_type,
        justification: actionData.justification
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mobile-devices'] });
      setActionDialogOpen(false);
      setActionData({ action_type: 'lock', justification: '' });
      
      toast.success('Action executed!', {
        description: data.result?.message || 'Action completed'
      });
    },
    onError: (error) => {
      toast.error('Action failed', { description: error.message });
    }
  });

  const analyzeDeviceMutation = useMutation({
    mutationFn: async (deviceId) => {
      const device = devices.find(d => d.id === deviceId);
      
      const response = await resilientAPI.callFunction('analyzeMDMProfile', {
        device_fingerprint: device.device_fingerprint,
        mdm_status: device.mdm_status
      });

      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mobile-devices'] });
      
      toast.success('MDM analysis complete!', {
        description: data.is_legitimate ? 
          `✅ Legitimate MDM (${data.legitimacy_score}/100)` : 
          `⚠️ Suspicious MDM detected!`
      });
    },
    onError: (error) => {
      toast.error('Analysis failed', { description: error.message });
    }
  });

  const getRiskColor = (score) => {
    if (score >= 75) return 'text-red-400';
    if (score >= 50) return 'text-orange-400';
    if (score >= 25) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getStatusBadge = (status) => {
    const config = {
      active: { color: 'bg-green-500/20 text-green-400', label: 'Active' },
      suspended: { color: 'bg-yellow-500/20 text-yellow-400', label: 'Suspended' },
      compromised: { color: 'bg-red-500/20 text-red-400', label: 'Compromised' },
      mdm_locked: { color: 'bg-orange-500/20 text-orange-400', label: 'Locked' },
      removed: { color: 'bg-slate-500/20 text-slate-400', label: 'Removed' }
    };

    return config[status] || config.active;
  };

  // Filter devices
  const filteredDevices = devices.filter(device => {
    const matchesSearch = !searchQuery ||
      device.device_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.platform?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || device.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Device Inventory Management</h1>
          <p className="text-slate-400">Track device metadata and security posture (requires MDM integration for remote control)</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['mobile-devices'] })}
            variant="outline"
            className="border-slate-700 text-white hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => setEnrollDialogOpen(true)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[44px]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Enroll Device
          </Button>
        </div>
      </div>

      <MDMLegalDisclaimer compact={true} />

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-3">
              <Smartphone className="w-8 h-8 md:w-10 md:h-10 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-2xl md:text-3xl font-bold text-white">{devices.length}</p>
                <p className="text-xs text-slate-400">Total Devices</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 md:w-10 md:h-10 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-2xl md:text-3xl font-bold text-white">
                  {devices.filter(d => d.status === 'active').length}
                </p>
                <p className="text-xs text-slate-400">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 md:w-10 md:h-10 text-orange-400 flex-shrink-0" />
              <div>
                <p className="text-2xl md:text-3xl font-bold text-white">
                  {devices.filter(d => d.mdm_status?.mdm_detected && d.mdm_status?.mdm_legitimacy_score < 50).length}
                </p>
                <p className="text-xs text-slate-400">Suspicious</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 md:w-10 md:h-10 text-purple-400 flex-shrink-0" />
              <div>
                <p className="text-2xl md:text-3xl font-bold text-white">
                  {devices.filter(d => d.security_status?.encryption_enabled).length}
                </p>
                <p className="text-xs text-slate-400">Encrypted</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search devices..."
            className="pl-10 bg-slate-800 border-slate-700 text-white"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48 bg-slate-800 border-slate-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-white">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="compromised">Compromised</SelectItem>
            <SelectItem value="mdm_locked">Locked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Device List */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Managed Devices ({filteredDevices.length})</CardTitle>
            <Badge className="bg-purple-500/20 text-purple-400">
              {policies.length} Policies
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {filteredDevices.length === 0 && devices.length === 0 ? (
            <div className="text-center py-12">
              <Smartphone className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-white mb-2">No devices enrolled</p>
              <p className="text-sm text-slate-400 mb-4">Get started by enrolling your first mobile device</p>
              <Button
                onClick={() => setEnrollDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Enroll First Device
              </Button>
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400">No devices match your filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDevices.map((device) => {
                const statusBadge = getStatusBadge(device.status);
                const lastSyncMinutes = Math.floor((Date.now() - new Date(device.last_sync || device.enrolled_at).getTime()) / 60000);
                const isOnline = lastSyncMinutes < 5;

                return (
                  <Card key={device.id} className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        {/* Device Info */}
                        <div className="flex items-start gap-4 flex-1 w-full md:w-auto">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            device.status === 'active' ? 'bg-green-500/20' :
                            device.status === 'compromised' ? 'bg-red-500/20' :
                            device.status === 'mdm_locked' ? 'bg-orange-500/20' :
                            'bg-slate-500/20'
                          }`}>
                            <Smartphone className={`w-6 h-6 ${
                              device.status === 'active' ? 'text-green-400' :
                              device.status === 'compromised' ? 'text-red-400' :
                              device.status === 'mdm_locked' ? 'text-orange-400' :
                              'text-slate-400'
                            }`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="text-lg font-semibold text-white">{device.device_name}</h3>
                              <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                                {device.platform}
                              </Badge>
                              <Badge className={`${statusBadge.color} text-xs`}>
                                {statusBadge.label}
                              </Badge>
                              {isOnline && (
                                <Badge className="bg-green-500/20 text-green-400 text-xs">
                                  Online
                                </Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-2 text-xs">
                              <div>
                                <p className="text-slate-500">Risk Score</p>
                                <p className={`font-semibold ${getRiskColor(device.risk_score || 50)}`}>
                                  {device.risk_score || 50}/100
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">Policy</p>
                                <p className="text-white truncate">
                                  {device.policy_state?.applied_policy_name || 'Default/Baseline'}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">Compliance</p>
                                <p className="text-white">
                                  {device.policy_state?.compliance_summary?.compliance_percentage || 0}%
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">Last Sync</p>
                                <p className="text-white">
                                  {isOnline ? 'Just now' : `${lastSyncMinutes}m ago`}
                                </p>
                              </div>
                            </div>

                            {/* Alerts */}
                            {(device.security_status?.is_rooted || device.security_status?.is_jailbroken) && (
                              <div className="bg-red-900/20 border border-red-500/30 rounded p-2 mb-2">
                                <p className="text-xs text-red-300 font-semibold">
                                  ⚠️ Device is {device.security_status.is_rooted ? 'Rooted' : 'Jailbroken'}
                                </p>
                              </div>
                            )}

                            {device.mdm_status?.mdm_detected && (
                              <div className={`border rounded p-2 ${
                                device.mdm_status.mdm_legitimacy_score >= 70 ?
                                  'bg-green-900/20 border-green-500/30' :
                                  'bg-yellow-900/20 border-yellow-500/30'
                              }`}>
                                <p className={`text-xs font-semibold mb-1 ${
                                  device.mdm_status.mdm_legitimacy_score >= 70 ? 'text-green-300' : 'text-yellow-300'
                                }`}>
                                  MDM: {device.mdm_status.mdm_vendor || 'Unknown'}
                                </p>
                                <p className="text-xs text-slate-400">
                                  Legitimacy: {device.mdm_status.mdm_legitimacy_score}/100
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap md:flex-col gap-2 w-full md:w-auto">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedDevice(device);
                              setDetailDialogOpen(true);
                            }}
                            variant="outline"
                            className="flex-1 md:flex-none border-slate-700 text-white hover:bg-slate-800 min-h-[44px]"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Details
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedDevice(device);
                              setPolicyDialogOpen(true);
                            }}
                            className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            Policy
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedDevice(device);
                              setActionDialogOpen(true);
                            }}
                            className="flex-1 md:flex-none bg-purple-600 hover:bg-purple-700 min-h-[44px]"
                          >
                            <Lock className="w-4 h-4 mr-2" />
                            Actions
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrollment Dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll Mobile Device</DialogTitle>
            <DialogDescription className="text-slate-400">
              Add a new iOS or Android device to MDM
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Device Name *</label>
              <Input
                value={enrollmentData.device_name}
                onChange={(e) => setEnrollmentData({...enrollmentData, device_name: e.target.value})}
                placeholder="e.g., John's iPhone 14"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <label className="text-sm text-slate-300 mb-2 block">Platform *</label>
              <Select 
                value={enrollmentData.platform} 
                onValueChange={(value) => setEnrollmentData({...enrollmentData, platform: value})}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="ios">iOS (iPhone/iPad)</SelectItem>
                  <SelectItem value="android">Android</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-900/20 border border-blue-500/30 rounded p-3">
              <p className="text-xs text-blue-300">
                <strong>Next steps:</strong>
                {enrollmentData.platform === 'ios' ? (
                  <> Download the configuration profile and install it via Settings → General → VPN & Device Management</>
                ) : (
                  <> Install the Sentinel app and enter your enrollment token when prompted</>
                )}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setEnrollDialogOpen(false)}
                className="border-slate-700 text-white hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={() => enrollMutation.mutate()}
                disabled={enrollMutation.isPending || !enrollmentData.device_name}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {enrollMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Enroll Device
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Policy Dialog */}
      <Dialog open={policyDialogOpen} onOpenChange={setPolicyDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Security Policy</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select a policy to apply to {selectedDevice?.device_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {policies.length === 0 ? (
              <p className="text-sm text-slate-400">No policies available. A default policy will be applied.</p>
            ) : (
              <Select onValueChange={(value) => applyPolicyMutation.mutate(value)}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select policy..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  {policies.map(p => (
                    <SelectItem key={p.id} value={p.policy_id}>
                      {p.policy_name}
                      {p.is_default && ' (Default)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {applyPolicyMutation.isPending && (
              <div className="flex items-center gap-2 text-blue-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Applying policy...</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Execute Remote Action</DialogTitle>
            <DialogDescription className="text-slate-400">
              Perform a remote action on {selectedDevice?.device_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Action Type *</label>
              <Select 
                value={actionData.action_type}
                onValueChange={(value) => setActionData({...actionData, action_type: value})}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="lock">🔒 Lock Device</SelectItem>
                  <SelectItem value="locate">📍 Locate Device</SelectItem>
                  <SelectItem value="sound_alarm">🔊 Sound Alarm</SelectItem>
                  <SelectItem value="collect_diagnostics">📊 Collect Diagnostics</SelectItem>
                  <SelectItem value="wipe">⚠️ Remote Wipe (Critical)</SelectItem>
                  <SelectItem value="revoke_access">🚫 Revoke Access</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(['wipe', 'revoke_access'].includes(actionData.action_type)) && (
              <>
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Justification * (Required for critical actions)</label>
                  <Textarea
                    value={actionData.justification}
                    onChange={(e) => setActionData({...actionData, justification: e.target.value})}
                    placeholder="Explain why this action is necessary..."
                    className="bg-slate-800 border-slate-700 text-white h-24"
                  />
                </div>

                <div className="bg-red-900/20 border border-red-500/30 rounded p-3">
                  <p className="text-xs text-red-300 font-semibold">
                    ⚠️ WARNING: This is a destructive action that cannot be undone.
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setActionDialogOpen(false)}
                className="border-slate-700 text-white hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={() => actionMutation.mutate()}
                disabled={actionMutation.isPending || 
                  (['wipe', 'revoke_access'].includes(actionData.action_type) && !actionData.justification)}
                className={
                  ['wipe', 'revoke_access'].includes(actionData.action_type) ?
                    'bg-red-600 hover:bg-red-700' :
                    'bg-purple-600 hover:bg-purple-700'
                }
              >
                {actionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4 mr-2" />
                )}
                Execute Action
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Device Details: {selectedDevice?.device_name}</DialogTitle>
          </DialogHeader>

          {selectedDevice && (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="bg-slate-800">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
                <TabsTrigger value="risk-alerts">Risk Alerts</TabsTrigger>
                <TabsTrigger value="effective-policy">Effective Policy</TabsTrigger>
                <TabsTrigger value="mdm">MDM Status</TabsTrigger>
                <TabsTrigger value="network">Network</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Platform</p>
                    <p className="text-white font-semibold">{selectedDevice.platform}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Status</p>
                    <Badge className={getStatusBadge(selectedDevice.status).color}>
                      {getStatusBadge(selectedDevice.status).label}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-slate-400">Enrolled</p>
                    <p className="text-white">{new Date(selectedDevice.enrolled_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Last Sync</p>
                    <p className="text-white">{formatRelativeTime(selectedDevice.last_sync)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Model</p>
                    <p className="text-white">{selectedDevice.device_fingerprint?.model || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">OS Version</p>
                    <p className="text-white">{selectedDevice.device_fingerprint?.os_version || 'Unknown'}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="risk-alerts" className="mt-4">
                <DeviceRiskAlertsTab deviceId={selectedDevice.id} />
              </TabsContent>

              <TabsContent value="effective-policy" className="mt-4">
                <MDMEffectivePolicyViewer device={selectedDevice} />
              </TabsContent>

              <TabsContent value="security" className="space-y-4 mt-4">
                <div>
                  <p className="text-sm text-slate-400 mb-3">Security Status</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Screen Lock', value: selectedDevice.security_status?.screen_lock_enabled },
                      { label: 'Encryption', value: selectedDevice.security_status?.encryption_enabled },
                      { label: 'Biometric Auth', value: selectedDevice.security_status?.biometric_enabled },
                      { label: 'Rooted/Jailbroken', value: selectedDevice.security_status?.is_rooted || selectedDevice.security_status?.is_jailbroken, inverted: true },
                      { label: 'Developer Mode', value: selectedDevice.security_status?.developer_mode_enabled, inverted: true }
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/50 rounded">
                        <span className="text-sm text-white">{item.label}</span>
                        {item.inverted ? (
                          item.value ? 
                            <X className="w-4 h-4 text-red-400" /> : 
                            <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          item.value ? 
                            <CheckCircle className="w-4 h-4 text-green-400" /> : 
                            <X className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-slate-400 mb-2">Risk Assessment</p>
                  <div className="bg-slate-800/50 rounded p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white">Risk Score</span>
                      <span className={`text-2xl font-bold ${getRiskColor(selectedDevice.risk_score || 50)}`}>
                        {selectedDevice.risk_score || 50}/100
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          selectedDevice.risk_score >= 75 ? 'bg-red-500' :
                          selectedDevice.risk_score >= 50 ? 'bg-orange-500' :
                          selectedDevice.risk_score >= 25 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${selectedDevice.risk_score || 50}%` }}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="mdm" className="space-y-4 mt-4">
                {selectedDevice.mdm_status?.mdm_detected ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-400">Vendor</p>
                        <p className="text-white font-semibold">{selectedDevice.mdm_status.mdm_vendor || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Legitimacy</p>
                        <p className={`font-semibold ${
                          selectedDevice.mdm_status.mdm_legitimacy_score >= 70 ? 'text-green-400' :
                          selectedDevice.mdm_status.mdm_legitimacy_score >= 40 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {selectedDevice.mdm_status.mdm_legitimacy_score}/100
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Supervised</p>
                        <p className="text-white">{selectedDevice.mdm_status.is_supervised ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Type</p>
                        <p className="text-white">{selectedDevice.mdm_status.supervision_type || 'none'}</p>
                      </div>
                    </div>

                    <Button
                      onClick={() => analyzeDeviceMutation.mutate(selectedDevice.id)}
                      disabled={analyzeDeviceMutation.isPending}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      {analyzeDeviceMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Analyzing MDM Profile...
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Re-analyze MDM Profile
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm">No MDM profile detected on this device</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="network" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Current IP</p>
                    <p className="text-white font-mono text-xs">
                      {selectedDevice.network_info?.current_ip || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Network</p>
                    <p className="text-white">{selectedDevice.network_info?.current_network || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">VPN Active</p>
                    <p className="text-white">{selectedDevice.network_info?.vpn_active ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Proxy Detected</p>
                    <p className="text-white">{selectedDevice.network_info?.proxy_detected ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}