import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  FileText,
  Scale,
  Award,
  Link as LinkIcon,
  XCircle,
  Loader2
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';

export default function DisclosureReadinessPanel({ caseId }) {
  const queryClient = useQueryClient();

  const { data: assessment, isLoading } = useQuery({
    queryKey: ['disclosure-readiness', caseId],
    queryFn: async () => {
      const assessments = await base44.entities.DisclosureReadiness.filter(
        { case_id: caseId },
        '-assessed_at',
        1
      );
      return assessments[0] || null;
    }
  });

  const assessMutation = useMutation({
    mutationFn: () => base44.functions.invoke('assessDisclosureReadiness', { case_id: caseId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disclosure-readiness', caseId] });
      toast.success('Disclosure readiness assessed');
    },
    onError: () => {
      toast.error('Assessment failed');
    }
  });

  const getLevelConfig = (level) => {
    const configs = {
      not_ready: {
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        icon: XCircle,
        label: 'NOT READY'
      },
      partially_ready: {
        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        icon: AlertTriangle,
        label: 'PARTIALLY READY'
      },
      disclosure_ready: {
        color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        icon: FileText,
        label: 'DISCLOSURE READY'
      },
      court_ready: {
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        icon: CheckCircle,
        label: 'COURT READY'
      }
    };
    return configs[level] || configs.not_ready;
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400',
      high: 'bg-orange-500/20 text-orange-400',
      medium: 'bg-yellow-500/20 text-yellow-400',
      low: 'bg-blue-500/20 text-blue-400'
    };
    return colors[severity] || colors.medium;
  };

  const componentIcons = {
    evidence_integrity: Shield,
    chain_of_custody: LinkIcon,
    expert_qualifications: Award,
    documentation_completeness: FileText,
    privilege_review: Scale,
    exhibit_preparation: CheckCircle
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-400" />
            Defensive Disclosure Readiness
          </CardTitle>
          <Button
            onClick={() => assessMutation.mutate()}
            disabled={assessMutation.isPending}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            {assessMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Run Assessment
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!assessment ? (
          <div className="text-center py-12">
            <Scale className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No readiness assessment yet</p>
            <p className="text-sm text-slate-500 mb-4">
              Evaluate case preparedness for legal disclosure and discovery
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overall Score */}
            <div className="text-center p-6 bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-center gap-4 mb-4">
                {(() => {
                  const config = getLevelConfig(assessment.readiness_level);
                  const Icon = config.icon;
                  return (
                    <>
                      <div className="text-5xl font-bold text-white">
                        {assessment.overall_score}
                      </div>
                      <div className="text-left">
                        <Badge className={config.color}>
                          {config.label}
                        </Badge>
                        <p className="text-xs text-slate-400 mt-1">out of 100</p>
                      </div>
                    </>
                  );
                })()}
              </div>
              <Progress 
                value={assessment.overall_score} 
                className="h-2 mb-2"
              />
              <p className="text-xs text-slate-400">
                Assessed {DateUtils.safeFormatDateTime(assessment.assessed_at)}
              </p>
            </div>

            {/* Component Scores */}
            <div>
              <h3 className="text-white font-semibold mb-3">Component Breakdown</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {Object.entries(assessment.component_scores).map(([key, score]) => {
                  const Icon = componentIcons[key] || Shield;
                  const maxScore = key === 'evidence_integrity' ? 25 :
                                 key === 'chain_of_custody' ? 20 :
                                 key === 'documentation_completeness' ? 20 :
                                 key === 'expert_qualifications' ? 15 :
                                 10;
                  const percentage = (score / maxScore) * 100;
                  
                  return (
                    <div key={key} className="bg-slate-800/30 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-300">
                            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-white">
                          {score}/{maxScore}
                        </span>
                      </div>
                      <Progress value={percentage} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Deficiencies */}
            {assessment.deficiencies?.length > 0 && (
              <div>
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  Critical Deficiencies ({assessment.deficiencies.length})
                </h3>
                <div className="space-y-2">
                  {assessment.deficiencies.map((def, idx) => (
                    <div key={idx} className="bg-slate-800/30 rounded-lg p-3 border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-white">{def.category}</span>
                            <Badge className={getSeverityColor(def.severity)}>
                              {def.severity.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-300">{def.description}</p>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-700">
                        <p className="text-xs text-slate-400">
                          <strong className="text-green-400">Remediation:</strong> {def.remediation}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Factors */}
            {assessment.risk_factors?.length > 0 && (
              <div>
                <h3 className="text-white font-semibold mb-3">Risk Factors</h3>
                <div className="space-y-1">
                  {assessment.risk_factors.map((risk, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                      <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                      {risk}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {assessment.recommendations?.length > 0 && (
              <div>
                <h3 className="text-white font-semibold mb-3">Recommendations</h3>
                <div className="space-y-1">
                  {assessment.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                      <CheckCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      {rec}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}