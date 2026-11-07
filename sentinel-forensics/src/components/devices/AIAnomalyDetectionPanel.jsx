import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  AlertTriangle,
  Bug,
  Loader2,
  Sparkles,
  ShieldAlert,
  Target
} from 'lucide-react';
import { toast } from 'sonner';
import { aiDeviceAnomalyDetector } from '../../functions/aiDeviceAnomalyDetector';

/**
 * AI-POWERED ANOMALY DETECTION PANEL
 * Displays automated detection of device anomalies and security misconfigurations
 */
export default function AIAnomalyDetectionPanel({ device }) {
  const [detection, setDetection] = useState(device.anomaly_detection_data || null);

  const detectMutation = useMutation({
    mutationFn: async () => {
      const response = await aiDeviceAnomalyDetector({ device_id: device.device_id });
      return response.data;
    },
    onSuccess: (data) => {
      setDetection(data.detection);
      toast.success('Anomaly detection completed');
    },
    onError: (error) => {
      toast.error('Detection failed', { description: error.message });
    }
  });

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const totalIssues = detection ? 
    (detection.security_misconfigurations?.length || 0) + 
    (detection.behavioral_anomalies?.length || 0) + 
    (detection.configuration_risks?.length || 0) +
    (detection.compliance_violations?.length || 0) : 0;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            AI Anomaly Detection
          </CardTitle>
          <Button
            size="sm"
            onClick={() => detectMutation.mutate()}
            disabled={detectMutation.isPending}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {detectMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Scanning...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-1" />
                Scan Now
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!detection ? (
          <Alert className="bg-cyan-500/10 border-cyan-500/30">
            <Sparkles className="h-5 w-5 text-cyan-400" />
            <AlertDescription className="text-cyan-300">
              Use AI to automatically detect security misconfigurations and behavioral anomalies.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Summary */}
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Overall Severity</span>
                <Badge className={getSeverityColor(detection.severity)}>
                  {detection.severity}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <ShieldAlert className={`w-8 h-8 ${detection.severity === 'critical' || detection.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}`} />
                <div>
                  <span className="text-3xl font-bold text-white">{totalIssues}</span>
                  <p className="text-xs text-slate-400">Issues detected</p>
                </div>
              </div>
              {detection.summary && (
                <p className="text-xs text-slate-400">{detection.summary}</p>
              )}
            </div>

            {/* Security Misconfigurations */}
            {detection.security_misconfigurations && detection.security_misconfigurations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Security Misconfigurations ({detection.security_misconfigurations.length})
                </h4>
                <div className="space-y-2">
                  {detection.security_misconfigurations.map((issue, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-red-500/30">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-semibold text-white">{issue.issue}</span>
                        <Badge className={getSeverityColor(issue.severity)}>
                          {issue.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-300 mb-2">{issue.description}</p>
                      <div className="space-y-1 text-xs">
                        <p className="text-orange-400"><strong>Impact:</strong> {issue.impact}</p>
                        <p className="text-blue-400"><strong>Fix:</strong> {issue.remediation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Behavioral Anomalies */}
            {detection.behavioral_anomalies && detection.behavioral_anomalies.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Bug className="w-4 h-4 text-yellow-400" />
                  Behavioral Anomalies ({detection.behavioral_anomalies.length})
                </h4>
                <div className="space-y-2">
                  {detection.behavioral_anomalies.map((anomaly, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-yellow-500/30">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-semibold text-white">{anomaly.anomaly_type}</span>
                        <Badge className={getSeverityColor(anomaly.severity)}>
                          {anomaly.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-300 mb-2">{anomaly.description}</p>
                      {anomaly.indicators && anomaly.indicators.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs text-slate-400 font-semibold mb-1">Indicators:</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            {anomaly.indicators.map((indicator, i) => (
                              <li key={i} className="text-xs text-slate-400">{indicator}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {anomaly.potential_cause && (
                        <p className="text-xs text-purple-400"><strong>Likely Cause:</strong> {anomaly.potential_cause}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Configuration Risks */}
            {detection.configuration_risks && detection.configuration_risks.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-orange-400" />
                  Configuration Risks ({detection.configuration_risks.length})
                </h4>
                <div className="space-y-2">
                  {detection.configuration_risks.map((risk, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-orange-500/30">
                      <p className="text-sm font-semibold text-white mb-1">{risk.risk}</p>
                      <p className="text-xs text-slate-300 mb-1">{risk.description}</p>
                      <p className="text-xs text-blue-400"><strong>Mitigation:</strong> {risk.mitigation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compliance Violations */}
            {detection.compliance_violations && detection.compliance_violations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  Compliance Violations ({detection.compliance_violations.length})
                </h4>
                <div className="space-y-2">
                  {detection.compliance_violations.map((violation, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-purple-500/30">
                      <Badge variant="outline" className="mb-2">{violation.standard}</Badge>
                      <p className="text-sm font-semibold text-white mb-1">{violation.violation}</p>
                      <p className="text-xs text-slate-400">{violation.requirement}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attack Vectors */}
            {detection.attack_vectors && detection.attack_vectors.length > 0 && (
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <AlertDescription>
                  <p className="text-red-400 font-semibold text-xs mb-1">Potential Attack Vectors:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs text-red-300">
                    {detection.attack_vectors.map((vector, idx) => (
                      <li key={idx}>{vector}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {device.last_anomaly_scan && (
              <p className="text-xs text-slate-500 text-right">
                Last scanned: {new Date(device.last_anomaly_scan).toLocaleString()}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}