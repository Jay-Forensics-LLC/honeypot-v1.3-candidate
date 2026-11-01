import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, ShieldAlert, ExternalLink } from 'lucide-react';

export default function DeviceRiskAlertsTab({ deviceId }) {
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['device-risk-alerts', deviceId],
    queryFn: async () => {
      const allAlerts = await base44.entities.ProactiveRiskAlert.filter({
        device_id: deviceId
      });
      return allAlerts.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
    }
  });

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-300';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'OPEN': return 'bg-red-50 text-red-700 border-red-200';
      case 'ACKNOWLEDGED': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'MITIGATED': return 'bg-green-50 text-green-700 border-green-200';
      case 'DISMISSED': return 'bg-gray-50 text-gray-700 border-gray-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading risk alerts...</div>;
  }

  if (alerts.length === 0) {
    return (
      <div className="p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <div className="text-sm font-medium text-gray-700">No Risk Alerts</div>
        <div className="text-xs text-gray-500 mt-1">This device has no active threat intel correlations</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-red-600" />
        <h3 className="text-lg font-semibold">Risk Alerts ({alerts.length})</h3>
      </div>

      {alerts.map((alert) => (
        <Card key={alert.id} className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={getSeverityColor(alert.severity)}>
                      {alert.severity}
                    </Badge>
                    <Badge variant="outline" className={getStatusColor(alert.status)}>
                      {alert.status}
                    </Badge>
                    <span className="text-xs text-gray-500">Score: {alert.risk_score || 0}</span>
                  </div>
                  <h4 className="text-sm font-semibold">{alert.title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{alert.summary}</p>
                </div>
              </div>

              {/* Evidence */}
              {alert.evidence && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-gray-700">Evidence</div>
                  
                  {alert.evidence.observed_exposure?.match_details && (
                    <div className="space-y-1">
                      {alert.evidence.observed_exposure.match_details.map((match, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-medium text-gray-700">{match.type}:</span>{' '}
                          <span className="text-gray-600">
                            Expected "{match.expected}" → Observed "{match.observed}" ({match.source})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {alert.evidence.cve_tags && alert.evidence.cve_tags.length > 0 && (
                    <div className="text-xs">
                      <span className="font-medium text-gray-700">CVEs:</span>{' '}
                      <span className="text-gray-600">{alert.evidence.cve_tags.join(', ')}</span>
                    </div>
                  )}

                  {alert.evidence.ttp_tags && alert.evidence.ttp_tags.length > 0 && (
                    <div className="text-xs">
                      <span className="font-medium text-gray-700">TTPs:</span>{' '}
                      <span className="text-gray-600">{alert.evidence.ttp_tags.join(', ')}</span>
                    </div>
                  )}

                  {alert.evidence.observed_exposure?.policy_gaps && alert.evidence.observed_exposure.policy_gaps.length > 0 && (
                    <div className="text-xs">
                      <span className="font-medium text-red-700">Policy Gaps:</span>{' '}
                      <span className="text-red-600">{alert.evidence.observed_exposure.policy_gaps.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Recommendations */}
              {alert.recommendations && alert.recommendations.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-blue-700">Recommendations</div>
                  {alert.recommendations.map((rec, idx) => (
                    <div key={idx} className="text-xs text-blue-800">
                      <div className="font-medium">{rec.action}</div>
                      <div className="text-blue-600 mt-0.5">{rec.rationale}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Suggested Policy Changes */}
              {alert.suggested_policy_changes && alert.suggested_policy_changes.changes?.length > 0 && (
                <div className="bg-yellow-50 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-yellow-700">Suggested Policy Changes (Read-Only)</div>
                  {alert.suggested_policy_changes.changes.map((change, idx) => (
                    <div key={idx} className="text-xs">
                      <div className="font-medium text-yellow-800">{change.path}</div>
                      <div className="text-yellow-700 flex items-center gap-2 mt-1">
                        <span className="line-through">{JSON.stringify(change.from)}</span>
                        <span>→</span>
                        <span className="font-semibold">{JSON.stringify(change.to)}</span>
                      </div>
                      <div className="text-yellow-600 mt-0.5">{change.rationale}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Source Link */}
              {alert.source_intel_id && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <ExternalLink className="w-3 h-3" />
                  <span>Source Intel ID: {alert.source_intel_id}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}