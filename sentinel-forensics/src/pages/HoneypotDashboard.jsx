import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Hexagon,
  Plus,
  Activity,
  AlertTriangle,
  Shield,
  Loader2,
  RefreshCw,
  Power,
  Eye,
  BarChart,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { useOrgList } from '../components/hooks/useOrgQuery';

export default function HoneypotDashboard() {
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: honeypots = [], isLoading } = useOrgList('Honeypot');

  const deployHoneypotMutation = useMutation({
    mutationFn: async (config) => {
      const honeypotData = {
        honeypot_id: `hp-${Date.now()}`,
        honeypot_name: config.honeypot_name || `Honeypot ${Date.now()}`,
        honeypot_type: config.honeypot_type,
        status: 'active',
        deployment_config: config.deployment_config,
        alert_config: config.alert_config,
        interactions: [],
        alerts_generated: 0,
        metrics: {
          total_interactions: 0,
          unique_attackers: 0,
          successful_exploits: 0,
          uptime_hours: 0
        },
        created_at: new Date().toISOString()
      };
      
      return await base44.entities.Honeypot.create(honeypotData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['Honeypot'] });
      setShowDeployDialog(false);
      toast.success('Honeypot deployed successfully');
    },
    onError: (error) => {
      toast.error('Failed to deploy honeypot', {
        description: error.message
      });
    }
  });

  const deactivateHoneypotMutation = useMutation({
    mutationFn: async (honeypotId) => {
      const honeypot = honeypots.find(h => h.id === honeypotId);
      return await base44.entities.Honeypot.update(honeypotId, {
        status: 'inactive'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['Honeypot'] });
      toast.success('Honeypot deactivated');
    }
  });

  const activeHoneypots = honeypots.filter(h => h.status === 'active');
  const allInteractions = honeypots.flatMap(h => h.interactions || []);
  const totalAlerts = honeypots.reduce((sum, h) => sum + (h.alerts_generated || 0), 0);

  const honeypotTypes = {
    web_endpoint: { icon: '🌐', label: 'Web Endpoint', color: 'bg-blue-500/20 text-blue-400' },
    ssh_server: { icon: '🔐', label: 'SSH Server', color: 'bg-green-500/20 text-green-400' },
    smb_share: { icon: '📁', label: 'SMB Share', color: 'bg-purple-500/20 text-purple-400' },
    api_endpoint: { icon: '⚡', label: 'API Endpoint', color: 'bg-yellow-500/20 text-yellow-400' },
    database: { icon: '🗄️', label: 'Database', color: 'bg-red-500/20 text-red-400' },
    ble_peripheral: { icon: '📡', label: 'BLE Peripheral', color: 'bg-pink-500/20 text-pink-400' },
    ftp_server: { icon: '📤', label: 'FTP Server', color: 'bg-indigo-500/20 text-indigo-400' },
    rdp_server: { icon: '🖥️', label: 'RDP Server', color: 'bg-cyan-500/20 text-cyan-400' }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-red-600 rounded-lg flex items-center justify-center">
            <Hexagon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Honeypot Dashboard</h1>
            <p className="text-slate-400">Deploy decoys to detect and analyze attackers</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['Honeypot'] })}
            variant="outline"
            className="border-slate-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => setShowDeployDialog(true)}
            className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Deploy Honeypot
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Active Honeypots</p>
                <p className="text-3xl font-bold text-white mt-1">{activeHoneypots.length}</p>
              </div>
              <Activity className="w-10 h-10 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Honeypots</p>
                <p className="text-3xl font-bold text-white mt-1">{honeypots.length}</p>
              </div>
              <Hexagon className="w-10 h-10 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Interactions</p>
                <p className="text-3xl font-bold text-white mt-1">{allInteractions.length}</p>
              </div>
              <Eye className="w-10 h-10 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Alerts Generated</p>
                <p className="text-3xl font-bold text-white mt-1">{totalAlerts}</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="honeypots" className="w-full">
        <TabsList className="bg-slate-900/50 border border-slate-800">
          <TabsTrigger value="honeypots">
            <Shield className="w-4 h-4 mr-2" />
            Honeypots
          </TabsTrigger>
          <TabsTrigger value="live">
            <Activity className="w-4 h-4 mr-2" />
            Live Traffic
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="honeypots" className="mt-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Deployed Honeypots</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-400" />
                </div>
              ) : honeypots.length === 0 ? (
                <div className="text-center py-12">
                  <Hexagon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-lg text-slate-400">No honeypots deployed yet</p>
                  <Button
                    onClick={() => setShowDeployDialog(true)}
                    className="mt-4 bg-orange-600 hover:bg-orange-700"
                  >
                    Deploy Your First Honeypot
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {honeypots.map((honeypot) => {
                    const typeInfo = honeypotTypes[honeypot.honeypot_type] || {};
                    return (
                      <div
                        key={honeypot.id}
                        className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-orange-500/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-2xl">{typeInfo.icon}</span>
                              <h4 className="font-semibold text-white">
                                {honeypot.honeypot_name || honeypot.honeypot_id}
                              </h4>
                              <Badge className={typeInfo.color}>
                                {typeInfo.label}
                              </Badge>
                              <Badge className={
                                honeypot.status === 'active'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-slate-500/20 text-slate-400'
                              }>
                                {honeypot.status}
                              </Badge>
                              {honeypot.deployment_config?.vulnerability_profile && (
                                <Badge variant="outline" className="border-red-500/30 text-red-400">
                                  {honeypot.deployment_config.vulnerability_profile}
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm text-slate-400 mb-2">
                              <div>
                                <span className="text-slate-500">Hostname:</span>{' '}
                                {honeypot.deployment_config?.hostname || 'Auto'}
                              </div>
                              <div>
                                <span className="text-slate-500">Interactions:</span>{' '}
                                <span className="text-white font-semibold">
                                  {honeypot.interactions?.length || 0}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500">Alerts:</span>{' '}
                                <span className="text-red-400 font-semibold">
                                  {honeypot.alerts_generated || 0}
                                </span>
                              </div>
                            </div>
                            {honeypot.alert_config?.enabled && (
                              <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                                <AlertTriangle className="w-3 h-3" />
                                Alerts: {honeypot.alert_config.notification_channels?.join(', ') || 'email'}
                              </div>
                            )}
                            {honeypot.interactions && honeypot.interactions.length > 0 && (
                              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded">
                                <p className="text-sm text-red-300">
                                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                                  Latest attack from {honeypot.interactions[honeypot.interactions.length - 1].source_ip} -{' '}
                                  {formatDistanceToNow(new Date(honeypot.interactions[honeypot.interactions.length - 1].timestamp), { addSuffix: true })}
                                </p>
                              </div>
                            )}
                          </div>
                          {honeypot.status === 'active' && (
                            <Button
                              onClick={() => deactivateHoneypotMutation.mutate(honeypot.id)}
                              disabled={deactivateHoneypotMutation.isPending}
                              variant="outline"
                              size="sm"
                              className="border-slate-700"
                            >
                              <Power className="w-4 h-4 mr-2" />
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live" className="mt-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <p className="text-slate-400">Live traffic monitoring coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <p className="text-slate-400">Analytics dashboard coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}