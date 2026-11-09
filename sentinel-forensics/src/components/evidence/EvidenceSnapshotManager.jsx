import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera, Loader2, CheckCircle, Eye, Shield, Hash } from 'lucide-react';
import { toast } from 'sonner';

export default function EvidenceSnapshotManager({ caseId, selectedEvidenceIds = [] }) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showView, setShowView] = useState(null);
  const [snapshotForm, setSnapshotForm] = useState({
    name: '',
    purpose: '',
    notes: ''
  });

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ['evidence-snapshots', caseId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('manageEvidenceSnapshots', {
        action: 'list_snapshots',
        caseId
      });
      return data.snapshots || [];
    },
    enabled: !!caseId
  });

  const createMutation = useMutation({
    mutationFn: async (formData) => {
      const { data } = await base44.functions.invoke('manageEvidenceSnapshots', {
        action: 'create_snapshot',
        caseId,
        snapshotName: formData.name,
        evidenceIds: selectedEvidenceIds,
        purpose: formData.purpose,
        notes: formData.notes
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-snapshots', caseId] });
      setShowCreate(false);
      setSnapshotForm({ name: '', purpose: '', notes: '' });
      toast.success('Evidence snapshot created');
    }
  });

  const viewMutation = useMutation({
    mutationFn: async (snapshotId) => {
      const { data } = await base44.functions.invoke('manageEvidenceSnapshots', {
        action: 'get_snapshot',
        snapshotId
      });
      return data;
    },
    onSuccess: (data) => {
      setShowView(data);
    }
  });

  const verifyMutation = useMutation({
    mutationFn: async (snapshotId) => {
      const { data } = await base44.functions.invoke('manageEvidenceSnapshots', {
        action: 'verify_snapshot',
        snapshotId
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.valid) {
        toast.success('Snapshot integrity verified');
      } else {
        toast.error('Snapshot integrity check FAILED');
      }
    }
  });

  const handleCreate = () => {
    if (!snapshotForm.name) {
      toast.error('Snapshot name is required');
      return;
    }
    if (selectedEvidenceIds.length === 0) {
      toast.error('No evidence selected');
      return;
    }
    createMutation.mutate(snapshotForm);
  };

  return (
    <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" />
            Evidence Snapshots
          </CardTitle>
          <Button
            onClick={() => setShowCreate(true)}
            disabled={selectedEvidenceIds.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Camera className="w-4 h-4 mr-2" />
            Create Snapshot
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-8">
            <Camera className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No snapshots created yet</p>
            <p className="text-xs text-slate-500 mt-1">Select evidence and create a snapshot</p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/30 hover:bg-slate-800/60 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">{snapshot.snapshot_name}</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      {snapshot.evidence_count} evidence items • Created{' '}
                      {new Date(snapshot.frozen_at).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className="bg-blue-500/20 text-blue-300 text-xs">
                        <Hash className="w-3 h-3 mr-1" />
                        {snapshot.snapshot_hash.substring(0, 16)}...
                      </Badge>
                      <Badge className="bg-green-500/20 text-green-300 text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Immutable
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => viewMutation.mutate(snapshot.id)}
                      disabled={viewMutation.isPending}
                      className="border-slate-700"
                    >
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => verifyMutation.mutate(snapshot.id)}
                      disabled={verifyMutation.isPending}
                      className="border-slate-700"
                    >
                      <Shield className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Evidence Snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Creating immutable snapshot of {selectedEvidenceIds.length} evidence items
            </p>
            <div>
              <Label className="text-slate-300">Snapshot Name *</Label>
              <Input
                value={snapshotForm.name}
                onChange={(e) => setSnapshotForm({ ...snapshotForm, name: e.target.value })}
                placeholder="e.g., Pre-Analysis Freeze"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Purpose</Label>
              <Input
                value={snapshotForm.purpose}
                onChange={(e) => setSnapshotForm({ ...snapshotForm, purpose: e.target.value })}
                placeholder="e.g., For expert report"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Notes</Label>
              <Textarea
                value={snapshotForm.notes}
                onChange={(e) => setSnapshotForm({ ...snapshotForm, notes: e.target.value })}
                placeholder="Additional context..."
                className="bg-slate-800 border-slate-700 text-white mt-1 h-20"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowCreate(false)}
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 mr-2" />
                )}
                Create Snapshot
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!showView} onOpenChange={() => setShowView(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Snapshot: {showView?.snapshot?.snapshot_name}</DialogTitle>
          </DialogHeader>
          {showView && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Frozen At</p>
                  <p className="text-white">
                    {new Date(showView.snapshot.frozen_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Created By</p>
                  <p className="text-white">{showView.snapshot.created_by}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500">Snapshot Hash</p>
                  <p className="text-white font-mono text-xs">
                    {showView.snapshot.snapshot_hash}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700">
                <h3 className="text-white font-semibold mb-3">
                  Evidence Items ({showView.items?.length || 0})
                </h3>
                <div className="space-y-2">
                  {showView.items?.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-800/50 rounded border border-slate-700"
                    >
                      <div className="flex justify-between">
                        <div>
                          <p className="text-white font-medium">
                            {item.frozen_state.title}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {item.exhibit_number && `${item.exhibit_number} • `}
                            {item.frozen_state.evidence_type}
                          </p>
                        </div>
                        <Badge className="bg-blue-500/20 text-blue-300 text-xs">
                          {item.evidence_hash.substring(0, 8)}...
                        </Badge>
                      </div>
                      {item.tags_at_freeze?.length > 0 && (
                        <div className="mt-2 flex gap-1 flex-wrap">
                          {item.tags_at_freeze.map((tag, i) => (
                            <Badge key={i} className="bg-slate-700 text-slate-300 text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}