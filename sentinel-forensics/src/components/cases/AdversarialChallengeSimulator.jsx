import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  AlertTriangle,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdversarialChallengeSimulator({ caseId }) {
  const [expandedChallenge, setExpandedChallenge] = useState(null);
  const queryClient = useQueryClient();

  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ['adversarial-challenges', caseId],
    queryFn: () => base44.entities.AdversarialChallenge.filter(
      { case_id: caseId },
      '-vulnerability_score'
    )
  });

  const simulateMutation = useMutation({
    mutationFn: () => base44.functions.invoke('simulateAdversarialChallenges', { case_id: caseId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adversarial-challenges', caseId] });
      toast.success('Adversarial challenges identified');
    },
    onError: () => {
      toast.error('Simulation failed');
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.AdversarialChallenge.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adversarial-challenges', caseId] });
      toast.success('Challenge status updated');
    }
  });

  const getSeverityConfig = (severity) => {
    const configs = {
      critical: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
      high: { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: AlertTriangle },
      medium: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: AlertTriangle },
      low: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: CheckCircle }
    };
    return configs[severity] || configs.medium;
  };

  const getTypeLabel = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const summary = {
    total: challenges.length,
    critical: challenges.filter(c => c.severity === 'critical').length,
    high: challenges.filter(c => c.severity === 'high').length,
    medium: challenges.filter(c => c.severity === 'medium').length,
    low: challenges.filter(c => c.severity === 'low').length,
    avgVulnerability: challenges.length > 0
      ? Math.round(challenges.reduce((sum, c) => sum + c.vulnerability_score, 0) / challenges.length)
      : 0
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-red-400" />
            Adversarial Challenge Simulator
          </CardTitle>
          <Button
            onClick={() => simulateMutation.mutate()}
            disabled={simulateMutation.isPending}
            size="sm"
            className="bg-red-600 hover:bg-red-700"
          >
            {simulateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Run Simulation
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {challenges.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No challenges simulated yet</p>
            <p className="text-sm text-slate-500 mb-4">
              Simulate adversarial challenges to identify legal vulnerabilities in your case
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <Alert className="bg-slate-800/50 border-slate-700">
              <Shield className="h-5 w-5 text-blue-400" />
              <AlertDescription className="text-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <strong>Simulation Results:</strong> {summary.total} potential challenges identified
                    {summary.critical > 0 && (
                      <span className="text-red-400 font-semibold ml-2">
                        ({summary.critical} CRITICAL)
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">{summary.avgVulnerability}%</div>
                    <div className="text-xs text-slate-400">Avg Vulnerability</div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {/* Severity Breakdown */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { level: 'critical', count: summary.critical, color: 'text-red-400' },
                { level: 'high', count: summary.high, color: 'text-orange-400' },
                { level: 'medium', count: summary.medium, color: 'text-yellow-400' },
                { level: 'low', count: summary.low, color: 'text-blue-400' }
              ].map(({ level, count, color }) => (
                <div key={level} className="bg-slate-800/30 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${color}`}>{count}</div>
                  <div className="text-xs text-slate-400 uppercase">{level}</div>
                </div>
              ))}
            </div>

            {/* Challenges List */}
            <div className="space-y-3">
              {challenges.map((challenge) => {
                const isExpanded = expandedChallenge === challenge.id;
                const severityConfig = getSeverityConfig(challenge.severity);
                const Icon = severityConfig.icon;

                return (
                  <div
                    key={challenge.id}
                    className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden"
                  >
                    <div
                      onClick={() => setExpandedChallenge(isExpanded ? null : challenge.id)}
                      className="p-4 cursor-pointer hover:bg-slate-800/70 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <Icon className={`w-5 h-5 ${severityConfig.color.split(' ')[1]} mt-0.5 flex-shrink-0`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-white font-semibold">{challenge.challenge_title}</h3>
                              <Badge className={severityConfig.color}>
                                {challenge.severity.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="border-slate-600 text-slate-400">
                                {getTypeLabel(challenge.challenge_type)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-400">
                              <span>Vulnerability: {challenge.vulnerability_score}%</span>
                              <span>Status: {challenge.status.replace('_', ' ')}</span>
                            </div>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-700 p-4 space-y-4 bg-slate-900/50">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Challenge Details:</p>
                          <p className="text-sm text-slate-300">{challenge.challenge_details}</p>
                        </div>

                        {challenge.legal_basis && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Legal Basis:</p>
                            <p className="text-sm text-blue-300 font-mono">{challenge.legal_basis}</p>
                          </div>
                        )}

                        {challenge.defense_strategy && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Defense Strategy:</p>
                            <p className="text-sm text-green-300">{challenge.defense_strategy}</p>
                          </div>
                        )}

                        {challenge.mitigation_steps?.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 mb-2">Mitigation Steps:</p>
                            <div className="space-y-1">
                              {challenge.mitigation_steps.map((step, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                                  <span className="text-blue-400 flex-shrink-0">{idx + 1}.</span>
                                  {step}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {challenge.affected_evidence_ids?.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Affected Evidence:</p>
                            <p className="text-sm text-slate-400">
                              {challenge.affected_evidence_ids.length} item(s)
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-3 border-t border-slate-700">
                          <Button
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ 
                              id: challenge.id, 
                              status: 'mitigated' 
                            })}
                            disabled={challenge.status === 'mitigated'}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            Mark Mitigated
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ 
                              id: challenge.id, 
                              status: 'accepted_risk' 
                            })}
                            disabled={challenge.status === 'accepted_risk'}
                            className="border-slate-600"
                          >
                            Accept Risk
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ 
                              id: challenge.id, 
                              status: 'dismissed' 
                            })}
                            disabled={challenge.status === 'dismissed'}
                            className="border-slate-600"
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}