import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Shield, CheckCircle, Target, Users, Search, TrendingUp } from 'lucide-react';

/**
 * Triage Assessment Display Component
 * Shows AI-generated case triage results
 */
export default function TriageAssessment({ triage, onRetriage }) {
  if (!triage) return null;

  const priorityConfig = {
    high: { color: 'bg-red-500/20 text-red-300 border-red-500/50', icon: AlertTriangle },
    medium: { color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50', icon: Shield },
    low: { color: 'bg-green-500/20 text-green-300 border-green-500/50', icon: CheckCircle }
  };

  const config = priorityConfig[triage.priority] || priorityConfig.medium;
  const Icon = config.icon;

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-400" />
            AI Triage Assessment
          </CardTitle>
          {onRetriage && (
            <Button size="sm" variant="outline" onClick={onRetriage}>
              Re-analyze
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Priority Badge */}
        <div className="flex items-center gap-3">
          <Badge className={`${config.color} px-3 py-1 text-sm font-semibold flex items-center gap-2`}>
            <Icon className="w-4 h-4" />
            {triage.priority.toUpperCase()} PRIORITY
          </Badge>
          {triage.confidence_score && (
            <span className="text-xs text-slate-400">
              Confidence: {Math.round(triage.confidence_score * 100)}%
            </span>
          )}
        </div>

        {/* Priority Justification */}
        {triage.priority_justification && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-sm text-slate-300">{triage.priority_justification}</p>
          </div>
        )}

        {/* Threat Assessment */}
        {triage.threat_assessment && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              Threat Assessment
            </h4>
            <div className="space-y-2 text-sm">
              {triage.threat_assessment.primary_threats?.length > 0 && (
                <div>
                  <span className="text-slate-400">Primary Threats: </span>
                  <span className="text-slate-300">
                    {triage.threat_assessment.primary_threats.join(', ')}
                  </span>
                </div>
              )}
              {triage.threat_assessment.attack_vectors?.length > 0 && (
                <div>
                  <span className="text-slate-400">Attack Vectors: </span>
                  <span className="text-slate-300">
                    {triage.threat_assessment.attack_vectors.join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Investigation Path */}
        {triage.investigation_path && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              Recommended Investigation Path
            </h4>
            {triage.investigation_path.immediate_actions?.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-slate-400">Immediate Actions:</span>
                <ul className="mt-1 space-y-1">
                  {triage.investigation_path.immediate_actions.map((action, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {triage.investigation_path.evidence_to_collect?.length > 0 && (
              <div>
                <span className="text-xs font-medium text-slate-400">Evidence to Collect:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {triage.investigation_path.evidence_to_collect.map((ev, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {ev}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Risk Factors */}
        {triage.risk_factors && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-yellow-400" />
              Risk Factors
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {triage.risk_factors.data_exposure && (
                <div className="bg-slate-800/50 rounded p-2">
                  <span className="text-slate-400">Data Exposure: </span>
                  <span className="text-slate-300">{triage.risk_factors.data_exposure}</span>
                </div>
              )}
              {triage.risk_factors.operational_impact && (
                <div className="bg-slate-800/50 rounded p-2">
                  <span className="text-slate-400">Operational Impact: </span>
                  <span className="text-slate-300">{triage.risk_factors.operational_impact}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Keywords */}
        {triage.keywords?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-purple-400" />
              Keywords
            </h4>
            <div className="flex flex-wrap gap-1">
              {triage.keywords.map((keyword, idx) => (
                <Badge key={idx} className="bg-purple-500/20 text-purple-300 border-purple-500/40">
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Expert */}
        {triage.recommended_investigator_type && (
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400">Recommended Expert:</span>
            <Badge variant="outline">{triage.recommended_investigator_type}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}