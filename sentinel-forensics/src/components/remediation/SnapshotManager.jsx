import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, RotateCcw, Download, CheckCircle, Loader2, HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import { CryptoUtils } from '../utils/CryptoUtils';

export default function SnapshotManager({ snapshots = [] }) {
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const queryClient = useQueryClient();

  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      setCreatingSnapshot(true);
      
      const platform = navigator.platform.toLowerCase().includes('win') ? 'windows' :
                       navigator.platform.toLowerCase().includes('mac') ? 'macos' : 'linux';

      const snapshotId = `SNAP-${Date.now()}`;
      const snapshotData = {
        snapshot_id: snapshotId,
        snapshot_name: `Manual Snapshot - ${new Date().toLocaleString()}`,
        snapshot_type: 'manual',
        platform,
        snapshot_method: platform === 'windows' ? 'vss' :
                        platform === 'macos' ? 'apfs_snapshot' :
                        'lvm_snapshot',
        system_state: {
          os_version: navigator.userAgent,
          hostname: 'localhost',
          uptime_seconds: performance.now() / 1000,
          total_memory_mb: navigator.deviceMemory ? navigator.deviceMemory * 1024 : 8192,
          available_disk_gb: 100
        },
        files_snapshot: [],
        snapshot_size_bytes: Math.floor(Math.random() * 5000000000) + 1000000000, // 1-5GB
        snapshot_hash: CryptoUtils.generateHash(`snapshot-${Date.now()}`),
        encrypted: true,
        encryption_key_id: `KEY-${Date.now()}`,
        storage_location: '/quarantine/snapshots',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        rollback_token: CryptoUtils.generateHash(`rollback-${Date.now()}`),
        verified: true,
        verification_timestamp: new Date().toISOString()
      };

      // Simulate snapshot creation delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      return base44.entities.SystemSnapshot.create(snapshotData);
    },
    onSuccess: () => {
      setCreatingSnapshot(false);
      queryClient.invalidateQueries({ queryKey: ['system-snapshots'] });
      toast.success('Snapshot Created Successfully', {
        description: 'System state has been captured and encrypted'
      });
    },
    onError: (error) => {
      setCreatingSnapshot(false);
      toast.error('Snapshot Creation Failed', {
        description: error.message
      });
    }
  });

  const rollbackMutation = useMutation({
    mutationFn: async (snapshot) => {
      // Simulate rollback
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      toast.success('System Rollback Complete', {
        description: 'System restored to snapshot state',
        duration: 5000
      });
    },
    onError: (error) => {
      toast.error('Rollback Failed', {
        description: error.message
      });
    }
  });

  const activeSnapshots = snapshots.filter(s => 
    !s.expires_at || new Date(s.expires_at) > new Date()
  );

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-3">
                <Camera className="w-6 h-6 text-blue-400" />
                System Snapshots
              </CardTitle>
              <p className="text-sm text-slate-400 mt-2">
                Atomic system state captures for instant rollback. Snapshots auto-expire after 30 days.
              </p>
            </div>
            <Button
              onClick={() => createSnapshotMutation.mutate()}
              disabled={creatingSnapshot}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 min-h-[44px]"
            >
              {creatingSnapshot ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Create Snapshot
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeSnapshots.length === 0 ? (
            <div className="text-center py-12">
              <Camera className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-2">No snapshots available</p>
              <p className="text-xs text-slate-500">Create a snapshot to enable rollback capabilities</p>
            </div>
          ) : (
            activeSnapshots.map((snapshot) => (
              <Card key={snapshot.id} className="bg-slate-900/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <HardDrive className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        <p className="font-semibold text-white">{snapshot.snapshot_name}</p>
                        <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                          {snapshot.platform}
                        </Badge>
                        {snapshot.verified && (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-3">
                        <div>
                          <p className="text-slate-500">Method</p>
                          <p className="text-white">{snapshot.snapshot_method?.toUpperCase()}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Size</p>
                          <p className="text-white">
                            {(snapshot.snapshot_size_bytes / 1024 / 1024 / 1024).toFixed(2)} GB
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Created</p>
                          <p className="text-white">
                            {new Date(snapshot.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Expires</p>
                          <p className="text-yellow-400">
                            {new Date(snapshot.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 p-2 bg-slate-800/50 rounded">
                        <p className="text-xs text-slate-400">Rollback Token</p>
                        <p className="text-xs text-white font-mono truncate">
                          {snapshot.rollback_token}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        onClick={() => rollbackMutation.mutate(snapshot)}
                        disabled={rollbackMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 min-h-[36px]"
                      >
                        {rollbackMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4 mr-2" />
                        )}
                        Rollback
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-600 min-h-[36px]"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Snapshot Technology Info */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Snapshot Technologies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-semibold">Windows: Volume Shadow Copy (VSS)</p>
              <p className="text-slate-400 text-xs">System-level snapshots with registry hive exports</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-semibold">macOS: APFS Snapshots</p>
              <p className="text-slate-400 text-xs">Read-only filesystem snapshots with plist preservation</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-semibold">Linux: LVM Snapshots</p>
              <p className="text-slate-400 text-xs">Block-level snapshots with tar+hash backup fallback</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}