import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap,
  Play,
  Pause,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings,
  Plus,
  Loader2,
  Activity,
  Edit,
  Trash2,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import { formatRelativeTime } from '../components/utils/formatters';
import PlaybookBuilder from '../components/automation/PlaybookBuilder';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { analyzePlaybookPerformance } from '../functions/analyzePlaybookPerformance';

export default function AutomationDashboard() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState(null);
  const [editingPlaybook, setEditingPlaybook] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [analysisResults, setAnalysisResults] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: automationRules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['automation-rules'],
    queryFn: () => base44.entities.AutomationRule.list('-created_date')
  });

  const { data: playbooks = [], isLoading: playbooksLoading } = useQuery({
    queryKey: ['automation-playbooks'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('AutomationPlaybook', '-created_at', 100, 15000);
      } catch (error) {
        console.warn('Failed to load playbooks:', error);
        return [];
      }
    },
    initialData: [],
    staleTime: 60000
  });

  const { data: scheduledTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['scheduled-tasks'],
    queryFn: () => base44.entities.ScheduledTask.list('-next_run')
  });

  const { data: recentExecutions = [] } = useQuery({
    queryKey: ['workflow-executions'],
    queryFn: () => base44.entities.WorkflowExecution.list('-started_at', 20)
  });

  const createPlaybookMutation = useMutation({
    mutationFn: (playbookData) => base44.entities.AutomationPlaybook.create(playbookData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-playbooks'] });
      setCreateDialogOpen(false);
      toast.success('Playbook created!');
    },
    onError: (error) => {
      toast.error('Failed to create: ' + error.message);
    }
  });

  const updatePlaybookMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AutomationPlaybook.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-playbooks'] });
      setEditingPlaybook(null);
      toast.success('Playbook updated!');
    },
    onError: (error) => {
      toast.error('Update failed: ' + error.message);
    }
  });

  const deletePlaybookMutation = useMutation({
    mutationFn: (id) => base44.entities.AutomationPlaybook.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-playbooks'] });
      setDeleteConfirm(null);
      toast.success('Playbook deleted');
    }
  });

  const executePlaybook = useMutation({
    mutationFn: async (playbookId) => {
      const response = await base44.functions.invoke('executeWorkflow', {
        playbook_id: playbookId,
        manual_execution: true
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-executions'] });
      queryClient.invalidateQueries({ queryKey: ['automation-playbooks'] });
      toast.success('Playbook executed successfully');
    },
    onError: (error) => {
      console.error('Playbook execution error:', error);
      toast.error('Failed to execute playbook');
    }
  });

  const analyzePerformanceMutation = useMutation({
    mutationFn: async (playbookId) => {
      const { data } = await analyzePlaybookPerformance({ playbook_id: playbookId });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-playbooks'] });
      setAnalysisResults(data);
      toast.success('AI analysis completed!', {
        description: `Found ${data.analysis.bottlenecks.length} bottlenecks`
      });
    },
    onError: (error) => {
      toast.error('Analysis failed: ' + error.message);
    }
  });

  const togglePlaybook = useMutation({
    mutationFn: async ({ id, enabled }) => {
      await base44.entities.AutomationPlaybook.update(id, { enabled: !enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-playbooks'] });
      toast.success('Playbook status updated');
    }
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }) => {
      await base44.entities.AutomationRule.update(id, { enabled: !enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success('Rule status updated');
    }
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, enabled }) => {
      await base44.entities.ScheduledTask.update(id, { enabled: !enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] });
      toast.success('Task status updated');
    }
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Zap className="w-8 h-8" />
            Automation & Workflows
          </h1>
          <p className="text-slate-400">Automate security responses and recurring tasks</p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Automation
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Zap className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">{playbooks.length}</p>
                <p className="text-xs text-slate-400">Active Playbooks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Settings className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{automationRules.filter(r => r.enabled).length}</p>
                <p className="text-xs text-slate-400">Active Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Calendar className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">{scheduledTasks.filter(t => t.enabled).length}</p>
                <p className="text-xs text-slate-400">Scheduled Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Activity className="w-10 h-10 text-orange-400" />
              <div>
                <p className="text-3xl font-bold text-white">{recentExecutions.filter(e => e.success).length}</p>
                <p className="text-xs text-slate-400">Successful Executions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="playbooks" className="space-y-6">
        <TabsList className="bg-slate-900">
          <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
          <TabsTrigger value="builder">Playbook Builder</TabsTrigger>
          <TabsTrigger value="rules">Automation Rules</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled Tasks</TabsTrigger>
          <TabsTrigger value="executions">Recent Executions</TabsTrigger>
        </TabsList>

        {/* Playbooks Tab */}
        <TabsContent value="playbooks" className="space-y-4">
          {/* AI Analysis Results */}
          {analysisResults && (
            <Card className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-purple-500/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-purple-400" />
                    AI Performance Analysis
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setAnalysisResults(null)}>
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-white">
                        {analysisResults.analysis.overall_success_rate}%
                      </p>
                      <p className="text-xs text-slate-400">Success Rate</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-white">
                        {(analysisResults.analysis.average_duration_ms / 1000).toFixed(1)}s
                      </p>
                      <p className="text-xs text-slate-400">Avg Duration</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-white">
                        {analysisResults.analysis.bottlenecks.length}
                      </p>
                      <p className="text-xs text-slate-400">Bottlenecks</p>
                    </div>
                  </div>

                  {analysisResults.analysis.bottlenecks.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-purple-300 mb-2">Identified Bottlenecks:</h4>
                      <div className="space-y-2">
                        {analysisResults.analysis.bottlenecks.map((bottleneck, i) => (
                          <div key={i} className="bg-slate-800/50 p-3 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-white">{bottleneck.step_name}</span>
                              <Badge className="bg-red-500/20 text-red-400">
                                {bottleneck.failure_rate}% failure
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-400 mb-1">
                              Avg: {bottleneck.avg_duration_ms}ms
                            </p>
                            <p className="text-xs text-blue-300">
                              💡 {bottleneck.suggested_optimization}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysisResults.analysis.ai_suggestions?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-blue-300 mb-2">AI Optimization Suggestions:</h4>
                      <div className="space-y-2">
                        {analysisResults.analysis.ai_suggestions.map((sugg, i) => (
                          <div key={i} className="bg-slate-800/50 p-3 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <TrendingUp className="w-4 h-4 text-green-400" />
                              <span className="text-sm font-medium text-white">
                                Replace: {sugg.original_action}
                              </span>
                            </div>
                            <p className="text-xs text-green-300 mb-1">
                              → {sugg.suggested_action}
                            </p>
                            <p className="text-xs text-slate-400 mb-1">
                              {sugg.reasoning}
                            </p>
                            <Badge className="bg-blue-500/20 text-blue-400">
                              {(sugg.confidence * 100).toFixed(0)}% confidence
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {playbooks.map((playbook) => (
            <Card key={playbook.id} className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-white">{playbook.playbook_name}</h3>
                      <Badge className={playbook.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                        {playbook.enabled ? 'ACTIVE' : 'DISABLED'}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {playbook.playbook_type?.replace('_', ' ')}
                      </Badge>
                      {playbook.adaptive_config?.auto_adjust_enabled && (
                        <Badge className="bg-green-500/20 text-green-400">
                          <Zap className="w-3 h-3 mr-1" />
                          Adaptive
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mb-4">{playbook.description}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-slate-400">Steps</div>
                        <div className="text-white font-semibold">{playbook.steps?.length || 0}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Executions</div>
                        <div className="text-white font-semibold">{playbook.execution_count || 0}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Success Rate</div>
                        <div className="text-white font-semibold">
                          {playbook.execution_count > 0
                            ? `${((playbook.success_count / playbook.execution_count) * 100).toFixed(0)}%`
                            : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Last Executed</div>
                        <div className="text-white font-semibold">
                          {playbook.last_executed
                            ? formatRelativeTime(playbook.last_executed)
                            : 'Never'}
                        </div>
                      </div>
                    </div>

                    {playbook.ai_optimization?.bottleneck_steps?.length > 0 && (
                      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-2 mt-3">
                        <p className="text-xs text-yellow-300">
                          ⚠️ {playbook.ai_optimization.bottleneck_steps.length} bottleneck(s) detected
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      size="sm"
                      onClick={() => analyzePerformanceMutation.mutate(playbook.id)}
                      disabled={analyzePerformanceMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {analyzePerformanceMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <TrendingUp className="w-4 h-4 mr-2" />
                      )}
                      AI Analyze
                    </Button>
                    <Button
                      onClick={() => executePlaybook.mutate(playbook.id)}
                      disabled={executePlaybook.isPending}
                      className="bg-green-600 hover:bg-green-700"
                      size="sm"
                    >
                      {executePlaybook.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Execute
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => togglePlaybook.mutate({ id: playbook.id, enabled: playbook.enabled })}
                    >
                      {playbook.enabled ? (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Disable
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Enable
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingPlaybook(playbook)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteConfirm(playbook)}
                      className="text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {playbooks.length === 0 && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-12 text-center">
                <Zap className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h3 className="text-xl font-bold text-white mb-2">No Playbooks Yet</h3>
                <p className="text-slate-400 mb-4">Create your first automation playbook to get started</p>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Playbook
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Playbook Builder Tab */}
        <TabsContent value="builder" className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Visual Playbook Builder</CardTitle>
            </CardHeader>
            <CardContent>
              <PlaybookBuilder
                onSave={(data) => createPlaybookMutation.mutate(data)}
                onCancel={() => toast.info('Use tabs above to navigate')}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Automation Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          {automationRules.map((rule) => (
            <Card key={rule.id} className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-white">{rule.rule_name}</h3>
                      <Badge className={rule.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {rule.rule_type?.replace('_', ' ')}
                      </Badge>
                      <Badge className="bg-blue-500/20 text-blue-400">
                        Priority: {rule.priority || 5}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                      <div>
                        <div className="text-slate-400">Trigger Events</div>
                        <div className="text-white font-semibold">
                          {rule.trigger_conditions?.event_type?.length || 0} events
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Actions</div>
                        <div className="text-white font-semibold">{rule.actions?.length || 0}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Executions</div>
                        <div className="text-white font-semibold">{rule.execution_history?.length || 0}</div>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleRule.mutate({ id: rule.id, enabled: rule.enabled })}
                  >
                    {rule.enabled ? (
                      <>
                        <Pause className="w-4 h-4 mr-2" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Enable
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {automationRules.length === 0 && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-12 text-center">
                <Settings className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h3 className="text-xl font-bold text-white mb-2">No Automation Rules</h3>
                <p className="text-slate-400">Create rules to trigger actions automatically based on conditions</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Scheduled Tasks Tab */}
        <TabsContent value="scheduled" className="space-y-4">
          {scheduledTasks.map((task) => (
            <Card key={task.id} className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-white">{task.task_name}</h3>
                      <Badge className={task.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                        {task.enabled ? 'Active' : 'Paused'}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {task.task_type?.replace('_', ' ')}
                      </Badge>
                      <Badge className="bg-blue-500/20 text-blue-400">
                        <Clock className="w-3 h-3 mr-1" />
                        {task.schedule}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                      <div>
                        <div className="text-slate-400">Last Run</div>
                        <div className="text-white font-semibold">
                          {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Next Run</div>
                        <div className="text-white font-semibold">
                          {task.next_run ? new Date(task.next_run).toLocaleString() : 'Not scheduled'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Executions</div>
                        <div className="text-white font-semibold">{task.execution_count || 0}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Success Rate</div>
                        <div className="text-white font-semibold">
                          {task.execution_count > 0
                            ? `${((task.success_count / task.execution_count) * 100).toFixed(0)}%`
                            : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleTask.mutate({ id: task.id, enabled: task.enabled })}
                  >
                    {task.enabled ? (
                      <>
                        <Pause className="w-4 h-4 mr-2" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Resume
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {scheduledTasks.length === 0 && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-12 text-center">
                <Calendar className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h3 className="text-xl font-bold text-white mb-2">No Scheduled Tasks</h3>
                <p className="text-slate-400">Schedule recurring security scans and maintenance tasks</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Recent Executions Tab */}
        <TabsContent value="executions" className="space-y-4">
          {recentExecutions.map((execution) => (
            <Card key={execution.id} className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-white">{execution.workflow_name}</h3>
                      {execution.status === 'completed' && execution.success ? (
                        <Badge className="bg-green-500/20 text-green-400">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Success
                        </Badge>
                      ) : execution.status === 'failed' ? (
                        <Badge className="bg-red-500/20 text-red-400">
                          <XCircle className="w-3 h-3 mr-1" />
                          Failed
                        </Badge>
                      ) : execution.status === 'partial' ? (
                        <Badge className="bg-yellow-500/20 text-yellow-400">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Partial
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-500/20 text-blue-400">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Running
                        </Badge>
                      )}
                      <Badge variant="outline" className="capitalize">
                        {execution.trigger_type?.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                      <div>
                        <div className="text-slate-400">Started</div>
                        <div className="text-white font-semibold">
                          {new Date(execution.started_at).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Duration</div>
                        <div className="text-white font-semibold">
                          {execution.duration_ms ? `${(execution.duration_ms / 1000).toFixed(2)}s` : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Steps Executed</div>
                        <div className="text-white font-semibold">{execution.steps_executed?.length || 0}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Actions Taken</div>
                        <div className="text-white font-semibold">{execution.actions_taken?.length || 0}</div>
                      </div>
                    </div>
                    {execution.actions_taken && execution.actions_taken.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-800">
                        <div className="text-sm text-slate-400 mb-2">Actions:</div>
                        <ul className="list-disc list-inside text-sm text-white space-y-1">
                          {execution.actions_taken.map((action, idx) => (
                            <li key={idx}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {recentExecutions.length === 0 && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-12 text-center">
                <Activity className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h3 className="text-xl font-bold text-white mb-2">No Recent Executions</h3>
                <p className="text-slate-400">Workflow executions will appear here</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Automation Playbook</DialogTitle>
          </DialogHeader>
          <PlaybookBuilder
            onSave={(data) => createPlaybookMutation.mutate(data)}
            onCancel={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPlaybook} onOpenChange={() => setEditingPlaybook(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Playbook</DialogTitle>
          </DialogHeader>
          {editingPlaybook && (
            <PlaybookBuilder
              playbook={editingPlaybook}
              onSave={(data) => updatePlaybookMutation.mutate({ id: editingPlaybook.id, data })}
              onCancel={() => setEditingPlaybook(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playbook?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete "{deleteConfirm?.playbook_name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deletePlaybookMutation.mutate(deleteConfirm.id)}
              className="bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}