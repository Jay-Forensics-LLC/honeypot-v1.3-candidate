import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Shield, 
  Brain, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Zap,
  TrendingUp,
  Server,
  Network,
  FileWarning,
  Eye,
  Play,
  Pause,
  RefreshCw,
  Loader2
} from "lucide-react";
import { useOrgList } from '../components/hooks/useOrgQuery';
import { DateUtils } from '../components/utils/DateUtils';
import LoadingTimeout from '../components/utils/LoadingTimeout';

export default function APTDefenseCenter() {
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [autoExecuteEnabled, setAutoExecuteEnabled] = useState(false);
  const queryClient = useQueryClient();

  // Fetch latest analysis results
  const { data: analyses = [], isLoading, error, refetch } = useOrgList(
    'APTDefenseAnalysis',
    '-analysis_timestamp',
    10,
    { refetchInterval: 60000 }
  );

  const latestAnalysis = analyses[0];

  // Run new analysis
  const runAnalysisMutation = useMutation({
    mutationFn: async (autoExecute) => {
      const response = await base44.functions.invoke('aptDefenseOrchestrator', {
        auto_execute: autoExecute
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-query', 'APTDefenseAnalysis'] });
      setIsRunningAnalysis(false);
    },
    onError: () => {
      setIsRunningAnalysis(false);
    }
  });

  // Execute a specific recommended action
  const executeActionMutation = useMutation({
    mutationFn: async ({ analysisId, actionIndex }) => {
      // In production, this would call a specific backend function to execute the action
      const response = await base44.functions.invoke('executeAPTDefenseAction', {
        analysis_id: analysisId,
        action_index: actionIndex
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-query', 'APTDefenseAnalysis'] });
    }
  });

  const handleRunAnalysis = () => {
    setIsRunningAnalysis(true);
    runAnalysisMutation.mutate(autoExecuteEnabled);
  };

  const getThreatScoreColor = (score) => {
    if (score >= 86) return 'text-red-500';
    if (score >= 61) return 'text-orange-500';
    if (score >= 31) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getThreatScoreBg = (score) => {
    if (score >= 86) return 'bg-red-500/20 border-red-500';
    if (score >= 61) return 'bg-orange-500/20 border-orange-500';
    if (score >= 31) return 'bg-yellow-500/20 border-yellow-500';
    return 'bg-green-500/20 border-green-500';
  };

  const getActionStatusIcon = (status) => {
    switch (status) {
      case 'executed': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'approved': return <Zap className="w-4 h-4 text-blue-400" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-400" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <LoadingTimeout isLoading={isLoading} error={error} onRetry={refetch}>
      <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Brain className="w-8 h-8 text-purple-400" />
                APT Defense Center
              </h1>
              <p className="text-slate-400 mt-1">
                AI-powered Advanced Persistent Threat detection and automated defense
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setAutoExecuteEnabled(!autoExecuteEnabled)}
                className={`border-slate-700 ${autoExecuteEnabled ? 'bg-blue-600 text-white' : 'text-white'}`}
              >
                {autoExecuteEnabled ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                Auto-Execute: {autoExecuteEnabled ? 'ON' : 'OFF'}
              </Button>
              <Button
                onClick={handleRunAnalysis}
                disabled={isRunningAnalysis || runAnalysisMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isRunningAnalysis || runAnalysisMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Run Analysis
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Latest Analysis Overview */}
          {latestAnalysis && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className={`bg-slate-900/50 border-2 ${getThreatScoreBg(latestAnalysis.threat_score || 0)}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm mb-1">Threat Score</p>
                        <p className={`text-4xl font-bold ${getThreatScoreColor(latestAnalysis.threat_score || 0)}`}>
                          {latestAnalysis.threat_score || 0}
                        </p>
                      </div>
                      <Shield className={`w-12 h-12 ${getThreatScoreColor(latestAnalysis.threat_score || 0)}`} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm mb-1">Critical Alerts</p>
                        <p className="text-4xl font-bold text-red-400">
                          {latestAnalysis.critical_alerts?.length || 0}
                        </p>
                      </div>
                      <AlertTriangle className="w-12 h-12 text-red-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm mb-1">Actions Recommended</p>
                        <p className="text-4xl font-bold text-blue-400">
                          {latestAnalysis.system_actions_recommended?.length || 0}
                        </p>
                      </div>
                      <Zap className="w-12 h-12 text-blue-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm mb-1">Data Sources</p>
                        <p className="text-4xl font-bold text-purple-400">
                          {Object.values(latestAnalysis.data_sources_analyzed || {}).reduce((a, b) => a + b, 0)}
                        </p>
                      </div>
                      <Activity className="w-12 h-12 text-purple-400" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Threat Posture Assessment */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Overall Threat Posture Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-300 leading-relaxed">{latestAnalysis.overall_threat_posture}</p>
                  <div className="flex items-center gap-4 mt-4 text-sm text-slate-400">
                    <span>Analyzed: {DateUtils.safeFormatDateTime(latestAnalysis.analysis_timestamp)}</span>
                    <Badge className={latestAnalysis.automation_status === 'auto_approved' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
                      {latestAnalysis.automation_status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Critical Alerts */}
              {latestAnalysis.critical_alerts && latestAnalysis.critical_alerts.length > 0 && (
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                      Critical Alerts Identified
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {latestAnalysis.critical_alerts.map((alert, idx) => (
                      <Alert key={idx} className="bg-red-500/10 border-red-500/30">
                        <AlertDescription>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className="bg-red-500/20 text-red-400">{alert.severity}</Badge>
                                <Badge variant="outline" className="text-slate-300">{alert.type}</Badge>
                              </div>
                              <p className="text-white font-medium mb-1">{alert.description}</p>
                              <p className="text-sm text-slate-400">
                                <strong>Recommended Action:</strong> {alert.recommended_action}
                              </p>
                            </div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Recommended Actions */}
              {latestAnalysis.system_actions_recommended && latestAnalysis.system_actions_recommended.length > 0 && (
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-blue-400" />
                      Recommended System Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {latestAnalysis.system_actions_recommended.map((action, idx) => (
                      <Card key={idx} className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {getActionStatusIcon(action.status)}
                                <Badge className="bg-blue-500/20 text-blue-400">{action.action_type}</Badge>
                                <Badge variant="outline" className="text-slate-300">{action.status}</Badge>
                              </div>
                              <p className="text-white mb-1">
                                <strong>Target:</strong> {action.target}
                              </p>
                              <p className="text-sm text-slate-400 mb-2">{action.justification}</p>
                              {action.parameters && Object.keys(action.parameters).length > 0 && (
                                <details className="text-xs">
                                  <summary className="cursor-pointer text-slate-500 hover:text-slate-300">
                                    View Parameters
                                  </summary>
                                  <pre className="mt-2 bg-slate-900/50 p-2 rounded text-slate-400 overflow-x-auto">
                                    {JSON.stringify(action.parameters, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                            {action.status === 'pending' && (
                              <Button
                                size="sm"
                                onClick={() => executeActionMutation.mutate({ 
                                  analysisId: latestAnalysis.id, 
                                  actionIndex: idx 
                                })}
                                disabled={executeActionMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <Play className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Configuration Updates */}
              {latestAnalysis.updated_configurations && latestAnalysis.updated_configurations.length > 0 && (
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Server className="w-5 h-5 text-green-400" />
                      Configuration Updates
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {latestAnalysis.updated_configurations.map((config, idx) => (
                      <div key={idx} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-green-500/20 text-green-400">{config.component}</Badge>
                        </div>
                        <p className="text-white mb-2">{config.change_description}</p>
                        {config.new_config && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-slate-500 hover:text-slate-300">
                              View New Configuration
                            </summary>
                            <pre className="mt-2 bg-slate-900/50 p-2 rounded text-slate-400 overflow-x-auto">
                              {JSON.stringify(config.new_config, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Analysis History */}
          {analyses.length > 1 && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Analysis History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analyses.slice(1).map((analysis) => (
                    <div key={analysis.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-center gap-4">
                        <div className={`text-2xl font-bold ${getThreatScoreColor(analysis.threat_score || 0)}`}>
                          {analysis.threat_score || 0}
                        </div>
                        <div>
                          <p className="text-white text-sm">{DateUtils.safeFormatDateTime(analysis.analysis_timestamp)}</p>
                          <p className="text-slate-400 text-xs">
                            {analysis.critical_alerts?.length || 0} alerts, {analysis.system_actions_recommended?.length || 0} actions
                          </p>
                        </div>
                      </div>
                      <Badge className={analysis.automation_status === 'auto_approved' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
                        {analysis.automation_status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!latestAnalysis && !isLoading && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-12 text-center">
                <Eye className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <h3 className="text-xl font-semibold text-white mb-2">No Analysis Results Yet</h3>
                <p className="text-slate-400 mb-6">
                  Run your first AI-powered APT defense analysis to get started.
                </p>
                <Button onClick={handleRunAnalysis} className="bg-purple-600 hover:bg-purple-700">
                  <Brain className="w-4 h-4 mr-2" />
                  Run First Analysis
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </LoadingTimeout>
  );
}