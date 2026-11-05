
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Zap,
  Plus,
  Play,
  Settings,
  Trash2,
  Loader2,
  CheckCircle,
  GitBranch,
  Database,
  Network,
  Cpu,
  HardDrive,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import { executeForensicWorkflow } from '../functions/executeForensicWorkflow';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export default function ForensicWorkflows() {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [newWorkflow, setNewWorkflow] = useState({
    template_name: '',
    template_type: 'network_intrusion',
    description: '',
    workflow_steps: []
  });
  const [currentStep, setCurrentStep] = useState({
    step_name: '',
    step_type: 'collect_evidence',
    action_config: {},
    timeout_seconds: 300,
    retry_on_failure: true
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['forensic-workflows'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('ForensicWorkflowTemplate', '-created_date', 100, 15000);
      } catch (error) {
        console.warn('Failed to load workflows:', error);
        return [];
      }
    },
    initialData: []
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents-for-workflow'],
    queryFn: async () => {
      try {
        return await resilientAPI.filterEntity('EndpointAgent', { status: 'online' }, '-last_heartbeat', 50, 0, 10000);
      } catch (error) {
        return [];
      }
    },
    initialData: []
  });

  const forensicToolkits = {
    volatility: {
      name: 'Volatility',
      description: 'Memory forensics framework',
      icon: Cpu,
      color: 'purple',
      actions: ['memory_dump', 'process_list', 'network_connections', 'dll_list', 'registry_hives']
    },
    autopsy: {
      name: 'Autopsy',
      description: 'Disk imaging and analysis',
      icon: HardDrive,
      color: 'blue',
      actions: ['disk_image', 'file_carving', 'timeline_analysis', 'deleted_file_recovery']
    },
    wireshark: {
      name: 'Wireshark',
      description: 'Network packet analysis',
      icon: Network,
      color: 'green',
      actions: ['network_pcap', 'protocol_analysis', 'stream_extraction']
    },
    osquery: {
      name: 'OSQuery',
      description: 'System state queries',
      icon: Database,
      color: 'yellow',
      actions: ['running_processes', 'installed_software', 'user_accounts', 'firewall_rules']
    }
  };

  const stepTypes = [
    { value: 'collect_evidence', label: 'Collect Evidence', icon: Database },
    { value: 'calculate_hash', label: 'Calculate Hash', icon: CheckCircle },
    { value: 'encrypt_evidence', label: 'Encrypt Evidence', icon: Eye },
    { value: 'run_scan', label: 'Run Security Scan', icon: Settings },
    { value: 'extract_iocs', label: 'Extract IOCs', icon: Network },
    { value: 'enrich_threat_intel', label: 'Enrich Threat Intel', icon: Zap },
    { value: 'correlate_data', label: 'Correlate Data', icon: GitBranch },
    { value: 'collect_memory_dump', label: 'Memory Dump (Volatility)', icon: Cpu },
    { value: 'collect_disk_image', label: 'Disk Image (Autopsy)', icon: HardDrive },
    { value: 'collect_network_capture', label: 'Network Capture (Wireshark)', icon: Network },
  ];

  const addStepToWorkflow = () => {
    if (!currentStep.step_name) {
      toast.error('Step name is required');
      return;
    }

    setNewWorkflow({
      ...newWorkflow,
      workflow_steps: [
        ...newWorkflow.workflow_steps,
        {
          ...currentStep,
          step_order: newWorkflow.workflow_steps.length + 1
        }
      ]
    });

    setCurrentStep({
      step_name: '',
      step_type: 'collect_evidence',
      action_config: {},
      timeout_seconds: 300,
      retry_on_failure: true
    });

    toast.success('Step added to workflow');
  };

  const createWorkflowMutation = useMutation({
    mutationFn: async () => {
      const workflow = await base44.entities.ForensicWorkflowTemplate.create({
        template_id: `FLOW-${Date.now()}`,
        ...newWorkflow,
        enabled: true,
        execution_count: 0,
        success_count: 0,
        failure_count: 0,
        created_by: user.email
      });

      return workflow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forensic-workflows'] });
      setBuilderOpen(false);
      setNewWorkflow({
        template_name: '',
        template_type: 'network_intrusion',
        description: '',
        workflow_steps: []
      });
      toast.success('Forensic workflow created!');
    },
    onError: (error) => {
      toast.error('Failed to create workflow: ' + error.message);
    }
  });

  const executeWorkflowMutation = useMutation({
    mutationFn: async ({ workflowId, targetAgents, caseId }) => {
      const { data } = await executeForensicWorkflow({
        workflow_id: workflowId,
        target_agent_ids: targetAgents,
        case_id: caseId
      });

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['forensic-workflows'] });
      setExecuteDialogOpen(false);
      toast.success('Workflow execution started!', {
        description: `${data.commands_dispatched} commands dispatched`
      });
    },
    onError: (error) => {
      toast.error('Execution failed: ' + error.message);
    }
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Forensic Workflows</h1>
          <p className="text-slate-400">Automated multi-step forensic investigations with AI optimization</p>
        </div>
        <Button
          onClick={() => setBuilderOpen(true)}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {/* Forensic Toolkits */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Available Forensic Toolkits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            {Object.entries(forensicToolkits).map(([key, toolkit]) => {
              const Icon = toolkit.icon;
              return (
                <Card key={key} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-${toolkit.color}-500/20 mb-3`}>
                      <Icon className={`w-6 h-6 text-${toolkit.color}-400`} />
                    </div>
                    <h3 className="font-semibold text-white mb-1">{toolkit.name}</h3>
                    <p className="text-xs text-slate-400 mb-2">{toolkit.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {toolkit.actions.slice(0, 3).map((action, i) => (
                        <Badge key={i} className="bg-slate-700 text-slate-300 text-[10px]">
                          {action}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Workflow List */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Defined Workflows ({workflows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {workflows.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-white mb-2">No workflows defined</p>
              <p className="text-sm text-slate-400">Create your first automated forensic workflow</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workflows.map((workflow) => (
                <Card key={workflow.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">{workflow.template_name}</h3>
                          <Badge className="bg-purple-500/20 text-purple-400">
                            {workflow.template_type}
                          </Badge>
                          <Badge className={workflow.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                            {workflow.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>

                        <p className="text-sm text-slate-400 mb-3">{workflow.description}</p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-slate-500">Steps</p>
                            <p className="text-white font-semibold">{workflow.workflow_steps?.length || 0}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Executions</p>
                            <p className="text-white font-semibold">{workflow.execution_count || 0}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Success Rate</p>
                            <p className="text-white font-semibold">
                              {workflow.execution_count > 0 ? 
                                Math.round((workflow.success_count / workflow.execution_count) * 100) : 0}%
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Avg Duration</p>
                            <p className="text-white font-semibold">
                              {workflow.average_duration_minutes ? `${workflow.average_duration_minutes}m` : 'N/A'}
                            </p>
                          </div>
                        </div>

                        {workflow.workflow_steps && workflow.workflow_steps.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-700">
                            <p className="text-xs text-slate-500 mb-2">Workflow Steps:</p>
                            <div className="flex flex-wrap gap-2">
                              {workflow.workflow_steps.map((step, i) => {
                                const stepType = stepTypes.find(t => t.value === step.step_type);
                                const StepIcon = stepType?.icon || Settings;
                                return (
                                  <div key={i} className="flex items-center gap-1 bg-slate-900/50 rounded px-2 py-1">
                                    <StepIcon className="w-3 h-3 text-blue-400" />
                                    <span className="text-xs text-slate-300">{step.step_name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedWorkflow(workflow);
                            setExecuteDialogOpen(true);
                          }}
                          disabled={!workflow.enabled}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Execute
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workflow Builder Dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Build Forensic Workflow</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Workflow Metadata */}
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-300 mb-2 block">Workflow Name *</label>
                <Input
                  value={newWorkflow.template_name}
                  onChange={(e) => setNewWorkflow({...newWorkflow, template_name: e.target.value})}
                  placeholder="e.g., Advanced Malware Investigation"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div>
                <label className="text-sm text-slate-300 mb-2 block">Workflow Type *</label>
                <Select 
                  value={newWorkflow.template_type} 
                  onValueChange={(value) => setNewWorkflow({...newWorkflow, template_type: value})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="network_intrusion">Network Intrusion</SelectItem>
                    <SelectItem value="malware_analysis">Malware Analysis</SelectItem>
                    <SelectItem value="mobile_device_forensics">Mobile Device Forensics</SelectItem>
                    <SelectItem value="data_breach_response">Data Breach Response</SelectItem>
                    <SelectItem value="ransomware_investigation">Ransomware Investigation</SelectItem>
                    <SelectItem value="insider_threat">Insider Threat</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-slate-300 mb-2 block">Description</label>
                <Textarea
                  value={newWorkflow.description}
                  onChange={(e) => setNewWorkflow({...newWorkflow, description: e.target.value})}
                  placeholder="Describe what this workflow does..."
                  className="bg-slate-800 border-slate-700"
                  rows={2}
                />
              </div>
            </div>

            {/* Step Builder */}
            <div className="border border-blue-500/30 rounded-lg p-4 bg-blue-900/10">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                Add Workflow Step
              </h3>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Step Name *</label>
                  <Input
                    value={currentStep.step_name}
                    onChange={(e) => setCurrentStep({...currentStep, step_name: e.target.value})}
                    placeholder="e.g., Collect memory dump"
                    className="bg-slate-800 border-slate-700"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Step Type *</label>
                  <Select 
                    value={currentStep.step_type} 
                    onValueChange={(value) => setCurrentStep({...currentStep, step_type: value})}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      {stepTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Timeout (seconds)</label>
                  <Input
                    type="number"
                    value={currentStep.timeout_seconds}
                    onChange={(e) => setCurrentStep({...currentStep, timeout_seconds: parseInt(e.target.value)})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-300">Retry on Failure</label>
                  <Switch
                    checked={currentStep.retry_on_failure}
                    onCheckedChange={(checked) => setCurrentStep({...currentStep, retry_on_failure: checked})}
                  />
                </div>
              </div>

              <Button
                onClick={addStepToWorkflow}
                disabled={!currentStep.step_name}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Step to Workflow
              </Button>
            </div>

            {/* Steps Preview */}
            {newWorkflow.workflow_steps.length > 0 && (
              <div>
                <h3 className="font-semibold text-white mb-3">Workflow Steps ({newWorkflow.workflow_steps.length})</h3>
                <div className="space-y-2">
                  {newWorkflow.workflow_steps.map((step, i) => {
                    const stepType = stepTypes.find(t => t.value === step.step_type);
                    const StepIcon = stepType?.icon || Settings;
                    
                    return (
                      <div key={i} className="flex items-center gap-3 bg-slate-800/50 rounded p-3">
                        <Badge className="bg-blue-500/20 text-blue-400">
                          {i + 1}
                        </Badge>
                        <StepIcon className="w-5 h-5 text-blue-400" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{step.step_name}</p>
                          <p className="text-xs text-slate-400">{stepType?.label}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setNewWorkflow({
                              ...newWorkflow,
                              workflow_steps: newWorkflow.workflow_steps.filter((_, idx) => idx !== i)
                            });
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
              <Button variant="outline" onClick={() => setBuilderOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createWorkflowMutation.mutate()}
                disabled={createWorkflowMutation.isPending || !newWorkflow.template_name || newWorkflow.workflow_steps.length === 0}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {createWorkflowMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Create Workflow
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Execute Workflow Dialog */}
      <Dialog open={executeDialogOpen} onOpenChange={setExecuteDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Execute Workflow: {selectedWorkflow?.template_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              This workflow will execute {selectedWorkflow?.workflow_steps?.length} steps on selected agents.
            </p>

            <div className="bg-slate-800 rounded p-3">
              <p className="text-xs text-slate-400 mb-2">Available Agents ({agents.length} online):</p>
              <div className="space-y-1">
                {agents.slice(0, 5).map(agent => (
                  <p key={agent.id} className="text-xs text-white">
                    • {agent.hostname} ({agent.platform})
                  </p>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExecuteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => executeWorkflowMutation.mutate({
                  workflowId: selectedWorkflow?.template_id,
                  targetAgents: agents.map(a => a.agent_id),
                  caseId: null
                })}
                disabled={executeWorkflowMutation.isPending || agents.length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {executeWorkflowMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Execute on All Agents
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
