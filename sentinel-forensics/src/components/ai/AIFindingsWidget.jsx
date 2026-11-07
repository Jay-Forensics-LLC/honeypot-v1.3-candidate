import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  AlertTriangle,
  Shield,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Eye,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';

export default function AIFindingsWidget({ caseId }) {
  const [expandedFinding, setExpandedFinding] = useState(null);
  const queryClient = useQueryClient();

  const { data: findings = [], isLoading } = useQuery({
    queryKey: ['ai-findings', caseId],
    queryFn: () => base44.entities.AIFinding.filter({ case_id: caseId }, '-detected_at', 20)
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ['ai-recommendations', caseId],
    queryFn: () => base44.entities.AIRecommendation.filter(
      { case_id: caseId, status: 'pending' },
      '-confidence_score',
      10
    )
  });

  const analyzeMutation = useMutation({
    mutationFn: () => base44.functions.invoke('aiCaseAssistant', {
      case_id: caseId,
      mode: 'analyze'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-findings', caseId] });
      queryClient.invalidateQueries({ queryKey: ['ai-recommendations', caseId] });
      toast.success('AI analysis complete');
    },
    onError: () => {
      toast.error('AI analysis failed');
    }
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, feedback, type }) => {
      if (type === 'finding') {
        return base44.entities.AIFinding.update(id, {
          user_feedback: feedback,
          feedback_timestamp: new Date().toISOString()
        });
      } else {
        return base44.entities.AIRecommendation.update(id, {
          user_feedback: feedback,
          status: feedback === 'relevant' ? 'accepted' : 'rejected'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-findings', caseId] });
      queryClient.invalidateQueries({ queryKey: ['ai-recommendations', caseId] });
      toast.success('Feedback recorded');
    }
  });

  const getSeverityConfig = (severity) => {
    const configs = {
      critical: { color: 'bg-red-500/20 text-red-400', icon: AlertTriangle },
      high: { color: 'bg-orange-500/20 text-orange-400', icon: AlertTriangle },
      medium: { color: 'bg-yellow-500/20 text-yellow-400', icon: Shield },
      low: { color: 'bg-blue-500/20 text-blue-400', icon: TrendingUp },
      info: { color: 'bg-slate-500/20 text-slate-400', icon: Sparkles }
    };
    return configs[severity] || configs.info;
  };

  const getPriorityConfig = (priority) => {
    const configs = {
      critical: 'bg-red-500/20 text-red-400',
      high: 'bg-orange-500/20 text-orange-400',
      medium: 'bg-yellow-500/20 text-yellow-400',
      low: 'bg-blue-500/20 text-blue-400'
    };
    return configs[priority] || configs.medium;
  };

  const criticalFindings = findings.filter(f => f.severity === 'critical' || f.severity === 'high');
  const hasNewFindings = findings.some(f => !f.user_feedback);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            AI-Detected Findings
            {hasNewFindings && (
              <Badge className="bg-purple-500/20 text-purple-300 animate-pulse">
                NEW
              </Badge>
            )}
          </CardTitle>
          <Button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Run Analysis
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Critical Findings Alert */}
        {criticalFindings.length > 0 && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-red-300 font-semibold">
                {criticalFindings.length} Critical Finding{criticalFindings.length > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-sm text-red-200">
              Immediate investigation required for high-severity patterns
            </p>
          </div>
        )}

        {/* Findings List */}
        {findings.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No AI findings yet</p>
            <p className="text-sm text-slate-500">
              Run automated analysis to detect patterns and anomalies
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-white font-semibold text-sm">Detected Patterns ({findings.length})</h3>
            {findings.map((finding) => {
              const isExpanded = expandedFinding === finding.id;
              const severityConfig = getSeverityConfig(finding.severity);
              const Icon = severityConfig.icon;

              return (
                <div
                  key={finding.id}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedFinding(isExpanded ? null : finding.id)}
                    className="p-3 cursor-pointer hover:bg-slate-800/70 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Icon className={`w-5 h-5 ${severityConfig.color.split(' ')[1]} mt-0.5 flex-shrink-0`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-white font-medium text-sm">{finding.title}</h4>
                            <Badge className={severityConfig.color}>
                              {finding.severity.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                              {finding.confidence_score}% confidence
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400">
                            {finding.finding_type.replace(/_/g, ' ')} • {DateUtils.safeRelativeTime(finding.detected_at)}
                          </p>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-700 p-4 bg-slate-900/50 space-y-3">
                      <p className="text-sm text-slate-300">{finding.description}</p>

                      {finding.indicators?.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Indicators:</p>
                          <div className="flex flex-wrap gap-1">
                            {finding.indicators.map((ind, i) => (
                              <Badge key={i} variant="outline" className="border-slate-600 text-slate-300 text-xs">
                                {ind}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {finding.mitre_techniques?.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">MITRE ATT&CK:</p>
                          <div className="flex flex-wrap gap-1">
                            {finding.mitre_techniques.map((tech, i) => (
                              <Badge key={i} className="bg-red-500/20 text-red-300 text-xs">
                                {tech}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {finding.suggested_actions?.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Suggested Actions:</p>
                          <ul className="space-y-1">
                            {finding.suggested_actions.map((action, i) => (
                              <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                                <span className="text-purple-400">•</span>
                                {action}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {finding.evidence_ids?.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Related Evidence ({finding.evidence_ids.length}):</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-blue-500/50 text-blue-400 text-xs"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View Evidence
                          </Button>
                        </div>
                      )}

                      <div className="flex gap-2 pt-3 border-t border-slate-700">
                        <Button
                          size="sm"
                          onClick={() => feedbackMutation.mutate({
                            id: finding.id,
                            feedback: 'relevant',
                            type: 'finding'
                          })}
                          disabled={finding.user_feedback === 'relevant'}
                          className="bg-green-600 hover:bg-green-700 text-xs"
                        >
                          <ThumbsUp className="w-3 h-3 mr-1" />
                          Relevant
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => feedbackMutation.mutate({
                            id: finding.id,
                            feedback: 'irrelevant',
                            type: 'finding'
                          })}
                          disabled={finding.user_feedback === 'irrelevant' || finding.user_feedback === 'false_positive'}
                          className="border-slate-600 text-xs"
                        >
                          <ThumbsDown className="w-3 h-3 mr-1" />
                          Not Relevant
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              AI Recommendations ({recommendations.length})
            </h3>
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-3"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white font-medium text-sm">{rec.title}</h4>
                      <Badge className={getPriorityConfig(rec.priority)}>
                        {rec.priority.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{rec.description}</p>
                    {rec.rationale && (
                      <p className="text-xs text-slate-500 italic">{rec.rationale}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-700">
                  <Button
                    size="sm"
                    onClick={() => feedbackMutation.mutate({
                      id: rec.id,
                      feedback: 'relevant',
                      type: 'recommendation'
                    })}
                    disabled={rec.status === 'accepted'}
                    className="bg-green-600 hover:bg-green-700 text-xs"
                  >
                    <ThumbsUp className="w-3 h-3 mr-1" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => feedbackMutation.mutate({
                      id: rec.id,
                      feedback: 'irrelevant',
                      type: 'recommendation'
                    })}
                    disabled={rec.status === 'rejected'}
                    className="border-slate-600 text-xs"
                  >
                    <ThumbsDown className="w-3 h-3 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}