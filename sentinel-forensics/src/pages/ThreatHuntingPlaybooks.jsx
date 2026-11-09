import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Target,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Loader2,
  AlertTriangle,
  Shield,
  TrendingUp,
  Database,
  Search,
  Zap,
  FileText
} from 'lucide-react';
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
import { toast } from 'sonner';
import { executeThreatHuntingPlaybook } from '../functions/executeThreatHuntingPlaybook';
import { DateUtils } from '../components/utils/DateUtils';
import { resilientAPI } from '../components/utils/ResilientAPIClient';

export default function ThreatHuntingPlaybooks() {
  const [selectedPlaybook, setSelectedPlaybook] = useState(null);
  const [selectedCase, setSelectedCase] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionDetails, setExecutionDetails] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: playbooks = [], isLoading: playbooksLoading } = useQuery({
    queryKey: ['threat-hunting-playbooks'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('ThreatHuntingPlaybook', '-created_date', 50, 15000);
      } catch (error) {
        console.warn('Failed to load playbooks:', error);
        return [];
      }
    },
    initialData: []
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases-for-hunting'],
    queryFn: async () => {
      try {
        return await resilientAPI.filterEntity(
          'Case',
          { status: { $in: ['open', 'active', 'under_review'] } },
          '-created_date',
          100,
          0,
          15000
        );
      } catch (error) {
        return [];
      }
    },
    initialData: []
  });

  const { data: executions = [] } = useQuery({
    queryKey: ['playbook-executions'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('PlaybookExecution', '-started_at', 20, 15000);
      } catch (error) {
        return [];
      }
    },
    initialData: []
  });

  const executePlaybookMutation = useMutation({
    mutationFn: async ({ playbookId, caseId }) => {
      setIsExecuting(true);
      
      const { data } = await executeThreatHuntingPlaybook({
        playbook_id: playbookId,
        case_id: caseId,
        trigger_data: {
          trigger_type: 'manual',
          user_email: user?.email,
          severity: 'high'
        }
      });

      return data;
    },
    onSuccess: (data) => {
      setIsExecuting(false);
      setExecutionDetails(data);
      queryClient.invalidateQueries({ queryKey: ['playbook-executions'] });
      queryClient.invalidateQueries({ queryKey: ['threat-hunting-playbooks'] });
      
      if (data.success) {
        toast.success('Threat Hunt Complete!', {
          description: `${data.findings} findings discovered, threat score: ${data.threat_score}/100`,
          duration: 5000
        });
      } else {
        toast.warning('Hunt Completed with Issues', {
          description: data.summary
        });
      }
    },
    onError: (error) => {
      setIsExecuting(false);
      toast.error('Hunt execution failed: ' + error.message);
    }
  });

  const getPlaybookIcon = (type) => {
    const icons = {
      apt_detection: Shield,
      lateral_movement: Target,
      data_exfiltration: Database,
      c2_detection: Search,
      malware_hunt: AlertTriangle,
      custom: FileText
    };
    return icons[type] || Target;
  };

  const getPlaybookColor = (type) => {
    const colors = {
      apt_detection: 'from-red-600 to-orange-600',
      lateral_movement: 'from-purple-600 to-pink-600',
      data_exfiltration: 'from-yellow-600 to-red-600',
      c2_detection: 'from-blue-600 to-cyan-600',
      malware_hunt: 'from-orange-600 to-red-600',
      custom: 'from-gray-600 to-gray-800'
    };
    return colors[type] || colors.custom;
  };

  const enabledPlaybooks = playbooks.filter(p => p.enabled);
  const totalExecutions = executions.length;
  const totalFindings = executions.reduce((sum, e) => sum + (e.findings?.length || 0), 0);
  const avgThreatScore = executions.length > 0
    ? Math.round(executions.reduce((sum, e) => sum + (e.threat_score || 0), 0) / executions.length)
    : 0;

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            🎯 Threat Hunting Playbooks
          </h1>
          <p className="text-slate-400">
            Automated threat detection sequences for APT, malware, and advanced threats
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Target className="w-10 h-10 text-blue-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{enabledPlaybooks.length}</p>
                  <p className="text-xs text-slate-400">Active Playbooks</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Play className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{totalExecutions}</p>
                  <p className="text-xs text-slate-400">Total Hunts</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{totalFindings}</p>
                  <p className="text-xs text-slate-400">Total Findings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-10 h-10 text-purple-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{avgThreatScore}</p>
                  <p className="text-xs text-slate-400">Avg Threat Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Playbook Templates */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Threat Hunting Playbooks</CardTitle>
          </CardHeader>
          <CardContent>
            {playbooksLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
                <p className="text-slate-400">Loading playbooks...</p>
              </div>
            ) : enabledPlaybooks.length === 0 ? (
              <div className="text-center py-12">
                <Target className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400 mb-2">No threat hunting playbooks available</p>
                <p className="text-sm text-slate-500">
                  Playbooks are being configured. Check back soon.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {enabledPlaybooks.map((playbook) => {
                  const Icon = getPlaybookIcon(playbook.playbook_type);
                  
                  return (
                    <Card
                      key={playbook.id}
                      className="bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition-all"
                    >
                      <CardContent className="p-6">
                        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getPlaybookColor(playbook.playbook_type)} flex items-center justify-center mb-4`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>

                        <h3 className="text-lg font-semibold text-white mb-2">
                          {playbook.playbook_name}
                        </h3>
                        
                        <p className="text-sm text-slate-400 mb-4 line-clamp-2">
                          {playbook.description}
                        </p>

                        <div className="space-y-2 text-xs mb-4">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Hunt Steps</span>
                            <Badge className="bg-blue-500/20 text-blue-400">
                              {playbook.hunt_steps?.length || 0}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Executions</span>
                            <span className="text-white">{playbook.execution_count || 0}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Findings</span>
                            <span className="text-orange-400">{playbook.findings_count || 0}</span>
                          </div>
                          {playbook.last_executed && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">Last Run</span>
                              <span className="text-slate-300 text-xs">
                                {DateUtils.safeRelativeTime(playbook.last_executed)}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => setSelectedPlaybook(playbook)}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Execute
                          </Button>
                          <Button
                            onClick={() => setExecutionDetails(playbook)}
                            size="icon"
                            variant="outline"
                            className="border-slate-700 min-h-[44px]"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Executions */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Threat Hunts</CardTitle>
          </CardHeader>
          <CardContent>
            {executions.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Clock className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p>No threat hunts executed yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {executions.slice(0, 10).map((exec) => (
                  <div
                    key={exec.id}
                    className={`p-4 rounded-lg border ${
                      exec.status === 'completed' && exec.findings?.length === 0
                        ? 'bg-green-500/10 border-green-500/30'
                        : exec.status === 'completed' && exec.findings?.length > 0
                        ? 'bg-orange-500/10 border-orange-500/30'
                        : exec.status === 'running'
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        {exec.status === 'completed' ? (
                          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                        ) : exec.status === 'running' ? (
                          <Loader2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5 animate-spin" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <p className="font-semibold text-white text-sm">
                              {exec.playbook_name}
                            </p>
                            {exec.status === 'running' && (
                              <Badge className="bg-blue-500/20 text-blue-400 animate-pulse">
                                RUNNING
                              </Badge>
                            )}
                            {exec.findings?.length > 0 && (
                              <Badge className="bg-orange-500/20 text-orange-400">
                                {exec.findings.length} FINDINGS
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs text-slate-400 mb-2">
                            Started {DateUtils.safeRelativeTime(exec.started_at)}
                            {exec.duration_seconds && ` • Completed in ${Math.round(exec.duration_seconds / 60)} min`}
                          </p>

                          {exec.progress_percentage !== undefined && exec.status === 'running' && (
                            <div className="mb-2">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-slate-400">Progress</span>
                                <span className="text-blue-400 font-semibold">
                                  {exec.progress_percentage}%
                                </span>
                              </div>
                              <Progress value={exec.progress_percentage} className="h-2" />
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <p className="text-slate-500">Steps</p>
                              <p className="text-white">{exec.steps_executed?.length || 0}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Findings</p>
                              <p className="text-orange-400">{exec.findings?.length || 0}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Threat Score</p>
                              <p className={`font-bold ${
                                (exec.threat_score || 0) >= 80 ? 'text-red-400' :
                                (exec.threat_score || 0) >= 60 ? 'text-orange-400' :
                                (exec.threat_score || 0) >= 40 ? 'text-yellow-400' :
                                'text-green-400'
                              }`}>
                                {exec.threat_score || 0}/100
                              </p>
                            </div>
                          </div>

                          {exec.summary && (
                            <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                              {exec.summary}
                            </p>
                          )}
                        </div>
                      </div>

                      <Button
                        onClick={() => setExecutionDetails(exec)}
                        size="sm"
                        variant="outline"
                        className="border-slate-700 min-h-[44px]"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Execute Playbook Dialog */}
        <Dialog 
          open={selectedPlaybook !== null} 
          onOpenChange={(open) => !open && setSelectedPlaybook(null)}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-400" />
                Execute Threat Hunt
              </DialogTitle>
            </DialogHeader>

            {selectedPlaybook && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-400 mb-2">Playbook</p>
                  <p className="font-semibold text-white text-lg">{selectedPlaybook.playbook_name}</p>
                  <p className="text-xs text-slate-400 mt-1">{selectedPlaybook.description}</p>
                </div>

                <div>
                  <p className="text-sm text-slate-400 mb-2">Hunt Steps ({selectedPlaybook.hunt_steps?.length || 0})</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {(selectedPlaybook.hunt_steps || [])
                      .sort((a, b) => a.step_order - b.step_order)
                      .map((step, idx) => (
                        <div key={idx} className="flex items-start gap-3 bg-slate-800/50 p-3 rounded-lg">
                          <Badge className="bg-blue-500/20 text-blue-400 flex-shrink-0">
                            {step.step_order}
                          </Badge>
                          <div className="flex-1">
                            <p className="text-sm text-white font-medium">{step.step_name}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              Action: {step.action_type.replace(/_/g, ' ')}
                            </p>
                            {step.parameters && Object.keys(step.parameters).length > 0 && (
                              <p className="text-xs text-slate-500 mt-1">
                                Params: {Object.keys(step.parameters).join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-slate-400 mb-2">Link to Case (Optional)</p>
                  <Select value={selectedCase} onValueChange={setSelectedCase}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white min-h-[44px]">
                      <SelectValue placeholder="Choose a case or create new..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white max-h-[300px] overflow-y-auto">
                      <SelectItem value={null}>New Case (Auto-create)</SelectItem>
                      {cases.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.case_number} - {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Alert className="bg-blue-500/10 border-blue-500/30">
                  <Shield className="h-4 w-4 text-blue-400" />
                  <AlertDescription className="text-blue-300 text-sm">
                    <strong>This playbook will:</strong>
                    <ul className="list-disc ml-5 mt-2 space-y-1 text-xs">
                      <li>Execute {selectedPlaybook.hunt_steps?.length} automated hunting steps</li>
                      <li>Gather endpoint data and network logs</li>
                      <li>Extract and enrich IOCs with threat intelligence</li>
                      <li>Create alerts for high-severity findings</li>
                      <li>Log all actions in audit trail</li>
                      <li>Estimated duration: {Math.round((selectedPlaybook.hunt_steps?.length || 0) * 2)} minutes</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3 pt-4 border-t border-slate-700">
                  <Button
                    onClick={() => setSelectedPlaybook(null)}
                    variant="outline"
                    className="flex-1 border-slate-700 min-h-[44px]"
                    disabled={isExecuting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      executePlaybookMutation.mutate({
                        playbookId: selectedPlaybook.playbook_id,
                        caseId: selectedCase || undefined
                      });
                      setSelectedPlaybook(null);
                    }}
                    disabled={isExecuting}
                    className="flex-1 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 min-h-[44px]"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Start Hunt
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Execution Details Dialog */}
        <Dialog 
          open={executionDetails !== null && executionDetails.execution_id !== undefined} 
          onOpenChange={(open) => !open && setExecutionDetails(null)}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Threat Hunt Results
              </DialogTitle>
            </DialogHeader>

            {executionDetails && executionDetails.execution_id && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Playbook</p>
                    <p className="font-semibold text-white">{executionDetails.playbook_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Status</p>
                    {executionDetails.success || executionDetails.status === 'completed' ? (
                      <Badge className="bg-green-500/20 text-green-400">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Completed
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-400">
                        <XCircle className="w-3 h-3 mr-1" />
                        Failed
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Duration</p>
                    <p className="text-white">
                      {Math.round((executionDetails.duration_seconds || 0) / 60)} minutes
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Threat Score</p>
                    <p className={`text-lg font-bold ${
                      (executionDetails.threat_score || 0) >= 80 ? 'text-red-400' :
                      (executionDetails.threat_score || 0) >= 60 ? 'text-orange-400' :
                      (executionDetails.threat_score || 0) >= 40 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {executionDetails.threat_score || 0}/100
                    </p>
                  </div>
                </div>

                {/* Findings */}
                {executionDetails.findings && executionDetails.findings.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-400 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-400" />
                      Threat Hunting Findings ({executionDetails.findings.length})
                    </p>
                    <div className="space-y-3">
                      {executionDetails.findings.map((finding, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-lg border ${
                            finding.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                            finding.severity === 'high' ? 'bg-orange-500/10 border-orange-500/30' :
                            finding.severity === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30' :
                            'bg-blue-500/10 border-blue-500/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className={
                                  finding.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                                  finding.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                  finding.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-blue-500/20 text-blue-400'
                                }>
                                  {finding.severity.toUpperCase()}
                                </Badge>
                                <p className="font-semibold text-white text-sm">{finding.title}</p>
                              </div>
                              
                              <p className="text-xs text-slate-300 mb-2">{finding.description}</p>
                              
                              <p className="text-xs text-slate-500">
                                Source: {finding.step_source} • Confidence: {finding.confidence_score}%
                              </p>

                              {finding.recommended_actions && finding.recommended_actions.length > 0 && (
                                <details className="mt-2">
                                  <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                                    Recommended Actions ({finding.recommended_actions.length})
                                  </summary>
                                  <ul className="list-disc ml-5 mt-2 space-y-1 text-xs text-slate-400">
                                    {finding.recommended_actions.map((action, i) => (
                                      <li key={i}>{action}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step Execution Log */}
                {executionDetails.steps && executionDetails.steps.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-400 mb-3">Step Execution Log</p>
                    <div className="space-y-2">
                      {executionDetails.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border ${
                            step.status === 'completed' ? 'bg-green-500/10 border-green-500/30' :
                            step.status === 'failed' ? 'bg-red-500/10 border-red-500/30' :
                            step.status === 'running' ? 'bg-blue-500/10 border-blue-500/30' :
                            'bg-gray-500/10 border-gray-500/30'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <Badge className="bg-slate-700 text-slate-300 flex-shrink-0">
                                {step.step_order}
                              </Badge>
                              <div className="flex-1">
                                <p className="font-semibold text-white text-sm">{step.step_name}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                  {step.action_type?.replace(/_/g, ' ')}
                                </p>
                                {step.error_message && (
                                  <p className="text-xs text-red-400 mt-1">
                                    Error: {step.error_message}
                                  </p>
                                )}
                                {step.output && Object.keys(step.output).length > 0 && (
                                  <details className="mt-2">
                                    <summary className="text-xs text-blue-400 cursor-pointer">
                                      View Output
                                    </summary>
                                    <pre className="text-xs text-slate-300 mt-2 bg-slate-900 p-2 rounded overflow-x-auto">
                                      {JSON.stringify(step.output, null, 2)}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            </div>
                            {step.status === 'completed' ? (
                              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                            ) : step.status === 'failed' ? (
                              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                            ) : step.status === 'running' ? (
                              <Loader2 className="w-4 h-4 text-blue-400 flex-shrink-0 animate-spin" />
                            ) : (
                              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => setExecutionDetails(null)}
                  className="w-full bg-slate-700 hover:bg-slate-600 min-h-[44px]"
                >
                  Close
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* How It Works */}
        <Card className="bg-blue-900/20 border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              Automated Threat Hunting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-blue-200">
            <p><strong>Threat hunting playbooks automate detection of advanced threats:</strong></p>
            <ol className="list-decimal ml-5 space-y-2">
              <li><strong>Gather Endpoint Data:</strong> Collect data from enrolled devices and agents</li>
              <li><strong>Query Network Logs:</strong> Search for suspicious connections and traffic patterns</li>
              <li><strong>Analyze Memory Dumps:</strong> Inspect running processes for hidden malware</li>
              <li><strong>Extract IOCs:</strong> Parse evidence for indicators of compromise</li>
              <li><strong>Enrich Threat Intel:</strong> Cross-reference with VirusTotal, AbuseIPDB, URLScan</li>
              <li><strong>Correlate Indicators:</strong> Build attack graphs showing relationships</li>
              <li><strong>File Scanning:</strong> YARA rules + hash checks for malware</li>
              <li><strong>Persistence Checks:</strong> Detect unauthorized system modifications</li>
            </ol>

            <Alert className="bg-yellow-500/10 border-yellow-500/30 mt-4">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-300 text-xs">
                <strong>Auto-Trigger:</strong> Playbooks can automatically execute when critical alerts are detected.
                High-severity findings trigger alerts and create case evidence automatically.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}