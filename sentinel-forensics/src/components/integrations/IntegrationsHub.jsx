import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plug,
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

export default function IntegrationsHub() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newConnector, setNewConnector] = useState({
    connector_type: 'splunk',
    name: '',
    description: '',
    configuration: {
      api_endpoint: '',
      auth_type: 'api_key'
    }
  });

  const queryClient = useQueryClient();

  const { data: connectors = [] } = useQuery({
    queryKey: ['integration-connectors'],
    queryFn: () => base44.entities.IntegrationConnector.filter({})
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['integration-jobs'],
    queryFn: () => base44.entities.IntegrationJob.filter({}, '-started_at', 20)
  });

  const manageMutation = useMutation({
    mutationFn: (params) => base44.functions.invoke('manageIntegrationConnector', params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['integration-connectors'] });
      if (variables.action === 'create') {
        setShowAddDialog(false);
        toast.success('Connector created');
      } else if (variables.action === 'delete') {
        toast.success('Connector deleted');
      } else if (variables.action === 'test') {
        toast.success('Connection successful');
      }
    },
    onError: (error) => {
      toast.error('Operation failed', { description: error.message });
    }
  });

  const handleCreate = async () => {
    if (!newConnector.name || !newConnector.configuration.api_endpoint) {
      toast.error('Name and API endpoint required');
      return;
    }

    manageMutation.mutate({
      action: 'create',
      connector_data: newConnector
    });
  };

  const handleTest = (connector) => {
    manageMutation.mutate({
      action: 'test',
      connector_id: connector.id
    });
  };

  const handleDelete = (connectorId) => {
    if (confirm('Delete this connector?')) {
      manageMutation.mutate({
        action: 'delete',
        connector_id: connectorId
      });
    }
  };

  const getStatusIcon = (status) => {
    const icons = {
      active: <CheckCircle className="w-4 h-4 text-green-400" />,
      inactive: <XCircle className="w-4 h-4 text-slate-400" />,
      error: <AlertTriangle className="w-4 h-4 text-red-400" />,
      testing: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
    };
    return icons[status] || icons.inactive;
  };

  const connectorTypes = [
    { value: 'splunk', label: 'Splunk SIEM' },
    { value: 'qradar', label: 'IBM QRadar' },
    { value: 'elastic_siem', label: 'Elastic SIEM' },
    { value: 'misp', label: 'MISP Threat Intel' },
    { value: 'threatconnect', label: 'ThreatConnect' },
    { value: 'relativity', label: 'Relativity eDiscovery' },
    { value: 'nuix', label: 'Nuix' },
    { value: 'encase', label: 'EnCase' },
    { value: 'cellebrite', label: 'Cellebrite' },
    { value: 'crowdstrike', label: 'CrowdStrike' },
    { value: 'sentinel_one', label: 'SentinelOne' }
  ];

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Plug className="w-5 h-5 text-blue-400" />
              Integration Hub
            </CardTitle>
            <Button
              onClick={() => setShowAddDialog(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Connector
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="connectors">
            <TabsList className="bg-slate-800 border-slate-700">
              <TabsTrigger value="connectors">Connectors ({connectors.length})</TabsTrigger>
              <TabsTrigger value="jobs">Recent Jobs ({jobs.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="connectors" className="space-y-3 mt-4">
              {connectors.length === 0 ? (
                <div className="text-center py-12">
                  <Plug className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-slate-400 mb-4">No connectors configured</p>
                  <Button onClick={() => setShowAddDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Connector
                  </Button>
                </div>
              ) : (
                connectors.map(connector => (
                  <Card key={connector.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          {getStatusIcon(connector.status)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-white font-semibold">{connector.name}</h3>
                              <Badge className="bg-blue-500/20 text-blue-300">
                                {connectorTypes.find(t => t.value === connector.connector_type)?.label || connector.connector_type}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-400">{connector.description}</p>
                            <div className="mt-2 text-xs text-slate-500">
                              <p>Endpoint: {connector.configuration?.api_endpoint}</p>
                              {connector.last_sync && (
                                <p>Last sync: {new Date(connector.last_sync).toLocaleString()}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleTest(connector)}
                            disabled={manageMutation.isPending}
                            size="sm"
                            variant="outline"
                            className="border-slate-700"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                          <Button
                            onClick={() => handleDelete(connector.id)}
                            disabled={manageMutation.isPending}
                            size="sm"
                            variant="outline"
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="jobs" className="space-y-3 mt-4">
              {jobs.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-slate-400">No integration jobs yet</p>
                </div>
              ) : (
                jobs.map(job => (
                  <Card key={job.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {job.direction === 'inbound' ? (
                            <Download className="w-5 h-5 text-green-400" />
                          ) : (
                            <Upload className="w-5 h-5 text-blue-400" />
                          )}
                          <div>
                            <p className="text-white font-medium">{job.job_type} • {job.direction}</p>
                            <p className="text-sm text-slate-400">
                              {job.records_processed} records processed
                            </p>
                          </div>
                        </div>
                        <Badge className={
                          job.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                          job.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                          job.status === 'running' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-slate-500/20 text-slate-300'
                        }>
                          {job.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add Connector Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Integration Connector</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Connector Type</Label>
              <Select
                value={newConnector.connector_type}
                onValueChange={(v) => setNewConnector({ ...newConnector, connector_type: v })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  {connectorTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Connector Name</Label>
              <Input
                value={newConnector.name}
                onChange={(e) => setNewConnector({ ...newConnector, name: e.target.value })}
                placeholder="My Splunk Instance"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={newConnector.description}
                onChange={(e) => setNewConnector({ ...newConnector, description: e.target.value })}
                placeholder="Corporate SIEM logs"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div>
              <Label>API Endpoint</Label>
              <Input
                value={newConnector.configuration.api_endpoint}
                onChange={(e) => setNewConnector({
                  ...newConnector,
                  configuration: { ...newConnector.configuration, api_endpoint: e.target.value }
                })}
                placeholder="https://api.example.com"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-sm text-yellow-200">
                <strong>Note:</strong> API credentials should be configured as secrets in the app settings.
                Reference them by secret name in connector configuration.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setShowAddDialog(false)}
                variant="outline"
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={manageMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {manageMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Create Connector
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}