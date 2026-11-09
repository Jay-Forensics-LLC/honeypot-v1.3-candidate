import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../components/hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Play, Pause, Edit, Trash2, Activity, AlertTriangle, CheckCircle2, Clock, FileText, TrendingUp, TrendingDown, Calendar, Download, TestTube } from 'lucide-react';
import PlaybookBuilder from '../components/playbooks/PlaybookBuilder';
import PlaybookManagerComponent from '../components/playbooks/PlaybookManager';
import DrillLauncher from '../components/playbooks/DrillLauncher';
import { generatePlaybookReport } from '@/functions/generatePlaybookReport';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

export default function PlaybookManager() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState(null);
  const [deletePlaybook, setDeletePlaybook] = useState(null);
  const [reportPeriod, setReportPeriod] = useState('weekly');

  const { data: playbooks = [], isLoading } = useQuery({
    queryKey: ['playbooks', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.AutomatedPlaybook.filter(
        { organization_id: user.organization_id },
        '-created_date',
        100
      );
    },
    enabled: !!user?.organization_id,
  });

  const { data: executions = [] } = useQuery({
    queryKey: ['playbook-executions', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.PlaybookExecution.filter(
        { organization_id: user.organization_id },
        '-started_at',
        50
      );
    },
    enabled: !!user?.organization_id,
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['playbook-reports', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.PlaybookReport.filter(
        { organization_id: user.organization_id },
        '-created_date',
        50
      );
    },
    enabled: !!user?.organization_id,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }) => {
      return await base44.entities.AutomatedPlaybook.update(id, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['playbooks']);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.AutomatedPlaybook.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['playbooks']);
      setDeletePlaybook(null);
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: async (period) => {
      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case 'daily':
          startDate.setDate(now.getDate() - 1);
          break;
        case 'weekly':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'monthly':
          startDate.setMonth(now.getMonth() - 1);
          break;
      }

      return await generatePlaybookReport({
        report_type: period,
        start_date: startDate.toISOString(),
        end_date: now.toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['playbook-reports']);
    },
  });

  const filteredPlaybooks = playbooks.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTriggerBadge = (trigger) => {
    const labels = {
      alert_created: 'Alert Created',
      alert_severity: 'Alert Severity',
      device_compromised: 'Device Compromised',
      threat_detected: 'Threat Detected',
      manual: 'Manual'
    };
    return labels[trigger?.type] || trigger?.type;
  };

  const getSuccessRate = (playbook) => {
    const total = playbook.execution_count || 0;
    const success = playbook.success_count || 0;
    if (total === 0) return 'N/A';
    return `${Math.round((success / total) * 100)}%`;
  };

  const latestReport = reports[0];

  const formatMTTR = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const getRecommendationColor = (type) => {
    switch (type) {
      case 'action_required': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'warning': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'optimization': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="w-full h-full bg-[#0B0B0C] p-4 md:p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Playbook Management</h1>
            <p className="text-slate-400 mt-1">Automated response workflows, incident drills, and analytics</p>
          </div>
          <Button onClick={() => { setEditingPlaybook(null); setShowBuilder(true); }} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-2" />
            Create Playbook
          </Button>
        </div>

        <Tabs defaultValue="playbooks" className="space-y-6">
          <TabsList className="bg-slate-900/50 border border-slate-800">
            <TabsTrigger value="playbooks" className="data-[state=active]:bg-red-600">
              <Activity className="w-4 h-4 mr-2" />
              Playbooks
            </TabsTrigger>
            <TabsTrigger value="drills" className="data-[state=active]:bg-orange-600">
              <TestTube className="w-4 h-4 mr-2" />
              Incident Drills
            </TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-purple-600">
              <FileText className="w-4 h-4 mr-2" />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="playbooks" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-400">Total Playbooks</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">{playbooks.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-400">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-500">
                {playbooks.filter(p => p.enabled).length}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-400">Total Executions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">
                {playbooks.reduce((sum, p) => sum + (p.execution_count || 0), 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-400">Recent Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">{executions.length}</p>
            </CardContent>
          </Card>
        </div>

        <Input
          placeholder="Search playbooks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-slate-900/50 border-slate-800 text-white"
        />

        {isLoading ? (
          <div className="text-center text-slate-400 py-12">Loading playbooks...</div>
        ) : filteredPlaybooks.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="py-12 text-center">
              <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">No playbooks found. Create your first automated response workflow.</p>
              <Button onClick={() => setShowBuilder(true)} className="bg-red-600 hover:bg-red-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Playbook
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlaybooks.map((playbook) => (
              <Card key={playbook.id} className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 transition-colors">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-white text-lg mb-2">{playbook.name}</CardTitle>
                      <p className="text-sm text-slate-400 line-clamp-2">{playbook.description}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleMutation.mutate({ id: playbook.id, enabled: !playbook.enabled })}
                      className={playbook.enabled ? 'text-green-500' : 'text-slate-500'}
                    >
                      {playbook.enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                      {getTriggerBadge(playbook.trigger)}
                    </Badge>
                    {playbook.trigger?.conditions?.severity && (
                      <Badge className="ml-2 bg-red-500/20 text-red-300 border-red-500/30">
                        {playbook.trigger.conditions.severity.join(', ')}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Activity className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-400">{playbook.actions?.length || 0} actions</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-400">{playbook.execution_count || 0} runs</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <div className="text-sm">
                      <span className="text-slate-500">Success Rate: </span>
                      <span className={`font-medium ${
                        getSuccessRate(playbook) === 'N/A' ? 'text-slate-400' : 
                        parseInt(getSuccessRate(playbook)) >= 80 ? 'text-green-500' : 
                        parseInt(getSuccessRate(playbook)) >= 50 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {getSuccessRate(playbook)}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditingPlaybook(playbook); setShowBuilder(true); }}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletePlaybook(playbook)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showBuilder} onOpenChange={setShowBuilder}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingPlaybook ? 'Edit Playbook' : 'Create New Playbook'}
              </DialogTitle>
            </DialogHeader>
            <PlaybookBuilder
              playbook={editingPlaybook}
              onSave={() => {
                setShowBuilder(false);
                setEditingPlaybook(null);
                queryClient.invalidateQueries(['playbooks']);
              }}
              onCancel={() => {
                setShowBuilder(false);
                setEditingPlaybook(null);
              }}
            />
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deletePlaybook} onOpenChange={() => setDeletePlaybook(null)}>
          <AlertDialogContent className="bg-slate-900 border-slate-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete Playbook</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete "{deletePlaybook?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate(deletePlaybook.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          </TabsContent>

          <TabsContent value="drills" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <PlaybookManagerComponent />
              <DrillLauncher />
            </div>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">Performance Analytics</h2>
              <div className="flex gap-3">
                <Select value={reportPeriod} onValueChange={setReportPeriod}>
                  <SelectTrigger className="w-40 bg-slate-900 border-slate-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="daily" className="text-white">Daily</SelectItem>
                    <SelectItem value="weekly" className="text-white">Weekly</SelectItem>
                    <SelectItem value="monthly" className="text-white">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => generateReportMutation.mutate(reportPeriod)}
                  disabled={generateReportMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {generateReportMutation.isPending ? 'Generating...' : 'Generate Report'}
                </Button>
              </div>
            </div>

            {latestReport ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-400">Total Executions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-white">{latestReport.metrics.total_executions}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {latestReport.metrics.successful_executions} successful
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-400">Success Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <p className={`text-3xl font-bold ${
                          latestReport.metrics.success_rate >= 80 ? 'text-green-500' :
                          latestReport.metrics.success_rate >= 50 ? 'text-yellow-500' :
                          'text-red-500'
                        }`}>
                          {latestReport.metrics.success_rate.toFixed(1)}%
                        </p>
                        {latestReport.metrics.success_rate >= 80 ? (
                          <TrendingUp className="w-5 h-5 text-green-500 mb-1" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-500 mb-1" />
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-400">Avg MTTR</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-white">
                        {formatMTTR(latestReport.metrics.average_mttr_seconds)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Median: {formatMTTR(latestReport.metrics.median_mttr_seconds)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-slate-400">Failed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-red-500">
                        {latestReport.metrics.failed_executions}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {latestReport.metrics.partial_executions} partial
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-white">Top Playbooks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {latestReport.top_playbooks.slice(0, 5).map((pb, idx) => (
                          <div key={pb.playbook_id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-bold">#{idx + 1}</span>
                                <span className="text-white font-medium">{pb.playbook_name}</span>
                              </div>
                              <div className="flex gap-3 mt-1 text-xs text-slate-400">
                                <span>{pb.execution_count} runs</span>
                                <span className={pb.success_rate >= 80 ? 'text-green-500' : 'text-yellow-500'}>
                                  {pb.success_rate.toFixed(1)}% success
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-white">Trigger Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-slate-400 mb-2">Most Common Triggers</h4>
                          <div className="space-y-2">
                            {latestReport.trigger_analysis.most_common_triggers.slice(0, 5).map((trigger) => (
                              <div key={trigger.trigger_type} className="flex items-center justify-between">
                                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                                  {trigger.trigger_type}
                                </Badge>
                                <span className="text-white font-medium">{trigger.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-400 mb-2">Severity Distribution</h4>
                          <div className="space-y-2">
                            {Object.entries(latestReport.trigger_analysis.alert_severity_distribution || {})
                              .sort((a, b) => b[1] - a[1])
                              .map(([severity, count]) => (
                                <div key={severity} className="flex items-center justify-between">
                                  <Badge className={
                                    severity === 'critical' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                    severity === 'high' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                                    severity === 'medium' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                                    'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                  }>
                                    {severity}
                                  </Badge>
                                  <span className="text-white font-medium">{count}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {latestReport.failure_analysis.length > 0 && (
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-white">Failure Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {latestReport.failure_analysis.map((fa) => (
                          <div key={fa.action_type} className="p-4 bg-red-950/20 border border-red-500/30 rounded-lg">
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="text-white font-medium">{fa.action_type}</h4>
                              <Badge className="bg-red-500/20 text-red-300 border-red-500/30">
                                {fa.failure_count} failures
                              </Badge>
                            </div>
                            {fa.common_errors.length > 0 && (
                              <div>
                                <p className="text-xs text-slate-400 mb-1">Common errors:</p>
                                <ul className="text-xs text-slate-300 list-disc list-inside space-y-1">
                                  {fa.common_errors.map((error, idx) => (
                                    <li key={idx}>{error}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {latestReport.recommendations.length > 0 && (
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {latestReport.recommendations.map((rec, idx) => (
                          <div key={idx} className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                            <div className="flex items-start gap-3">
                              {rec.type === 'action_required' && <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />}
                              {rec.type === 'warning' && <Clock className="w-5 h-5 text-yellow-500 mt-0.5" />}
                              {rec.type === 'optimization' && <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5" />}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-white font-medium">{rec.title}</h4>
                                  <Badge className={getRecommendationColor(rec.type)}>
                                    {rec.type.replace('_', ' ')}
                                  </Badge>
                                </div>
                                <p className="text-sm text-slate-400">{rec.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="py-12 text-center">
                  <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-4">No reports generated yet.</p>
                  <Button 
                    onClick={() => generateReportMutation.mutate(reportPeriod)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Generate {reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)} Report
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}