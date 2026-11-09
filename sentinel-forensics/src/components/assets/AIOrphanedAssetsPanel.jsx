import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Ghost, Loader2, AlertTriangle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function AIOrphanedAssetsPanel() {
  const [detection, setDetection] = useState(null);
  const queryClient = useQueryClient();

  const detectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('aiOrphanedAssetDetection', {});
      return data;
    },
    onSuccess: (data) => {
      setDetection(data);
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      const total = (data.detection?.summary?.total_orphaned || 0) + 
                    (data.detection?.summary?.total_unmanaged || 0);
      toast.success(`Found ${total} orphaned/unmanaged assets`);
    },
    onError: (error) => {
      toast.error('Detection failed', { description: error.message });
    }
  });

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-orange-400" />
            AI Orphaned Asset Detection
          </CardTitle>
          <Button
            size="sm"
            onClick={() => detectMutation.mutate()}
            disabled={detectMutation.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {detectMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Scanning...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-1" />
                Scan All
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!detection ? (
          <Alert className="bg-orange-500/10 border-orange-500/30">
            <Sparkles className="h-5 w-5 text-orange-400" />
            <AlertDescription className="text-orange-300">
              Scan for orphaned, unmanaged, ghost, and shadow assets across your infrastructure.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {detection.detection?.summary && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Orphaned</p>
                  <p className="text-2xl font-bold text-red-400">
                    {detection.detection.summary.total_orphaned || 0}
                  </p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Unmanaged</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {detection.detection.summary.total_unmanaged || 0}
                  </p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Ghost Assets</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {detection.detection.summary.total_ghost || 0}
                  </p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Shadow Assets</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {detection.detection.summary.total_shadow || 0}
                  </p>
                </div>
              </div>
            )}

            {detection.detection?.orphaned_assets && detection.detection.orphaned_assets.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Ghost className="w-4 h-4 text-red-400" />
                  Orphaned Assets ({detection.detection.orphaned_assets.length})
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {detection.detection.orphaned_assets.map((asset, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-red-500/30">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-semibold text-white">{asset.asset_name}</span>
                        <Badge className={getRiskColor(asset.risk_level)}>
                          {asset.risk_level}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-300 mb-2">{asset.orphan_reason}</p>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Inactive: {asset.days_inactive}d</span>
                        <Badge variant="outline" className="text-[10px]">
                          {asset.recommended_action}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detection.detection?.unmanaged_assets && detection.detection.unmanaged_assets.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  Unmanaged Assets ({detection.detection.unmanaged_assets.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {detection.detection.unmanaged_assets.slice(0, 10).map((asset, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-yellow-500/30">
                      <p className="text-sm font-semibold text-white mb-1">{asset.asset_name}</p>
                      <div className="text-xs text-slate-400 space-y-1">
                        {asset.management_gaps?.length > 0 && (
                          <p><strong>Gaps:</strong> {asset.management_gaps.join(', ')}</p>
                        )}
                        {asset.compliance_issues?.length > 0 && (
                          <p className="text-orange-400">
                            <strong>Compliance:</strong> {asset.compliance_issues.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detection.detection?.recommended_actions && detection.detection.recommended_actions.length > 0 && (
              <Alert className="bg-blue-500/10 border-blue-500/30">
                <AlertDescription>
                  <p className="text-blue-400 font-semibold text-xs mb-2">Recommended Actions:</p>
                  <ul className="space-y-1 text-xs text-blue-300">
                    {detection.detection.recommended_actions.map((action, idx) => (
                      <li key={idx}>
                        <strong>{action.action}</strong> ({action.target_count} assets) - {action.priority} priority
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}