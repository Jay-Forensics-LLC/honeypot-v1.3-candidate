import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, RefreshCw, ShieldAlert, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '@/components/hooks/useUser';

export default function ProactiveRiskAlertsWidget() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [scopeFilter, setScopeFilter] = useState('ALL');

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['proactive-alerts', severityFilter, scopeFilter],
    queryFn: async () => {
      const allAlerts = await base44.entities.ProactiveRiskAlert.list();
      return allAlerts.filter(alert => {
        const severityMatch = severityFilter === 'ALL' || alert.severity === severityFilter;
        const scopeMatch = scopeFilter === 'ALL' || alert.scope === scopeFilter;
        return severityMatch && scopeMatch && alert.status === 'OPEN';
      });
    }
  });

  const correlationMutation = useMutation({
    mutationFn: async () => {
      const dryRun = user?.role !== 'admin';
      const res = await base44.functions.invoke('refreshAndCorrelateThreatIntel', {
        organization_id: user?.organization_id,
        lookback_days: 14,
        dry_run: dryRun,
        scope: 'ALL'
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proactive-alerts'] });
      toast.success(`Correlation complete: ${data.alerts_created} created, ${data.alerts_updated} updated`);
    },
    onError: (error) => {
      toast.error(`Correlation failed: ${error.message}`);
    }
  });

  const severityCounts = {
    CRITICAL: alerts.filter(a => a.severity === 'CRITICAL').length,
    HIGH: alerts.filter(a => a.severity === 'HIGH').length,
    MEDIUM: alerts.filter(a => a.severity === 'MEDIUM').length,
    LOW: alerts.filter(a => a.severity === 'LOW').length
  };

  const topAlerts = alerts
    .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
    .slice(0, 5);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-300';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <Card className="border-red-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <CardTitle className="text-lg">Proactive Risk Alerts</CardTitle>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => correlationMutation.mutate()}
            disabled={correlationMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${correlationMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Severity Counts */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-600">{severityCounts.CRITICAL}</div>
              <div className="text-xs text-red-700">Critical</div>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-orange-600">{severityCounts.HIGH}</div>
              <div className="text-xs text-orange-700">High</div>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-yellow-600">{severityCounts.MEDIUM}</div>
              <div className="text-xs text-yellow-700">Medium</div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">{severityCounts.LOW}</div>
              <div className="text-xs text-blue-700">Low</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Severity</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={scopeFilter} onValueChange={setScopeFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Scopes</SelectItem>
                <SelectItem value="MOBILE_DEVICE">Mobile</SelectItem>
                <SelectItem value="ENDPOINT">Endpoint</SelectItem>
                <SelectItem value="NETWORK">Network</SelectItem>
                <SelectItem value="ORG_WIDE">Org-Wide</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Top Alerts */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Top 5 Open Alerts</div>
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading alerts...</div>
            ) : topAlerts.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center">No open alerts</div>
            ) : (
              topAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 bg-white border rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <AlertCircle className="w-4 h-4 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{alert.title}</div>
                      <div className="text-xs text-gray-500">Score: {alert.risk_score || 0}</div>
                    </div>
                  </div>
                  <Badge className={getSeverityColor(alert.severity)}>
                    {alert.severity}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}