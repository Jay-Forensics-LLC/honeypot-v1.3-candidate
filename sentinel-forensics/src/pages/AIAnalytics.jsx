import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sparkles,
  Network,
  Brain,
  Activity,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  FileText,
  TrendingUp,
  GitBranch,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../components/hooks/useUser';

/**
 * AI ANALYTICS PAGE
 * Run network/memory/behavior analytics with visualizations
 */

export default function AIAnalytics() {
  const { id: caseId } = useParams();
  const queryClient = useQueryClient();
  const { data: user } = useUser();
  
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedRunType, setSelectedRunType] = useState(null);
  const [courtMode, setCourtMode] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);

  // Fetch analytics runs
  const { data: runs = [], isLoading: isLoadingRuns } = useQuery({
    queryKey: ['analytics-runs', caseId],
    queryFn: () => base44.entities.AnalyticsRun.filter({ case_id: caseId }),
    enabled: !!caseId
  });

  // Fetch findings
  const { data: findings = [] } = useQuery({
    queryKey: ['analytics-findings', caseId],
    queryFn: () => base44.entities.AIAnalyticsFinding.filter({ case_id: caseId }),
    enabled: !!caseId
  });

  // Fetch visualizations
  const { data: visualizations = [] } = useQuery({
    queryKey: ['visualizations', caseId],
    queryFn: () => base44.entities.VisualizationArtifact.filter({ case_id: caseId }),
    enabled: !!caseId
  });

  // PHASE 0: Run analytics mutation with immutable artifact creation
  const runAnalyticsMutation = useMutation({
    mutationFn: async ({ runType }) => {
      const response = await base44.functions.invoke('createAnalyticsRun', {
        case_id: caseId,
        run_type: runType,
        court_admissible_mode: courtMode,
        parameters: { timestamp: new Date().toISOString() }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-runs', caseId] });
      queryClient.invalidateQueries({ queryKey: ['analytics-findings', caseId] });
      queryClient.invalidateQueries({ queryKey: ['visualizations', caseId] });
      setRunDialogOpen(false);
      toast.success('Analytics run created (immutable artifact)');
    },
    onError: (error) => {
      toast.error(error.message || 'Analytics failed');
    }
  });

  const runTypes = [
    {
      id: 'network_anomaly',
      icon: Network,
      title: 'Network Anomaly Detection',
      description: 'Detect suspicious network patterns, beaconing, C2 indicators',
      color: 'from-blue-600 to-cyan-600'
    },
    {
      id: 'memory_anomaly',
      icon: Brain,
      title: 'Memory Dump Analysis',
      description: 'Detect RWX regions, injections, suspicious processes',
      color: 'from-purple-600 to-pink-600'
    },
    {
      id: 'behavior_analytics',
      icon: Activity,
      title: 'User Behavior Analytics',
      description: 'Detect anomalous user activity, privilege escalation',
      color: 'from-orange-600 to-red-600'
    },
    {
      id: 'combined',
      icon: Sparkles,
      title: 'Combined Analysis',
      description: 'Cross-correlate network, memory, and behavior signals',
      color: 'from-red-600 to-red-700'
    }
  ];

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500',
      info: 'bg-slate-500/20 text-slate-400 border-slate-500'
    };
    return colors[severity] || colors.info;
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-red-500" />
              AI-Driven Analytics
            </h1>
            <p className="text-slate-400">
              Automated anomaly detection with full traceability and confidence scoring
            </p>
          </div>
          <Button
            onClick={() => setRunDialogOpen(true)}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Run Analytics
          </Button>
        </div>



        {/* Court-Admissible Mode Toggle */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-white font-semibold">Court-Admissible Mode</p>
                  <p className="text-xs text-slate-400">
                    Higher confidence thresholds, conservative findings, explicit sourcing
                  </p>
                </div>
              </div>
              <Switch checked={courtMode} onCheckedChange={setCourtMode} />
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="findings" className="w-full">
          <TabsList className="bg-slate-900 border-slate-800">
            <TabsTrigger value="findings" className="data-[state=active]:bg-red-600">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Findings ({findings.length})
            </TabsTrigger>
            <TabsTrigger value="visualizations" className="data-[state=active]:bg-red-600">
              <TrendingUp className="w-4 h-4 mr-2" />
              Visualizations ({visualizations.length})
            </TabsTrigger>
            <TabsTrigger value="runs" className="data-[state=active]:bg-red-600">
              <Clock className="w-4 h-4 mr-2" />
              Run History ({runs.length})
            </TabsTrigger>
          </TabsList>

          {/* Findings Tab */}
          <TabsContent value="findings" className="space-y-4">
            {findings.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-12 text-center">
                  <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-2">No findings yet</p>
                  <p className="text-sm text-slate-500">Run analytics to generate findings</p>
                </CardContent>
              </Card>
            ) : (
              findings.sort((a, b) => b.confidence - a.confidence).map(finding => (
                <Card key={finding.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">
                            {finding.title}
                          </h3>
                          <Badge className={getSeverityColor(finding.severity)}>
                            {finding.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-slate-400">
                            {finding.confidence}% confidence
                          </Badge>
                        </div>
                        <AISuggestionApproval finding={finding} />
                        <p className="text-sm text-slate-300 mb-3">
                          {finding.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>{finding.finding_type.replace('_', ' ')}</span>
                          <span>•</span>
                          <span>{finding.evidence_refs?.length || 0} evidence references</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setSelectedFinding(finding)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Details
                      </Button>
                    </div>

                    {/* Confidence Explanation */}
                    {finding.confidence_explain && (
                      <div className="bg-slate-800/50 rounded-lg p-3 mb-3">
                        <p className="text-xs text-slate-400 font-semibold mb-1">
                          Confidence Explanation:
                        </p>
                        <p className="text-xs text-slate-300">
                          {finding.confidence_explain}
                        </p>
                      </div>
                    )}

                    {/* Recommended Actions */}
                    {finding.recommended_actions && finding.recommended_actions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-400 font-semibold">
                          Recommended Actions:
                        </p>
                        <ul className="text-xs text-slate-300 space-y-1 ml-4">
                          {finding.recommended_actions.map((action, idx) => (
                            <li key={idx} className="list-disc">{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Visualizations Tab */}
          <TabsContent value="visualizations" className="space-y-4">
            {visualizations.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-12 text-center">
                  <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-2">No visualizations yet</p>
                  <p className="text-sm text-slate-500">
                    Visualizations are auto-generated with analytics runs
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {visualizations.map(viz => (
                  <Card key={viz.id} className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-white text-sm">{viz.viz_type}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-slate-400 text-sm">Visualization data available</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Run History Tab */}
          <TabsContent value="runs" className="space-y-4">
            {runs.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-12 text-center">
                  <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-2">No analytics runs yet</p>
                  <p className="text-sm text-slate-500">Click "Run Analytics" to start</p>
                </CardContent>
              </Card>
            ) : (
              runs.sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).map(run => (
                <Card key={run.id} className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {run.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                        {run.status === 'running' && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
                        {run.status === 'failed' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                        <div>
                          <p className="text-white font-semibold">
                            {run.run_type.replace('_', ' ')}
                          </p>
                          <p className="text-xs text-slate-400">
                            {new Date(run.started_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {run.court_admissible_mode && (
                          <Badge variant="outline" className="text-xs">
                            Court Mode
                          </Badge>
                        )}
                        <Badge className={
                          run.status === 'success' ? 'bg-green-500/20 text-green-400' :
                          run.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-red-500/20 text-red-400'
                        }>
                          {run.status}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Run Analytics Dialog */}
        <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-white">Select Analytics Type</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              {runTypes.map(type => (
                <Card
                  key={type.id}
                  className="bg-slate-800/50 border-slate-700 hover:border-slate-600 cursor-pointer transition-all"
                  onClick={() => runAnalyticsMutation.mutate({ runType: type.id })}
                >
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${type.color} flex items-center justify-center mb-4`}>
                      <type.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-white font-semibold mb-2">{type.title}</h3>
                    <p className="text-sm text-slate-400">{type.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Finding Details Dialog */}
        <Dialog open={!!selectedFinding} onOpenChange={() => setSelectedFinding(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedFinding && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-white flex items-center gap-3">
                    {selectedFinding.title}
                    <Badge className={getSeverityColor(selectedFinding.severity)}>
                      {selectedFinding.severity.toUpperCase()}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label className="text-slate-400">Description</Label>
                    <p className="text-white mt-1">{selectedFinding.description}</p>
                  </div>
                  
                  <div>
                    <Label className="text-slate-400">Confidence Score</Label>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-600 to-red-500"
                          style={{ width: `${selectedFinding.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-white font-semibold">
                        {(selectedFinding.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    {selectedFinding.confidence_explain && (
                      <p className="text-sm text-slate-400 mt-2">
                        {selectedFinding.confidence_explain}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label className="text-slate-400">Rationale</Label>
                    <p className="text-white mt-1">{selectedFinding.rationale}</p>
                  </div>

                  <div>
                    <Label className="text-slate-400">Evidence References</Label>
                    <div className="mt-2 space-y-2">
                      {selectedFinding.evidence_refs?.map((ref, idx) => (
                        <div key={idx} className="bg-slate-800/50 rounded-lg p-3 text-sm">
                          <p className="text-white font-mono mb-1">
                            Artifact: {ref.artifact_id?.slice(0, 8)}...
                          </p>
                          <p className="text-slate-400">
                            Events: {ref.event_ids?.length || 0} | 
                            Fields: {ref.fields_used?.join(', ') || 'N/A'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedFinding.recommended_actions?.length > 0 && (
                    <div>
                      <Label className="text-slate-400">Recommended Actions</Label>
                      <ul className="mt-2 space-y-2">
                        {selectedFinding.recommended_actions.map((action, idx) => (
                          <li key={idx} className="text-white flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}