import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Trash2,
  Eye,
  RotateCcw,
  Search,
  Archive,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function QuarantineManager({ quarantineItems = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const queryClient = useQueryClient();

  const restoreItemMutation = useMutation({
    mutationFn: async (item) => {
      await base44.entities.QuarantineItem.update(item.id, {
        status: 'restored',
        restored_at: new Date().toISOString(),
        user_decision: 'restore',
        chain_of_custody: [
          ...(item.chain_of_custody || []),
          {
            timestamp: new Date().toISOString(),
            action: 'Item restored to original location',
            performed_by: 'user',
            integrity_hash: item.hashes?.sha256
          }
        ]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantine-items'] });
      toast.success('Item Restored Successfully', {
        description: 'File has been restored to original location'
      });
    },
    onError: (error) => {
      toast.error('Restore Failed', {
        description: error.message
      });
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (item) => {
      await base44.entities.QuarantineItem.update(item.id, {
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        user_decision: 'delete_permanent',
        chain_of_custody: [
          ...(item.chain_of_custody || []),
          {
            timestamp: new Date().toISOString(),
            action: 'Item permanently deleted',
            performed_by: 'user',
            integrity_hash: item.hashes?.sha256
          }
        ]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantine-items'] });
      setDeleteConfirm(null);
      toast.success('Item Deleted Permanently');
    },
    onError: (error) => {
      toast.error('Delete Failed', {
        description: error.message
      });
    }
  });

  const filteredItems = quarantineItems.filter(item => {
    const matchesSeverity = filterSeverity === 'all' || item.severity === filterSeverity;
    const matchesSearch = searchTerm === '' ||
      item.original_path?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.threat_classification?.toLowerCase().includes(searchTerm.toLowerCase());
    const isActive = item.status === 'quarantined';
    
    return matchesSeverity && matchesSearch && isActive;
  });

  const severityColors = {
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    low: 'bg-green-500/20 text-green-400 border-green-500/50',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    critical: 'bg-red-500/20 text-red-400 border-red-500/50'
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-3">
            <Archive className="w-6 h-6 text-orange-400" />
            Quarantine Vault
          </CardTitle>
          <p className="text-sm text-slate-400 mt-2">
            Encrypted AES-256 storage for suspicious items. All items maintain chain-of-custody.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filter */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search quarantine..."
                className="pl-10 bg-slate-800 border-slate-700 text-white"
                style={{ fontSize: '16px' }}
              />
            </div>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2 text-sm"
              style={{ fontSize: '16px' }}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-slate-800/50 rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{quarantineItems.length}</p>
              <p className="text-xs text-slate-400">Total Items</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">
                {quarantineItems.filter(q => q.severity === 'critical' && q.status === 'quarantined').length}
              </p>
              <p className="text-xs text-slate-400">Critical</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">
                {quarantineItems.filter(q => q.status === 'restored').length}
              </p>
              <p className="text-xs text-slate-400">Restored</p>
            </div>
          </div>

          {/* Quarantine Items List */}
          <div className="space-y-3">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <Archive className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400 mb-2">No items in quarantine</p>
                <p className="text-xs text-slate-500">Detected threats will appear here</p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <Card key={item.id} className="bg-slate-900/50 border-slate-700 hover:border-orange-500/50 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className={severityColors[item.severity]}>
                            {item.severity?.toUpperCase()}
                          </Badge>
                          <Badge className="bg-slate-700 text-slate-300 text-xs">
                            {item.threat_classification}
                          </Badge>
                          <Badge className="bg-slate-700 text-slate-300 text-xs">
                            {item.item_type?.replace('_', ' ')}
                          </Badge>
                        </div>
                        
                        <p className="text-white font-mono text-sm mb-2 break-all">
                          {item.original_path}
                        </p>

                        {item.detection_engines && item.detection_engines.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.detection_engines.map((engine, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px]">
                                {engine.engine_name}: {engine.verdict}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="text-xs text-slate-500 mt-2">
                          Quarantined: {new Date(item.quarantined_at).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={() => setSelectedItem(item)}
                          variant="outline"
                          className="border-slate-600 min-h-[36px]"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Details
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => restoreItemMutation.mutate(item)}
                          disabled={restoreItemMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 min-h-[36px]"
                        >
                          {restoreItemMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4 mr-2" />
                          )}
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setDeleteConfirm(item)}
                          variant="destructive"
                          className="min-h-[36px]"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Quarantined Item?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete the quarantined item. This action cannot be undone.
              Chain-of-custody will be maintained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteItemMutation.mutate(deleteConfirm)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteItemMutation.isPending}
            >
              {deleteItemMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}