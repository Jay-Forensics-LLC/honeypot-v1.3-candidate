import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, Target, Shield } from 'lucide-react';

export default function FindingDetail({ finding, onClose }) {
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-red-400';
      case 'high': return 'text-orange-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-blue-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {finding.title}
            <Badge className={`${getSeverityColor(finding.severity)} bg-opacity-20`}>
              {finding.severity.toUpperCase()}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-sm text-slate-400">Risk Score</p>
                  <p className={`text-2xl font-bold ${
                    finding.risk_score >= 75 ? 'text-red-400' : 
                    finding.risk_score >= 50 ? 'text-orange-400' : 
                    'text-yellow-400'
                  }`}>
                    {finding.risk_score}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Confidence</p>
                  <p className="text-2xl font-bold text-white">
                    {Math.round(finding.confidence * 100)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Blast Radius</p>
                  <p className="text-2xl font-bold text-white">
                    {finding.blast_radius?.count || 1} entities
                  </p>
                </div>
              </div>
              <p className="text-slate-300">{finding.hypothesis}</p>
            </CardContent>
          </Card>

          {/* Explainability */}
          {finding.explainability && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-400" />
                  Why This Matters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 mb-3">{finding.explainability.rationale}</p>
                {finding.explainability.source_factors && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Detection Sources:</p>
                    <div className="flex flex-wrap gap-2">
                      {finding.explainability.source_factors.map((factor, idx) => (
                        <Badge key={idx} className="bg-blue-500/20 text-blue-400">
                          {factor.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Investigation Playbook */}
          {finding.recommended_next_steps && finding.recommended_next_steps.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  Investigation Playbook
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {finding.recommended_next_steps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-slate-900/50 rounded">
                      <span className="text-blue-400 font-semibold min-w-[24px]">{idx + 1}.</span>
                      <p className="text-sm text-slate-300">{step}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Containment Actions */}
          {finding.suggested_containment_actions && finding.suggested_containment_actions.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-400" />
                  Suggested Containment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {finding.suggested_containment_actions.map((action, idx) => (
                    <div key={idx} className="p-3 bg-red-500/10 rounded border border-red-500/30">
                      <p className="text-sm text-white">{action}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Note: All containment actions require approval before execution
                </p>
              </CardContent>
            </Card>
          )}

          {/* Supporting Signals */}
          {finding.supporting_signals && finding.supporting_signals.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Supporting Evidence</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {finding.supporting_signals.map((signal, idx) => (
                    <div key={idx} className="text-sm text-slate-400">
                      • {signal}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}