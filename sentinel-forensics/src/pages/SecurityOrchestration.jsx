import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../components/hooks/useUser';
import PageHeader from '../components/common/PageHeader';
import { RouteErrorBoundary } from '../components/errors/RouteErrorBoundary';
import LoadingState from '../components/common/LoadingState';
import ErrorState from '../components/common/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, Shield, Zap, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function SecurityOrchestration() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [orchestrationResults, setOrchestrationResults] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useUser();

  const runOrchestration = async () => {
    setIsAnalyzing(true);
    try {
      const response = await base44.functions.invoke('securityOrchestrationEngine');
      setOrchestrationResults(response.data);
      toast.success('Security orchestration complete', {
        description: `Executed ${response.data.actions_executed} actions`
      });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (error) {
      toast.error('Orchestration failed', { description: error.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <RouteErrorBoundary routeName="SecurityOrchestration" errorTitle="Security Orchestration Error">
      <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">AI Security Orchestration</h1>
            <p className="text-slate-400 mt-1">Automated threat response across all devices</p>
          </div>
          <Button
            onClick={runOrchestration}
            disabled={isAnalyzing}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Run Orchestration
              </>
            )}
          </Button>
        </div>

        {orchestrationResults && (
          <>
            {/* Risk Assessment */}
            <Card className="bg-gradient-to-br from-red-950/30 to-orange-950/30 border-red-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300">{orchestrationResults.risk_assessment}</p>
              </CardContent>
            </Card>

            {/* Immediate Actions */}
            <div>
              <h2 className="text-xl font-semibold text-white mb-4">Immediate Actions Taken</h2>
              <div className="space-y-3">
                {orchestrationResults.immediate_actions.map((action, idx) => (
                  <Card key={idx} className="bg-slate-900 border-slate-800">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Zap className="w-5 h-5 text-yellow-400" />
                            <h3 className="text-white font-semibold">{action.action_type}</h3>
                            <Badge className={
                              action.priority >= 8
                                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            }>
                              Priority {action.priority}/10
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-400">{action.reason}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Suggested Rules */}
            <div>
              <h2 className="text-xl font-semibold text-white mb-4">Suggested Orchestration Rules</h2>
              <div className="space-y-3">
                {orchestrationResults.suggested_rules.map((rule, idx) => (
                  <Card key={idx} className="bg-slate-900 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-white text-lg flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-400" />
                        {rule.rule_name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-slate-300">{rule.rationale}</p>
                      <div className="text-xs text-slate-400">
                        <strong>Actions:</strong> {rule.actions.join(', ')}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {orchestrationResults.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-blue-400 mt-1">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
      </div>
    </RouteErrorBoundary>
  );
}