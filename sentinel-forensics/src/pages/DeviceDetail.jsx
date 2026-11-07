import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Monitor, Activity, Shield, Clock, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { requestPolicyRefresh } from '@/functions/requestPolicyRefresh';
import { evaluateDeviceCompliance } from '@/functions/evaluateDeviceCompliance';
import { executeRemoteAction } from '@/functions/executeRemoteAction';

export default function DeviceDetail() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get('id');

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: async () => {
      const devices = await base44.entities.Device.filter({ 
        organization_id: user.organization_id,
        id: deviceId 
      });
      return devices[0];
    },
    enabled: !!user?.organization_id && !!deviceId
  });

  const { data: events = [] } = useQuery({
    queryKey: ['device-events', deviceId],
    queryFn: () => base44.entities.DeviceEvent.filter({ 
      organization_id: user.organization_id,
      device_id: deviceId 
    }, '-created_date', 50),
    enabled: !!user?.organization_id && !!deviceId
  });

  const policyRefreshMutation = useMutation({
    mutationFn: () => requestPolicyRefresh({ device_id: deviceId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['device-events', deviceId]);
      toast.success('Policy refresh requested');
    }
  });

  const complianceCheckMutation = useMutation({
    mutationFn: () => evaluateDeviceCompliance({ device_id: deviceId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['device', deviceId]);
      queryClient.invalidateQueries(['device-events', deviceId]);
      toast.success('Compliance check completed');
    }
  });

  const agentUpdateMutation = useMutation({
    mutationFn: () => executeRemoteAction({ 
      device_id: deviceId, 
      action_type: 'agent_update',
      parameters: { target_version: '2.0.0' }
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['device', deviceId]);
      queryClient.invalidateQueries(['device-events', deviceId]);
      toast.success(data.message || 'Agent update initiated');
    },
    onError: (error) => {
      toast.error(`Agent update failed: ${error.message}`);
    }
  });

  const rebootMutation = useMutation({
    mutationFn: () => executeRemoteAction({ 
      device_id: deviceId, 
      action_type: 'reboot',
      parameters: { force: false }
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['device', deviceId]);
      queryClient.invalidateQueries(['device-events', deviceId]);
      toast.success(data.message || 'Device reboot initiated');
    },
    onError: (error) => {
      toast.error(`Reboot failed: ${error.message}`);
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6 flex items-center justify-center">
        <p className="text-white">Loading device...</p>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <Card className="bg-red-900/20 border-red-500">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Device Not Found</h2>
            <p className="text-red-200">Unable to load device details</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{device.hostname || device.device_id}</h1>
            <p className="text-slate-300">{device.user || 'Unassigned'}</p>
          </div>
          <div className="flex gap-2">
            <Badge className={`${getStatusColor(device.agent_status)}`}>
              {device.agent_status}
            </Badge>
            <Badge className={`${getComplianceColor(device.compliance_status)}`}>
              {device.compliance_status}
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-slate-900/50 border border-slate-800">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="hardware">Hardware/Software</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <p className="text-sm text-slate-300 mb-1">Risk Score</p>
                  <p className="text-3xl font-bold text-white">{device.risk_score || 0}</p>
                  <div className="w-full h-2 bg-slate-800 rounded-full mt-2 overflow-hidden">
                    <div 
                      className={`h-full ${device.risk_score > 70 ? 'bg-red-500' : device.risk_score > 40 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${device.risk_score || 0}%` }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <p className="text-sm text-slate-300 mb-1">Agent Version</p>
                  <p className="text-xl font-bold text-white">{device.agent_version || 'Not installed'}</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <p className="text-sm text-slate-300 mb-1">Last Seen</p>
                  <p className="text-sm text-white">
                    {device.agent_last_seen_at ? new Date(device.agent_last_seen_at).toLocaleString() : 'Never'}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Device Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Device ID</p>
                    <p className="text-white font-mono text-sm">{device.device_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Serial</p>
                    <p className="text-white">{device.serial || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">OS</p>
                    <p className="text-white">{device.os_family} {device.os_version}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Architecture</p>
                    <p className="text-white">{device.architecture || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">IP Private</p>
                    <p className="text-white font-mono text-sm">{device.ip_private || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">IP Public</p>
                    <p className="text-white font-mono text-sm">{device.ip_public || 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hardware" className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Hardware Specs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">CPU</p>
                    <p className="text-white">{device.cpu_model || 'Unknown'}</p>
                    <p className="text-sm text-slate-400">{device.cpu_cores || 0} cores</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">RAM</p>
                    <p className="text-white">{device.ram_gb || 0} GB</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Total Disk</p>
                    <p className="text-white">{device.disk_total_gb || 0} GB</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Free Disk</p>
                    <p className="text-white">{device.disk_free_gb || 0} GB</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Network</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {device.macs && device.macs.length > 0 && (
                    <div>
                      <p className="text-sm text-slate-400 mb-1">MAC Addresses</p>
                      {device.macs.map((mac, i) => (
                        <p key={i} className="text-white font-mono text-sm">{mac}</p>
                      ))}
                    </div>
                  )}
                  {device.wifi_ssids && device.wifi_ssids.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm text-slate-400 mb-1">Known WiFi Networks</p>
                      {device.wifi_ssids.map((ssid, i) => (
                        <Badge key={i} variant="outline" className="mr-2 mb-2">{ssid}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Remote Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button 
                    onClick={() => complianceCheckMutation.mutate()}
                    disabled={complianceCheckMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    Run Compliance Check
                  </Button>
                  <Button 
                    onClick={() => agentUpdateMutation.mutate()}
                    disabled={agentUpdateMutation.isPending || device.agent_status === 'offline'}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${agentUpdateMutation.isPending ? 'animate-spin' : ''}`} />
                    Update Agent
                  </Button>
                  <Button 
                    onClick={() => rebootMutation.mutate()}
                    disabled={rebootMutation.isPending || device.agent_status === 'offline'}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${rebootMutation.isPending ? 'animate-spin' : ''}`} />
                    Reboot Device
                  </Button>
                  <Button 
                    onClick={() => policyRefreshMutation.mutate()}
                    disabled={policyRefreshMutation.isPending}
                    className="w-full"
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Request Policy Refresh
                  </Button>
                  {device.agent_status === 'offline' && (
                    <p className="text-sm text-red-400">
                      Device is offline - remote actions unavailable
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Action History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {events.filter(e => e.event_type === 'action_requested' || e.event_type === 'action_result').map(event => (
                    <div key={event.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm">{event.event_type}</span>
                        <span className="text-xs text-slate-400">
                          {new Date(event.created_date).toLocaleString()}
                        </span>
                      </div>
                      {event.status && (
                        <Badge className="mt-2" variant={event.status === 'success' ? 'default' : 'destructive'}>
                          {event.status}
                        </Badge>
                      )}
                    </div>
                  ))}
                  {events.filter(e => e.event_type === 'action_requested' || e.event_type === 'action_result').length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">No actions yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance" className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Compliance Status: {device.compliance_status}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <span className="text-white">Disk Encryption</span>
                    {device.disk_encryption_enabled ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <span className="text-white">Firewall</span>
                    {device.firewall_enabled ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <span className="text-white">Secure Boot</span>
                    {device.secure_boot_enabled ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <span className="text-white">EDR/AV Present</span>
                    {device.edr_present ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                </div>

                {device.critical_findings_count > 0 && (
                  <div className="mt-4 p-3 bg-red-900/20 border border-red-500/50 rounded-lg">
                    <p className="text-red-300 font-medium">
                      {device.critical_findings_count} critical violations
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Event Timeline</CardTitle>
              </CardHeader>
              <CardContent>
               <div className="space-y-3">
                 {events.map(event => {
                   const isActionEvent = event.event_type === 'action_requested' || event.event_type === 'action_result';
                   const isSuccess = event.status === 'success';
                   const isPending = event.status === 'pending';
                   const isFailed = event.status === 'failure';

                   return (
                     <div key={event.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                       <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2">
                           {isActionEvent && (
                             isPending ? <Clock className="w-4 h-4 text-yellow-400" /> :
                             isSuccess ? <CheckCircle className="w-4 h-4 text-green-400" /> :
                             isFailed ? <AlertTriangle className="w-4 h-4 text-red-400" /> :
                             <Activity className="w-4 h-4 text-blue-400" />
                           )}
                           <Badge variant="outline">
                             {event.payload?.action_name || event.event_type}
                           </Badge>
                           {event.status && (
                             <Badge className={
                               isPending ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                               isSuccess ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                               isFailed ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                               'bg-slate-500/20 text-slate-400 border-slate-500/50'
                             }>
                               {event.status}
                             </Badge>
                           )}
                         </div>
                         <span className="text-xs text-slate-400">
                           {new Date(event.created_date).toLocaleString()}
                         </span>
                       </div>
                       <p className="text-sm text-slate-300">
                         Actor: {event.actor} {event.actor_email && `(${event.actor_email})`}
                       </p>
                       {event.error_message && (
                         <p className="text-sm text-red-400 mt-1">Error: {event.error_message}</p>
                       )}
                       {event.payload?.result && (
                         <details className="mt-2">
                           <summary className="text-xs text-green-400 cursor-pointer">View result</summary>
                           <pre className="text-xs text-slate-300 mt-1 bg-slate-900/50 p-2 rounded overflow-auto">
                             {JSON.stringify(event.payload.result, null, 2)}
                           </pre>
                         </details>
                       )}
                     </div>
                   );
                 })}
                 {events.length === 0 && (
                   <p className="text-sm text-slate-400 text-center py-4">No events yet</p>
                 )}
               </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}