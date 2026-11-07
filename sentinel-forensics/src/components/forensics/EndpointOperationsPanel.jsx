import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  HardDrive,
  Database,
  File,
  ShieldAlert,
  Activity,
  Cpu,
  Network,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldOff,
  ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';

export default function EndpointOperationsPanel({ caseId, onEvidenceCollected }) {
  const [selectedDevice, setSelectedDevice] = useState('');
  const [collectionType, setCollectionType] = useState('memory');
  const [targetPaths, setTargetPaths] = useState('');
  const [isolateReason, setIsolateReason] = useState('');
  const [showIsolateDialog, setShowIsolateDialog] = useState(false);
  const [isolateAction, setIsolateAction] = useState('isolate');
  const [liveSnapshot, setLiveSnapshot] = useState(null);

  const queryClient = useQueryClient();

  // Fetch devices
  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['devices', caseId],
    queryFn: async () => {
      const allDevices = await base44.entities.Device.list();
      return allDevices || [];
    }
  });

  // Collection mutation
  const collectMutation = useMutation({
    mutationFn: async (params) => {
      const response = await base44.functions.invoke('remoteEvidenceCollection', params);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Collection Started', {
        description: data.message || 'Evidence collection initiated'
      });
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
      onEvidenceCollected?.();
    },
    onError: (error) => {
      toast.error('Collection Failed', {
        description: error.message || 'Failed to initiate collection'
      });
    }
  });

  // Isolation mutation
  const isolationMutation = useMutation({
    mutationFn: async (params) => {
      const response = await base44.functions.invoke('endpointIsolation', params);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(isolateAction === 'isolate' ? 'Isolation Initiated' : 'Restoration Initiated', {
        description: data.message
      });
      setShowIsolateDialog(false);
      setIsolateReason('');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (error) => {
      toast.error('Action Failed', {
        description: error.message
      });
    }
  });

  // Live snapshot mutation
  const snapshotMutation = useMutation({
    mutationFn: async (params) => {
      const response = await base44.functions.invoke('liveSystemSnapshot', params);
      return response.data;
    },
    onSuccess: (data) => {
      setLiveSnapshot(data);
      toast.success('Snapshot Captured', {
        description: 'Live system state retrieved'
      });
    },
    onError: (error) => {
      toast.error('Snapshot Failed', {
        description: error.message
      });
    }
  });

  const handleCollect = () => {
    if (!selectedDevice) {
      toast.error('Please select a device');
      return;
    }

    const params = {
      device_id: selectedDevice,
      case_id: caseId,
      collection_type: collectionType,
      target_paths: collectionType === 'files' ? targetPaths.split('\n').filter(p => p.trim()) : []
    };

    collectMutation.mutate(params);
  };

  const handleIsolate = () => {
    if (!selectedDevice) {
      toast.error('Please select a device');
      return;
    }

    setShowIsolateDialog(true);
  };

  const confirmIsolation = () => {
    isolationMutation.mutate({
      device_id: selectedDevice,
      case_id: caseId,
      action: isolateAction,
      reason: isolateReason
    });
  };

  const handleSnapshot = () => {
    if (!selectedDevice) {
      toast.error('Please select a device');
      return;
    }

    snapshotMutation.mutate({
      device_id: selectedDevice,
      case_id: caseId,
      snapshot_types: ['processes', 'network', 'users', 'services']
    });
  };

  const selectedDeviceObj = devices.find(d => d.id === selectedDevice);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Remote Endpoint Operations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Device Selection */}
        <div className="space-y-2">
          <Label className="text-slate-300">Target Endpoint</Label>
          <Select value={selectedDevice} onValueChange={setSelectedDevice}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Select device..." />
            </SelectTrigger>
            <SelectContent>
              {devices.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  <div className="flex items-center gap-2">
                    <span>{device.hostname || device.id}</span>
                    {device.is_isolated && (
                      <Badge className="bg-red-500/20 text-red-300 text-xs">
                        ISOLATED
                      </Badge>
                    )}
                    {device.status === 'online' && (
                      <Badge className="bg-green-500/20 text-green-300 text-xs">
                        ONLINE
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedDeviceObj && (
          <Alert className="bg-slate-800/50 border-slate-700">
            <AlertDescription className="text-slate-300 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500">OS:</span> {selectedDeviceObj.os_type || 'Unknown'}
                </div>
                <div>
                  <span className="text-slate-500">IP:</span> {selectedDeviceObj.ip_address || 'Unknown'}
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>{' '}
                  <Badge className={selectedDeviceObj.status === 'online' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-300'}>
                    {selectedDeviceObj.status || 'Unknown'}
                  </Badge>
                </div>
                <div>
                  <span className="text-slate-500">Isolated:</span>{' '}
                  {selectedDeviceObj.is_isolated ? (
                    <ShieldOff className="w-4 h-4 inline text-red-400" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 inline text-green-400" />
                  )}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Evidence Collection */}
        <div className="space-y-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Database className="w-4 h-4" />
            Evidence Collection
          </h3>

          <div className="space-y-2">
            <Label className="text-slate-400 text-xs">Collection Type</Label>
            <Select value={collectionType} onValueChange={setCollectionType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="memory">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    RAM Memory Capture
                  </div>
                </SelectItem>
                <SelectItem value="disk_image">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    Full Disk Image
                  </div>
                </SelectItem>
                <SelectItem value="files">
                  <div className="flex items-center gap-2">
                    <File className="w-4 h-4" />
                    Specific Files/Paths
                  </div>
                </SelectItem>
                <SelectItem value="triage">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Forensic Triage Package
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {collectionType === 'files' && (
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">Target Paths (one per line)</Label>
              <Textarea
                value={targetPaths}
                onChange={(e) => setTargetPaths(e.target.value)}
                placeholder="C:\Users\victim\Desktop\&#10;C:\Windows\System32\drivers\etc\hosts&#10;/var/log/auth.log"
                className="bg-slate-800 border-slate-700 text-white font-mono text-xs"
                rows={4}
              />
            </div>
          )}

          <Button
            onClick={handleCollect}
            disabled={!selectedDevice || collectMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {collectMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Initiating Collection...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                Start Collection
              </>
            )}
          </Button>
        </div>

        {/* Live Monitoring */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={handleSnapshot}
            disabled={!selectedDevice || snapshotMutation.isPending}
            className="border-slate-700 hover:bg-slate-800"
          >
            {snapshotMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Activity className="w-4 h-4 mr-2" />
            )}
            Live Snapshot
          </Button>

          <Button
            variant="outline"
            onClick={handleIsolate}
            disabled={!selectedDevice}
            className={selectedDeviceObj?.is_isolated 
              ? 'border-green-700 hover:bg-green-900/20 text-green-300'
              : 'border-red-700 hover:bg-red-900/20 text-red-300'
            }
          >
            {selectedDeviceObj?.is_isolated ? (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" />
                Restore Access
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 mr-2" />
                Isolate Endpoint
              </>
            )}
          </Button>
        </div>

        {/* Live Snapshot Display */}
        {liveSnapshot && (
          <div className="space-y-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700 max-h-96 overflow-y-auto">
            <h4 className="text-sm font-semibold text-slate-300">Live System State</h4>
            <div className="space-y-2 text-xs">
              {liveSnapshot.snapshot?.processes && (
                <div>
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Cpu className="w-3 h-3" />
                    Running Processes ({liveSnapshot.snapshot.processes.length})
                  </div>
                  <div className="bg-slate-900 p-2 rounded font-mono text-[10px] max-h-32 overflow-y-auto">
                    {liveSnapshot.snapshot.processes.slice(0, 10).map((proc, idx) => (
                      <div key={idx}>{proc.name} (PID: {proc.pid})</div>
                    ))}
                  </div>
                </div>
              )}
              {liveSnapshot.snapshot?.network && (
                <div>
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Network className="w-3 h-3" />
                    Network Connections ({liveSnapshot.snapshot.network.length})
                  </div>
                  <div className="bg-slate-900 p-2 rounded font-mono text-[10px]">
                    {liveSnapshot.snapshot.network.slice(0, 5).map((conn, idx) => (
                      <div key={idx}>{conn.remote_ip}:{conn.remote_port}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Isolation Dialog */}
        <Dialog open={showIsolateDialog} onOpenChange={setShowIsolateDialog}>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">
                {selectedDeviceObj?.is_isolated ? 'Restore Network Access' : 'Isolate Endpoint'}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                {selectedDeviceObj?.is_isolated 
                  ? 'This will restore network connectivity to the endpoint.'
                  : 'This will block all network connections from the endpoint (except to this platform).'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Alert className="bg-orange-900/20 border-orange-700/50">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <AlertDescription className="text-orange-200 text-sm">
                  <p className="font-semibold mb-1">Critical Action</p>
                  <p>This action will be logged and requires justification. All endpoint operations will be audited.</p>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label className="text-slate-300">Reason (Required)</Label>
                <Textarea
                  value={isolateReason}
                  onChange={(e) => setIsolateReason(e.target.value)}
                  placeholder="Explain why this action is necessary..."
                  className="bg-slate-800 border-slate-700 text-white"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowIsolateDialog(false)}
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmIsolation}
                disabled={!isolateReason.trim() || isolationMutation.isPending}
                className={selectedDeviceObj?.is_isolated
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
                }
              >
                {isolationMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Confirm {selectedDeviceObj?.is_isolated ? 'Restoration' : 'Isolation'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}