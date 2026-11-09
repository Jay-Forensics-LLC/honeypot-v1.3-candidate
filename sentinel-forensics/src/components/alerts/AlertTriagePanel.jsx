import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  User, 
  TrendingUp,
  ListChecks,
  Target,
  Zap,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function AlertTriagePanel({ alert, onTriageComplete }) {
  const [triageResult, setTriageResult] = useState(null);
  const queryClient = useQueryClient();

  const triageMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('aiAlertTriage', {
        alert_id: alert.id
      });
      return response.data;
    },
    onSuccess: (data) => {
      setTriageResult(data);
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert triaged successfully');
      if (onTriageComplete) onTriageComplete(data);
    },
    onError: (error) => {
      toast.error(`Triage failed: ${error.message}`);
    }
  });

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500',
      high: 'bg-orange-500',
      medium: 'bg-yellow-500',
      low: 'bg-blue-500'
    };
    return colors[severity] || 'bg-gray-500';
  };

  const getCategoryIcon = (category) => {
    const icons = {
      apt_activity: Target,
      malware: AlertTriangle,
      phishing: AlertTriangle,
      network_anomaly: TrendingUp,
      data_breach: AlertTriangle,
      denial_of_service: Zap
    };
    const IconComponent = icons[category] || AlertTriangle;
    return <IconComponent className="w-4 h-4" />;
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Brain className="w-5 h-5 text-purple-400" />
          AI Alert Triage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!triageResult ? (
          <div className="text-center py-8">
            <Button
              onClick={() => triageMutation.mutate()}
              disabled={triageMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {triageMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Run AI Triage
                </>
              )}
            </Button>
            <p className="text-sm text-gray-400 mt-2">
              AI will analyze severity, suggest steps, and assign automatically
            </p>
          </div>
        ) : (
          <>
            {/* Severity Assessment */}
            <div className="bg-slate-800 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-white">Severity Assessment</h4>
                <Badge className={`${getSeverityColor(triageResult.triage.severity_assessment.level)} text-white`}>
                  {triageResult.triage.severity_assessment.level.toUpperCase()}
                </Badge>
              </div>
              <p className="text-sm text-gray-300">{triageResult.triage.severity_assessment.justification}</p>
            </div>

            {/* Category & Confidence */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  {getCategoryIcon(triageResult.triage.category)}
                  <span className="text-xs text-gray-400">Category</span>
                </div>
                <p className="text-sm text-white font-medium">
                  {triageResult.triage.category.replace(/_/g, ' ').toUpperCase()}
                </p>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs text-gray-400">Confidence</span>
                </div>
                <p className="text-sm text-white font-medium">{triageResult.triage.confidence_score}%</p>
              </div>
            </div>

            {/* Investigation Steps */}
            <div className="bg-slate-800 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <ListChecks className="w-4 h-4 text-blue-400" />
                <h4 className="text-sm font-semibold text-white">Investigation Steps</h4>
              </div>
              <div className="space-y-2">
                {triageResult.triage.investigation_steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-2 bg-slate-900 rounded">
                    <Badge className="bg-blue-600 text-white shrink-0">#{step.priority}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">{step.action}</p>
                      <p className="text-xs text-gray-400 mt-1">{step.rationale}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Assignment */}
            {triageResult.assignment && (
              <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-green-400" />
                  <h4 className="text-sm font-semibold text-green-400">Auto-Assigned</h4>
                </div>
                <p className="text-sm text-gray-300">
                  Alert assigned to: <span className="font-medium text-white">{triageResult.assignment.assigned_to}</span>
                </p>
                {triageResult.assignment.notified && (
                  <p className="text-xs text-green-400 mt-1">✓ Email notification sent</p>
                )}
              </div>
            )}

            {/* Time Estimate */}
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-4 h-4" />
              <span>Estimated investigation time: {triageResult.triage.estimated_time_minutes} minutes</span>
            </div>

            {/* False Positive Indicators */}
            {triageResult.triage.false_positive_indicators?.length > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-500/30 p-3 rounded-lg">
                <h4 className="text-xs font-semibold text-yellow-400 mb-2">⚠️ Potential False Positive Indicators</h4>
                <ul className="text-xs text-gray-300 space-y-1">
                  {triageResult.triage.false_positive_indicators.map((indicator, idx) => (
                    <li key={idx}>• {indicator}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Related IOCs */}
            {triageResult.triage.related_iocs?.length > 0 && (
              <div className="bg-slate-800 p-3 rounded-lg">
                <h4 className="text-xs font-semibold text-gray-400 mb-2">Related IOCs to Check</h4>
                <div className="flex flex-wrap gap-2">
                  {triageResult.triage.related_iocs.map((ioc, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {ioc}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Re-run Button */}
            <Button
              onClick={() => {
                setTriageResult(null);
                triageMutation.mutate();
              }}
              variant="outline"
              className="w-full"
              disabled={triageMutation.isPending}
            >
              <Brain className="w-4 h-4 mr-2" />
              Re-run Analysis
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}