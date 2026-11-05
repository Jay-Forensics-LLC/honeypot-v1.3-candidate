import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Trash2, RotateCcw, Search, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function RecycleBin() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(null);
  const [emptyBinConfirm, setEmptyBinConfirm] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: recycleBinItems = [] } = useQuery({
    queryKey: ['recycle-bin'],
    queryFn: () => base44.entities.RecycleBin.list('-deleted_at', 100),
    initialData: [],
  });

  const restoreItemMutation = useMutation({
    mutationFn: async (item) => {
      // Restore to original entity
      const entityMap = {
        'Alert': base44.entities.Alert,
        'Case': base44.entities.Case,
        'Evidence': base44.entities.Evidence,
        'EvidenceV2': base44.entities.EvidenceV2,
        'Honeypot': base44.entities.Honeypot,
        'CovertOperation': base44.entities.CovertOperation,
      };

      const entity = entityMap[item.original_entity];
      if (entity) {
        await entity.create(item.original_data);
      }

      // Remove from recycle bin
      await base44.entities.RecycleBin.delete(item.id);

      // Log restoration
      await base44.entities.AuditLog.create({
        event_type: 'item_restored',
        severity: 'info',
        description: `Restored ${item.original_entity} from recycle bin`,
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          original_entity: item.original_entity,
          original_id: item.original_id
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycle-bin'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['evidence-v2'] });
      toast.success('Item restored successfully');
    },
    onError: () => {
      toast.error('Failed to restore item');
    }
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (itemId) => {
      await base44.entities.RecycleBin.delete(itemId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycle-bin'] });
      setPermanentDeleteConfirm(null);
      toast.success('Item permanently deleted');
    },
    onError: () => {
      toast.error('Failed to delete item');
    }
  });

  const emptyBinMutation = useMutation({
    mutationFn: async () => {
      const deletePromises = recycleBinItems.map(item => 
        base44.entities.RecycleBin.delete(item.id)
      );
      await Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycle-bin'] });
      setEmptyBinConfirm(false);
      toast.success('Recycle bin emptied');
    },
    onError: () => {
      toast.error('Failed to empty recycle bin');
    }
  });

  const filteredItems = recycleBinItems.filter(item => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.original_entity.toLowerCase().includes(searchLower) ||
      JSON.stringify(item.original_data).toLowerCase().includes(searchLower)
    );
  });

  const getEntityIcon = (entityType) => {
    switch (entityType) {
      case 'Alert':
        return '🚨';
      case 'Case':
        return '📁';
      case 'Evidence':
      case 'EvidenceV2':
        return '🔍';
      case 'Honeypot':
        return '🍯';
      case 'CovertOperation':
        return '🕵️';
      default:
        return '📄';
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Recycle Bin</h1>
          <p className="text-sm md:text-base text-slate-400">Restore or permanently delete items</p>
        </div>
        {recycleBinItems.length > 0 && (
          <Button
            onClick={() => setEmptyBinConfirm(true)}
            variant="outline"
            className="border-red-500/50 text-red-400 hover:bg-red-500/10 w-full md:w-auto"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Empty Bin
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search deleted items..."
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs md:text-sm">Total Items</p>
            <p className="text-2xl md:text-3xl font-bold text-white">{recycleBinItems.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs md:text-sm">Alerts</p>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {recycleBinItems.filter(i => i.original_entity === 'Alert').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs md:text-sm">Cases</p>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {recycleBinItems.filter(i => i.original_entity === 'Case').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Items List */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-lg md:text-xl">Deleted Items</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 md:py-12">
              <Trash2 className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 text-sm md:text-base">
                {recycleBinItems.length === 0 ? 'Recycle bin is empty' : 'No items match your search'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map(item => {
                const title = item.original_data.title || item.original_data.case_number || item.original_data.honeypot_name || 'Untitled';
                const daysUntilPermanentDelete = Math.ceil(
                  (new Date(item.permanent_delete_at) - new Date()) / (1000 * 60 * 60 * 24)
                );

                return (
                  <div
                    key={item.id}
                    className="p-3 md:p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl md:text-2xl">{getEntityIcon(item.original_entity)}</span>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-white text-sm md:text-base truncate">{title}</h4>
                            <p className="text-xs text-slate-400">
                              {item.original_entity} • Deleted {format(new Date(item.deleted_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="border-orange-500/50 text-orange-400">
                            <Clock className="w-3 h-3 mr-1" />
                            {daysUntilPermanentDelete} days until permanent deletion
                          </Badge>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => restoreItemMutation.mutate(item)}
                          disabled={restoreItemMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 flex-1 md:flex-none"
                        >
                          <RotateCcw className="w-4 h-4 md:mr-2" />
                          <span className="hidden md:inline">Restore</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPermanentDeleteConfirm(item)}
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10 flex-1 md:flex-none"
                        >
                          <Trash2 className="w-4 h-4 md:mr-2" />
                          <span className="hidden md:inline">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={!!permanentDeleteConfirm} onOpenChange={() => setPermanentDeleteConfirm(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white max-w-md mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Permanent Delete?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This action cannot be undone. The item will be permanently deleted and cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => permanentDeleteMutation.mutate(permanentDeleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty Bin Confirmation */}
      <AlertDialog open={emptyBinConfirm} onOpenChange={setEmptyBinConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white max-w-md mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Empty Recycle Bin?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete all {recycleBinItems.length} items in the recycle bin. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => emptyBinMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              Empty Bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}