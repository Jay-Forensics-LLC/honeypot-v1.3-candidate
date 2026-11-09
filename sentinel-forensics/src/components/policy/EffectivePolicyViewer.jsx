import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Shield, Info, Loader2 } from 'lucide-react';

export default function EffectivePolicyViewer({ deviceId }) {
  const { data: resolution, isLoading } = useQuery({
    queryKey: ['effective-policy', deviceId],
    queryFn: async () => {
      const response = await base44.functions.invoke('policyResolution', { device_id: deviceId });
      return response.data;
    },
    enabled: !!deviceId
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-4 text-slate-400 animate-spin" />
          <p className="text-slate-400">Computing effective policy...</p>
        </CardContent>
      </Card>
    );
  }

  if (!resolution || resolution.resolved_policy_ids?.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Effective Policy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Info className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No policies assigned to this device</p>
            <p className="text-sm text-slate-500 mt-2">
              Using default safe configuration
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const payload = resolution.resolved_policy_payload_json || {};
  const metadata = resolution.resolution_metadata || {};

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Effective Policy Resolution
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resolution Metadata */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-slate-800/50 rounded">
            <Label className="text-slate-400 text-xs">Total Assignments</Label>
            <p className="text-white font-semibold">{metadata.total_assignments || 0}</p>
          </div>
          <div className="p-3 bg-slate-800/50 rounded">
            <Label className="text-slate-400 text-xs">Direct</Label>
            <p className="text-white font-semibold">{metadata.direct_assignments || 0}</p>
          </div>
          <div className="p-3 bg-slate-800/50 rounded">
            <Label className="text-slate-400 text-xs">From Groups</Label>
            <p className="text-white font-semibold">{metadata.group_assignments || 0}</p>
          </div>
        </div>

        {/* Conflict Resolution Log */}
        {metadata.conflict_resolution_log?.length > 0 && (
          <div>
            <Label className="text-slate-400 mb-2 block">Conflict Resolution</Label>
            <div className="space-y-2">
              {metadata.conflict_resolution_log.map((log, idx) => (
                <div key={idx} className="p-2 bg-slate-800/50 rounded text-xs">
                  <Badge className="bg-blue-500/20 text-blue-400 mb-1">
                    {log.domain}
                  </Badge>
                  <p className="text-slate-300">{log.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Policy Domains Summary */}
        <div className="space-y-3 pt-4 border-t border-slate-700">
          <div>
            <Label className="text-slate-400">Auto-Response Rules</Label>
            <p className="text-white text-sm mt-1">
              {payload.auto_response_rules?.length || 0} active rules
            </p>
          </div>

          <div>
            <Label className="text-slate-400">Firewall Profile</Label>
            <Badge className="mt-1">
              {payload.firewall_config?.profile || 'BALANCED'}
            </Badge>
          </div>

          <div>
            <Label className="text-slate-400">USB Restrictions</Label>
            <Badge className="mt-1">
              {payload.usb_restrictions?.mode || 'ALLOW_ALL'}
            </Badge>
          </div>

          <div>
            <Label className="text-slate-400">Hardening Controls</Label>
            <p className="text-white text-sm mt-1">
              {payload.hardening_checklist?.items?.length || 0} required controls
            </p>
          </div>
        </div>

        {/* Full Payload (Collapsible) */}
        <details className="pt-4 border-t border-slate-700">
          <summary className="text-slate-400 cursor-pointer hover:text-white">
            View Full Merged Policy (JSON)
          </summary>
          <pre className="bg-slate-800/50 rounded p-3 text-xs text-slate-300 mt-2 max-h-96 overflow-auto">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}