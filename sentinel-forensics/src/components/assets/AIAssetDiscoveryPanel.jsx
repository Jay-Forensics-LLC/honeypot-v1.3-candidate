import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Radar, Loader2, CheckCircle, Server, Smartphone, HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function AIAssetDiscoveryPanel() {
  const [discovery, setDiscovery] = useState(null);
  const queryClient = useQueryClient();

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('aiAssetDiscovery', {});
      return data;
    },
    onSuccess: (data) => {
      setDiscovery(data);
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`Discovered ${data.discovery?.discovered_assets?.length || 0} assets`);
    },
    onError: (error) => {
      toast.error('Discovery failed', { description: error.message });
    }
  });

  const getTypeIcon = (type) => {
    if (type?.includes('server')) return Server;
    if (type?.includes('mobile') || type?.includes('phone')) return Smartphone;
    return HardDrive;
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-blue-400" />
            AI Asset Discovery
          </CardTitle>
          <Button
            size="sm"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {discoverMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Scanning...
              </>
            ) : (
              <>
                <Radar className="w-4 h-4 mr-1" />
                Scan Network
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!discovery ? (
          <Alert className="bg-blue-500/10 border-blue-500/30">
            <Sparkles className="h-5 w-5 text-blue-400" />
            <AlertDescription className="text-blue-300">
              Scan your network to automatically discover and classify assets using AI.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {discovery.discovery?.classification_summary && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Discovered</p>
                  <p className="text-2xl font-bold text-white">
                    {discovery.discovery.classification_summary.total_discovered || 0}
                  </p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">High Confidence</p>
                  <p className="text-2xl font-bold text-green-400">
                    {discovery.discovery.classification_summary.high_confidence || 0}
                  </p>
                </div>
              </div>
            )}

            {discovery.discovery?.discovered_assets && discovery.discovery.discovered_assets.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Discovered Assets</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {discovery.discovery.discovered_assets.map((asset, idx) => {
                    const Icon = getTypeIcon(asset.asset_type);
                    return (
                      <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-semibold text-white">{asset.identifier}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {asset.confidence_score}% confident
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                          <p><strong>Type:</strong> {asset.asset_type}</p>
                          <p><strong>Method:</strong> {asset.discovery_method}</p>
                          {asset.ip_address && <p><strong>IP:</strong> {asset.ip_address}</p>}
                          {asset.manufacturer && <p><strong>Mfg:</strong> {asset.manufacturer}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {discovery.created_assets && discovery.created_assets.length > 0 && (
              <Alert className="bg-green-500/10 border-green-500/30">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-300 text-xs">
                  Created {discovery.created_assets.length} asset records automatically.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}