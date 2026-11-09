import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Eye, Code, ArrowLeft, AlertTriangle } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import { useNavigate } from 'react-router-dom';

export default function DeviceEffectivePolicy() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('summary');

  const { data: resolution, isLoading } = useQuery({
    queryKey: ['effective-policy', deviceId],
    queryFn: async () => {
      const response = await base44.functions.invoke('policyResolution', {
        operation: 'resolve',
        device_id: deviceId
      });
      return response.data;
    }
  });

  const { data: relatedAlerts = [] } = useQuery({
    queryKey: ['related-alerts', deviceId],
    queryFn: async () => {
      const alerts = await base44.entities.ProactiveRiskAlert.filter({
        device_id: deviceId,
        status: 'OPEN'
      });
      return alerts.filter(alert => 
        alert.suggested_policy_changes && 
        alert.suggested_policy_changes.changes?.length > 0
      );
    }
  });

  if (isLoading) {
    return <div className="p-6 text-white">Loading effective policy...</div>;
  }

  if (!resolution) {
    return (
      <div className="p-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="text-center py-12">
            <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 mb-4">No effective policy found for this device</p>
            <Button onClick={() => navigate('/Devices')} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Devices
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const domains = resolution.resolved_policy_payload_json || {};
  const metadata = resolution.resolution_metadata || {};

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader
        title="Effective Policy"
        description={`Device: ${deviceId.slice(0, 16)}...`}
        icon={Shield}
        actions={[
          {
            label: 'Back to Devices',
            icon: ArrowLeft,
            variant: 'outline',
            onClick: () => navigate('/Devices')
          }
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <p className="text-slate-400 text-sm mb-1">Total Assignments</p>
            <p className="text-2xl font-bold text-white">{metadata.total_assignments || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <p className="text-slate-400 text-sm mb-1">Direct Assignments</p>
            <p className="text-2xl font-bold text-white">{metadata.direct_assignments || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <p className="text-slate-400 text-sm mb-1">Group Assignments</p>
            <p className="text-2xl font-bold text-white">{metadata.group_assignments || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Related Risk Alerts */}
      {relatedAlerts.length > 0 && (
        <Card className="bg-slate-900/50 border-red-800/50 mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <CardTitle className="text-white">Related Risk Alerts ({relatedAlerts.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {relatedAlerts.map((alert) => (
                <div key={alert.id} className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-red-100 text-red-800 border-red-300">
                        {alert.severity}
                      </Badge>
                      <span className="text-sm font-semibold text-white">{alert.title}</span>
                    </div>
                    <span className="text-xs text-slate-400">Score: {alert.risk_score || 0}</span>
                  </div>
                  
                  <p className="text-xs text-slate-300 mb-3">{alert.summary}</p>
                  
                  {alert.suggested_policy_changes?.changes?.length > 0 && (
                    <div className="bg-yellow-900/20 border border-yellow-500/30 rounded p-3">
                      <div className="text-xs font-semibold text-yellow-300 mb-2">Suggested Policy Changes (Read-Only)</div>
                      <div className="space-y-2">
                        {alert.suggested_policy_changes.changes.map((change, idx) => (
                          <div key={idx} className="text-xs">
                            <div className="font-medium text-yellow-200">{change.path}</div>
                            <div className="text-yellow-100 flex items-center gap-2 mt-1">
                              <span className="line-through">{JSON.stringify(change.from)}</span>
                              <span>→</span>
                              <span className="font-semibold">{JSON.stringify(change.to)}</span>
                            </div>
                            <div className="text-yellow-300/70 mt-0.5">{change.rationale}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-yellow-400 mt-2 italic">
                        Note: Use Policy Editor to create a draft with these changes
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-900/50 border-slate-800 mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Resolution View</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={viewMode === 'summary' ? 'default' : 'outline'}
                onClick={() => setViewMode('summary')}
                className={viewMode === 'summary' ? 'bg-blue-600' : 'border-slate-700'}
              >
                <Eye className="w-4 h-4 mr-2" />
                Summary
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'json' ? 'default' : 'outline'}
                onClick={() => setViewMode('json')}
                className={viewMode === 'json' ? 'bg-blue-600' : 'border-slate-700'}
              >
                <Code className="w-4 h-4 mr-2" />
                Raw JSON
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'json' ? (
            <pre className="bg-slate-800 p-4 rounded text-xs text-slate-300 overflow-auto max-h-96">
              {JSON.stringify(resolution.resolved_policy_payload_json, null, 2)}
            </pre>
          ) : (
            <Tabs defaultValue={Object.keys(domains)[0] || 'none'} className="w-full">
              <TabsList className="bg-slate-800">
                {Object.keys(domains).map(domain => (
                  <TabsTrigger key={domain} value={domain}>
                    {domain.replace(/_/g, ' ').toUpperCase()}
                  </TabsTrigger>
                ))}
              </TabsList>

              {Object.entries(domains).map(([domain, config]) => (
                <TabsContent key={domain} value={domain} className="mt-4">
                  <div className="space-y-4">
                    <div className="bg-slate-800/30 p-4 rounded border border-slate-700">
                      <h4 className="text-white font-semibold mb-2">Configuration</h4>
                      <pre className="text-xs text-slate-300">
                        {JSON.stringify(config, null, 2)}
                      </pre>
                    </div>

                    {metadata.conflict_resolution_log?.filter(log => log.domain === domain).map((log, idx) => (
                      <div key={idx} className="bg-blue-500/10 p-4 rounded border border-blue-500/30">
                        <h4 className="text-blue-400 font-semibold mb-2">Resolution Explanation</h4>
                        <p className="text-sm text-slate-300 mb-2">
                          <strong>Winning Policy:</strong> {log.winning_policy_id}
                        </p>
                        <p className="text-sm text-slate-300">
                          <strong>Reason:</strong> {log.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}