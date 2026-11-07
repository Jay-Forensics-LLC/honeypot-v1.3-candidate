import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Zap, CheckCircle, X, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PersistenceRemoval() {
  const [selectedItems, setSelectedItems] = useState([]);
  const queryClient = useQueryClient();

  const { data: persistenceItems = [] } = useQuery({
    queryKey: ['persistence-items'],
    queryFn: async () => {
      try {
        return await base44.entities.PersistenceItem.filter(
          { remediated: false },
          '-first_seen',
          50
        );
      } catch (error) {
        console.warn('Failed to load persistence items:', error);
        return [];
      }
    },
    staleTime: 30000
  });

  const remediateMutation = useMutation({
    mutationFn: async (items) => {
      for (const item of items) {
        await base44.entities.PersistenceItem.update(item.id, {
          remediated: true,
          remediated_at: new Date().toISOString(),
          user_action: 'remove'
        });
      }
    },
    onSuccess: (_, items) => {
      queryClient.invalidateQueries({ queryKey: ['persistence-items'] });
      setSelectedItems([]);
      toast.success(`${items.length} Persistence Item(s) Removed`, {
        description: 'System has been cleaned'
      });
    }
  });

  const toggleItem = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleAll = () => {
    if (selectedItems.length === persistenceItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(persistenceItems.map(i => i.id));
    }
  };

  const selectedItemsData = persistenceItems.filter(i => selectedItems.includes(i.id));

  const typeIcons = {
    windows_service: '⚙️',
    systemd_unit: '🔧',
    launchd_daemon: '🚀',
    scheduled_task: '⏰',
    registry_run_key: '📋',
    startup_folder: '📁',
    browser_extension: '🌐',
    driver: '🔌'
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-white flex items-center gap-3">
                <Zap className="w-6 h-6 text-purple-400" />
                Persistence Mechanisms
              </CardTitle>
              <p className="text-sm text-slate-400 mt-2">
                Detected autorun locations, services, and startup items
              </p>
            </div>
            {selectedItems.length > 0 && (
              <Button
                onClick={() => remediateMutation.mutate(selectedItemsData)}
                disabled={remediateMutation.isPending}
                className="bg-red-600 hover:bg-red-700 min-h-[44px]"
              >
                {remediateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Remove {selectedItems.length} Item(s)
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-800/50 rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{persistenceItems.length}</p>
              <p className="text-xs text-slate-400">Total Items</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">
                {persistenceItems.filter(p => p.threat_assessment?.is_malicious).length}
              </p>
              <p className="text-xs text-slate-400">Malicious</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">
                {persistenceItems.filter(p => p.threat_assessment?.is_suspicious).length}
              </p>
              <p className="text-xs text-slate-400">Suspicious</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">
                {persistenceItems.filter(p => p.threat_assessment?.is_legitimate).length}
              </p>
              <p className="text-xs text-slate-400">Legitimate</p>
            </div>
          </div>

          {/* Select All */}
          {persistenceItems.length > 0 && (
            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded border border-slate-700">
              <Checkbox
                id="select-all"
                checked={selectedItems.length === persistenceItems.length}
                onCheckedChange={toggleAll}
              />
              <Label htmlFor="select-all" className="text-white cursor-pointer">
                Select All ({persistenceItems.length} items)
              </Label>
            </div>
          )}

          {/* Persistence Items */}
          <div className="space-y-3">
            {persistenceItems.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
                <p className="text-slate-400 mb-2">No persistence items detected</p>
                <p className="text-xs text-slate-500">Run a scan to check for autorun mechanisms</p>
              </div>
            ) : (
              persistenceItems.map((item) => (
                <Card key={item.id} className="bg-slate-900/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedItems.includes(item.id)}
                        onCheckedChange={() => toggleItem(item.id)}
                        className="mt-1"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{typeIcons[item.persistence_type] || '📌'}</span>
                          <p className="font-semibold text-white">{item.name}</p>
                          <Badge className={
                            item.threat_assessment?.is_malicious ? 'bg-red-500/20 text-red-400' :
                            item.threat_assessment?.is_suspicious ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-green-500/20 text-green-400'
                          }>
                            {item.threat_assessment?.is_malicious ? 'Malicious' :
                             item.threat_assessment?.is_suspicious ? 'Suspicious' : 'Legitimate'}
                          </Badge>
                        </div>

                        <p className="text-sm text-slate-400 font-mono mb-2 break-all">
                          {item.location}
                        </p>

                        {item.command && (
                          <p className="text-xs text-slate-500 font-mono mb-2 break-all">
                            Command: {item.command}
                          </p>
                        )}

                        {item.detection_reasons && item.detection_reasons.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.detection_reasons.map((reason, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px]">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-4 mt-3 text-xs">
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            <span className="text-slate-400">
                              Signed: {item.is_signed ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-blue-400" />
                            <span className="text-slate-400">
                              Auto-start: {item.auto_start ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Play className="w-3 h-3 text-purple-400" />
                            <span className="text-slate-400">
                              Enabled: {item.enabled ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}