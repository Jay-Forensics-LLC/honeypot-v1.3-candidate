import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Target, TrendingUp, Clock, Zap, CheckCircle, 
  AlertTriangle, Loader2, Play, ChevronRight 
} from 'lucide-react';
import { aiThreatTriage } from './AIThreatTriageSystem';
import { toast } from 'sonner';

/**
 * THREAT TRIAGE DASHBOARD
 * AI-powered threat analysis and prioritization UI
 */
export default function ThreatTriageDashboard({ threat, onTriageComplete }) {
  const [triaging, setTriaging] = useState(false);
  const [triageResult, setTriageResult] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const stats = await aiThreatTriage.getTriageStats();
    setStats(stats);
  }

  async function handleTriage() {
    setTriaging(true);
    
    try {
      const result = await aiThreatTriage.triageThreat(threat);
      setTriageResult(result);
      toast.success('Threat triaged successfully');
      
      if (onTriageComplete) {
        onTriageComplete(result);
      }
      
      await loadStats();
    } catch (error) {
      toast.error('Triage failed', { description: error.message });
    } finally {
      setTriaging(false);
    }
  }

  const getPriorityColor = (priority) => {
    const colors = {
      immediate: 'text-red-400 border-red-500/50',
      urgent: 'text-orange-400 border-orange-500/50',
      normal: 'text-yellow-400 border-yellow-500/50',
      low: 'text-blue-400 border-blue-500/50'
    };
    return colors[priority] || colors.normal;
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-300 border-red-500/50',
      high: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
      medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
      low: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
      info: 'bg-green-500/20 text-green-300 border-green-500/50'
    };
    return colors[severity] || colors.medium;
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-800/30 rounded-lg p-3">
            <p className="text-xs text-slate-400">Triaged (24h)</p>
            <p className="text-2xl font-bold text-white">{stats.last24h}</p>
          </div>
          <div className="bg-slate-800/30 rounded-lg p-3">
            <p className="text-xs text-slate-400">Critical</p>
            <p className="text-2xl font-bold text-red-400">{stats.bySeverity?.critical || 0}</p>
          </div>
          <div className="bg-slate-800/30 rounded-lg p-3">
            <p className="text-xs text-slate-400">High</p>
            <p className="text-2xl font-bold text-orange-400">{stats.bySeverity?.high || 0}</p>
          </div>
          <div className="bg-slate-800/30 rounded-lg p-3">
            <p className="text-xs text-slate-400">Avg Score</p>
            <p className="text-2xl font-bold text-white">{Math.round(stats.avgPriorityScore || 0)}</p>
          </div>
        </div>
      )}

      {/* Triage Action */}
      {!triageResult && (
        <Card className="bg-blue-950/20 border-blue-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-blue-400" />
                <div>
                  <p className="font-semibold text-white">AI Threat Triage</p>
                  <p className="text-sm text-blue-200">
                    Automatically analyze and prioritize this threat
                  </p>
                </div>
              </div>
              <Button
                onClick={handleTriage}
                disabled={triaging}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {triaging ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run Triage
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Triage Results */}
      {triageResult && (
        <div className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                Triage Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-slate-800/30 rounded-lg p-4">
                  <p className="text-xs text-slate-400 mb-2">Priority Score</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-bold text-white">{triageResult.priorityScore}</p>
                    <p className="text-lg text-slate-400">/100</p>
                  </div>
                  <Badge variant="outline" className={`mt-2 ${getSeverityColor(triageResult.severity)}`}>
                    {triageResult.severity.toUpperCase()}
                  </Badge>
                </div>

                <div className="bg-slate-800/30 rounded-lg p-4">
                  <p className="text-xs text-slate-400 mb-2">Investigation Priority</p>
                  <Badge variant="outline" className={`text-lg px-3 py-1 ${getPriorityColor(triageResult.investigationPriority)}`}>
                    {triageResult.investigationPriority.toUpperCase()}
                  </Badge>
                </div>

                <div className="bg-slate-800/30 rounded-lg p-4">
                  <p className="text-xs text-slate-400 mb-2">Confidence</p>
                  <Badge className={`
                    ${triageResult.confidence === 'high' ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                      triageResult.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                      'bg-red-500/20 text-red-400 border-red-500/50'}
                  `}>
                    {triageResult.confidence.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* AI Recommendation */}
              <Alert className="bg-purple-950/20 border-purple-500/30">
                <Zap className="h-4 w-4 text-purple-400" />
                <AlertDescription className="text-purple-200">
                  <p className="font-semibold mb-1">AI Recommendation:</p>
                  <p className="text-sm">{triageResult.recommendation}</p>
                </AlertDescription>
              </Alert>

              {/* Immediate Risks */}
              {triageResult.aiAnalysis?.immediate_risks && (
                <div className="bg-red-950/20 border border-red-500/30 rounded-lg p-4">
                  <p className="text-sm font-semibold text-red-300 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Immediate Risks:
                  </p>
                  <ul className="space-y-1 ml-6">
                    {triageResult.aiAnalysis.immediate_risks.map((risk, idx) => (
                      <li key={idx} className="text-sm text-red-200">• {risk}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Containment Actions */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">Suggested Containment Actions:</p>
                {triageResult.containmentActions.map((action, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/30 rounded">
                    <div className="flex items-center gap-2 flex-1">
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-300">{action.action}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        action.priority === 'critical' ? 'text-red-400 border-red-500/30' :
                        action.priority === 'high' ? 'text-orange-400 border-orange-500/30' :
                        'text-yellow-400 border-yellow-500/30'
                      }>
                        {action.priority}
                      </Badge>
                      {action.automated && (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/50 text-xs">
                          Auto
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Auto Actions */}
              {triageResult.autoActions && (
                <div className="bg-green-950/20 border border-green-500/30 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-300 mb-2">Automated Actions Triggered:</p>
                  <div className="flex flex-wrap gap-2">
                    {triageResult.autoActions.map((action, idx) => (
                      <Badge key={idx} className="bg-green-500/20 text-green-400 border-green-500/50">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {action.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis Time */}
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Analysis completed in {triageResult.analysisTime}ms
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}