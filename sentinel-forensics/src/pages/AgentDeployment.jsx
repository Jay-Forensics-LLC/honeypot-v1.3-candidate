import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Rocket,
  Download,
  Copy,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Settings,
  Terminal,
  FileCode
} from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '../components/utils/formatters';
import { initiateDeployment } from '../functions/initiateDeployment';
import { updateDeploymentStatus } from '../functions/updateDeploymentStatus';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export default function AgentDeployment() {
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [deploymentConfig, setDeploymentConfig] = useState({
    deployment_name: '',
    deployment_method: 'ansible',
    platform: 'linux',
    target_endpoints: [],
    configuration: {
      monitoring_enabled: true,
      log_collection_enabled: true,
      network_capture_enabled: false,
      reporting_interval_seconds: 300,
      log_level: 'info'
    }
  });
  const [targetHostnames, setTargetHostnames] = useState('');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: deploymentJobs = [], isLoading } = useQuery({
    queryKey: ['deployment-jobs'],
    queryFn: async () => {
      try {
        return await base44.entities.DeploymentJob.list('-started_at', 50);
      } catch (error) {
        console.warn('Failed to load deployment jobs:', error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  const initiateDeploymentMutation = useMutation({
    mutationFn: async (config) => {
      // Parse hostnames
      const hostnames = targetHostnames
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      const targets = hostnames.map(hostname => ({
        hostname,
        platform: config.platform,
        deployment_group: 'default'
      }));

      const { data } = await initiateDeployment({
        ...config,
        target_endpoints: targets
      });

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deployment-jobs'] });
      setDeployDialogOpen(false);
      setSelectedJob(data);
      toast.success('Deployment job created!', {
        description: `${data.targets} targets queued for deployment`
      });
    },
    onError: (error) => {
      toast.error('Deployment failed: ' + error.message);
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (jobId) => {
      const { data } = await updateDeploymentStatus({ job_id: jobId });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deployment-jobs'] });
      toast.success('Status updated', {
        description: `${data.succeeded} succeeded, ${data.failed} failed, ${data.pending} pending`
      });
    },
    onError: (error) => {
      toast.error('Status update failed: ' + error.message);
    }
  });

  const activeJobs = deploymentJobs.filter(j => 
    j.status === 'preparing' || j.status === 'deploying'
  );

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const downloadScript = (script, filename) => {
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Script downloaded');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Agent Deployment Automation</h1>
          <p className="text-slate-400">Enterprise-scale agent deployment with status tracking</p>
        </div>
        <Button
          onClick={() => setDeployDialogOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          <Rocket className="w-4 h-4 mr-2" />
          New Deployment
        </Button>
      </div>

      {/* Active Deployments */}
      {activeJobs.length > 0 && (
        <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-500/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              Active Deployments ({activeJobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeJobs.map(job => (
              <Card key={job.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-white">{job.deployment_name}</h3>
                      <p className="text-sm text-slate-400">
                        {job.deployment_method} • {job.platform} • {formatRelativeTime(job.started_at)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => updateStatusMutation.mutate(job.job_id)}
                      disabled={updateStatusMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>Progress</span>
                      <span>{job.progress?.percentage || 0}%</span>
                    </div>
                    <Progress value={job.progress?.percentage || 0} className="h-2" />
                    
                    <div className="grid grid-cols-4 gap-2 text-xs mt-3">
                      <div className="bg-slate-900/50 rounded p-2 text-center">
                        <p className="text-green-400 font-bold">{job.progress?.succeeded || 0}</p>
                        <p className="text-slate-500">Success</p>
                      </div>
                      <div className="bg-slate-900/50 rounded p-2 text-center">
                        <p className="text-red-400 font-bold">{job.progress?.failed || 0}</p>
                        <p className="text-slate-500">Failed</p>
                      </div>
                      <div className="bg-slate-900/50 rounded p-2 text-center">
                        <p className="text-blue-400 font-bold">{job.progress?.in_progress || 0}</p>
                        <p className="text-slate-500">In Progress</p>
                      </div>
                      <div className="bg-slate-900/50 rounded p-2 text-center">
                        <p className="text-slate-400 font-bold">{job.progress?.pending || 0}</p>
                        <p className="text-slate-500">Pending</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Deployment History */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Deployment History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : deploymentJobs.length === 0 ? (
            <div className="text-center py-12">
              <Rocket className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-white mb-2">No deployments yet</p>
              <p className="text-sm text-slate-400">Create your first automated deployment</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deploymentJobs.map(job => (
                <Card key={job.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-lg font-semibold text-white">{job.deployment_name}</h3>
                          <Badge className={
                            job.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            job.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                            job.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                            job.status === 'deploying' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-500/20 text-slate-400'
                          }>
                            {job.status}
                          </Badge>
                          <Badge className="bg-purple-500/20 text-purple-400">
                            {job.deployment_method}
                          </Badge>
                          <Badge className="bg-blue-500/20 text-blue-400">
                            {job.platform}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs mb-3">
                          <div>
                            <p className="text-slate-500">Total Targets</p>
                            <p className="text-white font-semibold">{job.total_targets}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Succeeded</p>
                            <p className="text-green-400 font-semibold">{job.progress?.succeeded || 0}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Failed</p>
                            <p className="text-red-400 font-semibold">{job.progress?.failed || 0}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Progress</p>
                            <p className="text-white font-semibold">{job.progress?.percentage || 0}%</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Duration</p>
                            <p className="text-white font-semibold">
                              {job.duration_minutes ? `${job.duration_minutes}m` : 'In progress'}
                            </p>
                          </div>
                        </div>

                        <p className="text-xs text-slate-400">
                          Started {formatRelativeTime(job.started_at)} by {job.initiated_by}
                        </p>
                      </div>

                      <div className="flex flex-wrap md:flex-col gap-2">
                        {job.deployment_script && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => copyToClipboard(job.deployment_script)}
                              className="bg-slate-700 hover:bg-slate-600"
                            >
                              <Copy className="w-4 h-4 mr-2" />
                              Copy Script
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => downloadScript(
                                job.deployment_script, 
                                `deploy-${job.platform}-${job.deployment_method}.${job.deployment_method === 'ansible' ? 'yml' : job.deployment_method === 'puppet' ? 'pp' : 'sh'}`
                              )}
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          </>
                        )}
                        {(job.status === 'deploying' || job.status === 'preparing') && (
                          <Button
                            size="sm"
                            onClick={() => updateStatusMutation.mutate(job.job_id)}
                            disabled={updateStatusMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Update
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Endpoint Status Details */}
                    {job.endpoint_statuses && job.endpoint_statuses.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-700">
                        <p className="text-sm font-semibold text-white mb-3">Endpoint Status:</p>
                        <div className="grid gap-2 max-h-48 overflow-y-auto">
                          {job.endpoint_statuses.map((endpoint, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-slate-900/50 rounded p-2 text-xs">
                              <div className="flex items-center gap-2">
                                {endpoint.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-400" />}
                                {endpoint.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                                {endpoint.status === 'pending' && <Clock className="w-4 h-4 text-slate-400" />}
                                {['downloading', 'installing', 'configuring', 'verifying'].includes(endpoint.status) && 
                                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                }
                                <span className="text-white font-medium">{endpoint.hostname}</span>
                                {endpoint.agent_id && (
                                  <Badge className="bg-green-500/20 text-green-400 text-[10px]">
                                    {endpoint.installed_version}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={
                                  endpoint.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                  endpoint.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                  endpoint.status === 'pending' ? 'bg-slate-500/20 text-slate-400' :
                                  'bg-blue-500/20 text-blue-400'
                                }>
                                  {endpoint.status}
                                </Badge>
                                {endpoint.error_message && (
                                  <AlertTriangle className="w-4 h-4 text-red-400" title={endpoint.error_message} />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Deployment Dialog */}
      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Create Agent Deployment</DialogTitle>
            <DialogDescription className="text-slate-400">
              Configure automated agent deployment for your enterprise environment
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Config */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white">Deployment Name *</Label>
                <Input
                  value={deploymentConfig.deployment_name}
                  onChange={(e) => setDeploymentConfig({...deploymentConfig, deployment_name: e.target.value})}
                  placeholder="e.g., Production Servers - Wave 1"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white">Deployment Method *</Label>
                <Select
                  value={deploymentConfig.deployment_method}
                  onValueChange={(value) => setDeploymentConfig({...deploymentConfig, deployment_method: value})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="intune">Microsoft Intune</SelectItem>
                    <SelectItem value="jamf">Jamf Pro</SelectItem>
                    <SelectItem value="sccm">SCCM</SelectItem>
                    <SelectItem value="ansible">Ansible</SelectItem>
                    <SelectItem value="chef">Chef</SelectItem>
                    <SelectItem value="puppet">Puppet</SelectItem>
                    <SelectItem value="manual_script">Manual Script</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Platform *</Label>
                <Select
                  value={deploymentConfig.platform}
                  onValueChange={(value) => setDeploymentConfig({...deploymentConfig, platform: value})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="windows">Windows</SelectItem>
                    <SelectItem value="macos">macOS</SelectItem>
                    <SelectItem value="linux">Linux</SelectItem>
                    <SelectItem value="mixed">Mixed Environment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Target Endpoints */}
            <div className="space-y-2">
              <Label className="text-white">Target Hostnames (one per line)</Label>
              <Textarea
                value={targetHostnames}
                onChange={(e) => setTargetHostnames(e.target.value)}
                placeholder="server01.example.com&#10;server02.example.com&#10;workstation-123"
                className="bg-slate-800 border-slate-700 text-white font-mono text-sm"
                rows={6}
              />
              <p className="text-xs text-slate-500">
                {targetHostnames.split('\n').filter(l => l.trim()).length} endpoints specified
              </p>
            </div>

            {/* Agent Configuration */}
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Agent Configuration
              </h3>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <Label className="text-white">Enable Monitoring</Label>
                  <Switch
                    checked={deploymentConfig.configuration.monitoring_enabled}
                    onCheckedChange={(checked) => setDeploymentConfig({
                      ...deploymentConfig,
                      configuration: {...deploymentConfig.configuration, monitoring_enabled: checked}
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-white">Enable Log Collection</Label>
                  <Switch
                    checked={deploymentConfig.configuration.log_collection_enabled}
                    onCheckedChange={(checked) => setDeploymentConfig({
                      ...deploymentConfig,
                      configuration: {...deploymentConfig.configuration, log_collection_enabled: checked}
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-white">Network Capture</Label>
                  <Switch
                    checked={deploymentConfig.configuration.network_capture_enabled}
                    onCheckedChange={(checked) => setDeploymentConfig({
                      ...deploymentConfig,
                      configuration: {...deploymentConfig.configuration, network_capture_enabled: checked}
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Log Level</Label>
                  <Select
                    value={deploymentConfig.configuration.log_level}
                    onValueChange={(value) => setDeploymentConfig({
                      ...deploymentConfig,
                      configuration: {...deploymentConfig.configuration, log_level: value}
                    })}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      <SelectItem value="debug">Debug</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warn">Warn</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
              <Button variant="outline" onClick={() => setDeployDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => initiateDeploymentMutation.mutate(deploymentConfig)}
                disabled={
                  initiateDeploymentMutation.isPending || 
                  !deploymentConfig.deployment_name || 
                  targetHostnames.split('\n').filter(l => l.trim()).length === 0
                }
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {initiateDeploymentMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Initiate Deployment
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deployment Details Dialog */}
      {selectedJob && (
        <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {selectedJob.deployment_name}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Deployment created successfully. Follow the next steps to execute.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Enrollment Token */}
              <Card className="bg-blue-900/20 border-blue-500/30">
                <CardHeader>
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    Enrollment Token
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-slate-900 rounded text-green-400 font-mono text-xs break-all">
                      {selectedJob.enrollment_token}
                    </code>
                    <Button
                      size="sm"
                      onClick={() => copyToClipboard(selectedJob.enrollment_token)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Deployment Script */}
              {selectedJob.deployment_script && (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-sm flex items-center gap-2">
                        <FileCode className="w-4 h-4" />
                        Deployment Script
                      </CardTitle>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => copyToClipboard(selectedJob.deployment_script)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => downloadScript(
                            selectedJob.deployment_script,
                            `deploy-${selectedJob.job_id}.txt`
                          )}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-slate-900 p-4 rounded text-xs text-green-400 overflow-x-auto max-h-96 overflow-y-auto">
                      {selectedJob.deployment_script}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {/* Next Steps */}
              {selectedJob.next_steps && (
                <Card className="bg-green-900/20 border-green-500/30">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Next Steps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-2 text-sm text-green-200">
                      {selectedJob.next_steps.map((step, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="font-semibold">{idx + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}

              <Button
                onClick={() => setSelectedJob(null)}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}