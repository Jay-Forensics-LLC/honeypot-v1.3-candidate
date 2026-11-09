import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  ShieldOff,
  Camera,
  HardDrive,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { endpointIsolation } from '../../functions/endpointIsolation';
import { liveSystemSnapshot } from '../../functions/liveSystemSnapshot';
import { remoteEvidenceCollection } from '../../functions/remoteEvidenceCollection';
import { auditLogger } from '../utils/auditLogger';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

/**
 * REMOTE ACTION DIALOG
 * Execute forensic actions directly from threat detection
 */
export default function RemoteActionDialog({ 
  open, 
  onOpenChange, 
  deviceId, 
  deviceName,
  threatId,
  threatTitle 
}) {
  // Enhanced state: track both results and in-progress status
  const [actionResults, setActionResults] = useState({
    isolation: { inProgress: false, statusMessage: '', success: null, message: '', data: null },
    snapshot: { inProgress: false, statusMessage: '', success: null, message: '', data: null },
    triage: { inProgress: false, statusMessage: '', success: null, message: '', data: null }
  });
  const queryClient = useQueryClient();

  // Isolate Device Mutation
  const isolateMutation = useMutation({
    mutationFn: async (action) => {
      // Set in-progress state
      setActionResults(prev => ({
        ...prev,
        isolation: { 
          ...prev.isolation,
          inProgress: true, 
          statusMessage: action === 'isolate' ? 'Isolating device...' : 'Restoring network access...'
        }
      }));

      const response = await endpointIsolation({
        device_id: deviceId,
        action: action,
        reason: `Response to threat: ${threatTitle}`
      });
      return response.data;
    },
    onSuccess: async (data, action) => {
      await auditLogger.log({
        event_type: 'endpoint_isolation_triggered',
        severity: 'high',
        description: `Device ${deviceId} ${action === 'isolate' ? 'isolated' : 'restored'} from LiveDefense`,
        metadata: {
          origin_page: 'LiveDefense',
          device_id: deviceId,
          device_name: deviceName,
          action: action,
          initiating_threat_id: threatId,
          initiating_threat_title: threatTitle,
          target_device_id: deviceId,
          trigger_source: 'live_defense_threat_response'
        }
      });

      setActionResults(prev => ({
        ...prev,
        isolation: { 
          inProgress: false,
          statusMessage: `Device successfully ${action === 'isolate' ? 'isolated' : 'restored'}`,
          success: true, 
          message: data.message,
          data: data
        }
      }));

      toast.success(`Device ${action === 'isolate' ? 'Isolated' : 'Restored'}`, {
        description: data.message
      });

      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: async (error, action) => {
      await auditLogger.log({
        event_type: 'endpoint_isolation_failed',
        severity: 'warning',
        description: `Failed to ${action} device ${deviceId}: ${error.message}`,
        metadata: {
          origin_page: 'LiveDefense',
          device_id: deviceId,
          error: error.message,
          error_stack: error.stack,
          initiating_threat_id: threatId,
          target_device_id: deviceId
        }
      });

      setActionResults(prev => ({
        ...prev,
        isolation: { 
          inProgress: false,
          statusMessage: `Failed to ${action} device`,
          success: false, 
          message: error.message 
        }
      }));

      toast.error(`Isolation ${action} failed`, {
        description: error.message
      });
    }
  });

  // Live Snapshot Mutation
  const snapshotMutation = useMutation({
    mutationFn: async () => {
      // Set in-progress state
      setActionResults(prev => ({
        ...prev,
        snapshot: { 
          ...prev.snapshot,
          inProgress: true, 
          statusMessage: 'Capturing live system state...'
        }
      }));

      const response = await liveSystemSnapshot({
        device_id: deviceId
      });
      return response.data;
    },
    onSuccess: async (data) => {
      await auditLogger.log({
        event_type: 'live_snapshot_captured',
        severity: 'info',
        description: `Live snapshot captured for device ${deviceId}`,
        metadata: {
          origin_page: 'LiveDefense',
          device_id: deviceId,
          device_name: deviceName,
          initiating_threat_id: threatId,
          initiating_threat_title: threatTitle,
          target_device_id: deviceId,
          snapshot_details: data,
          agent_session_id: data.session_id,
          trigger_source: 'live_defense_threat_response'
        }
      });

      setActionResults(prev => ({
        ...prev,
        snapshot: { 
          inProgress: false,
          statusMessage: 'Snapshot captured successfully',
          success: true, 
          data: data 
        }
      }));

      toast.success('Live Snapshot Captured', {
        description: `${data.process_count || 0} processes, ${data.connection_count || 0} connections`
      });

      queryClient.invalidateQueries({ queryKey: ['system-snapshots'] });
    },
    onError: async (error) => {
      await auditLogger.log({
        event_type: 'live_snapshot_failed',
        severity: 'warning',
        description: `Failed to capture snapshot for device ${deviceId}: ${error.message}`,
        metadata: {
          origin_page: 'LiveDefense',
          device_id: deviceId,
          error: error.message,
          error_stack: error.stack,
          initiating_threat_id: threatId,
          target_device_id: deviceId
        }
      });

      setActionResults(prev => ({
        ...prev,
        snapshot: { 
          inProgress: false,
          statusMessage: 'Snapshot capture failed',
          success: false, 
          message: error.message 
        }
      }));

      toast.error('Snapshot failed', {
        description: error.message
      });
    }
  });

  // Triage Collection Mutation
  const triageMutation = useMutation({
    mutationFn: async () => {
      // Set in-progress state
      setActionResults(prev => ({
        ...prev,
        triage: { 
          ...prev.triage,
          inProgress: true, 
          statusMessage: 'Initiating triage collection...'
        }
      }));

      const response = await remoteEvidenceCollection({
        device_id: deviceId,
        collection_type: 'triage',
        targets: ['memory', 'disk', 'registry']
      });
      return response.data;
    },
    onSuccess: async (data) => {
      await auditLogger.log({
        event_type: 'triage_collection_initiated',
        severity: 'info',
        description: `Triage collection started for device ${deviceId}`,
        metadata: {
          origin_page: 'LiveDefense',
          device_id: deviceId,
          device_name: deviceName,
          initiating_threat_id: threatId,
          initiating_threat_title: threatTitle,
          target_device_id: deviceId,
          collection_details: data,
          evidence_collection_id: data.collection_id,
          trigger_source: 'live_defense_threat_response'
        }
      });

      setActionResults(prev => ({
        ...prev,
        triage: { 
          inProgress: false,
          statusMessage: 'Triage collection in progress - artifacts being uploaded',
          success: true, 
          data: data 
        }
      }));

      toast.success('Triage Collection Started', {
        description: 'Evidence collection in progress',
        duration: 5000
      });

      queryClient.invalidateQueries({ queryKey: ['evidence'] });
    },
    onError: async (error) => {
      await auditLogger.log({
        event_type: 'triage_collection_failed',
        severity: 'warning',
        description: `Failed to initiate triage for device ${deviceId}: ${error.message}`,
        metadata: {
          origin_page: 'LiveDefense',
          device_id: deviceId,
          error: error.message,
          error_stack: error.stack,
          initiating_threat_id: threatId,
          target_device_id: deviceId
        }
      });

      setActionResults(prev => ({
        ...prev,
        triage: { 
          inProgress: false,
          statusMessage: 'Triage collection failed',
          success: false, 
          message: error.message 
        }
      }));

      toast.error('Triage failed', {
        description: error.message
      });
    }
  });

  const isAnyLoading = isolateMutation.isPending || snapshotMutation.isPending || triageMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Remote Endpoint Actions
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Execute forensic operations on {deviceName || deviceId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Device Info */}
          <Alert className="bg-slate-800/50 border-slate-700">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <AlertDescription className="text-slate-300">
              <strong>Threat Detected:</strong> {threatTitle}
              <p className="text-xs text-slate-400 mt-1">
                Target Device: <span className="font-mono">{deviceId}</span>
              </p>
            </AlertDescription>
          </Alert>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 gap-3">
            {/* Isolate Device */}
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <ShieldOff className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">Isolate Device</h4>
                    <p className="text-xs text-slate-400">Block all network access</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => isolateMutation.mutate('isolate')}
                  disabled={isAnyLoading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {actionResults.isolation.inProgress ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      Isolating...
                    </>
                  ) : (
                    'Isolate'
                  )}
                </Button>
              </div>
              {actionResults.isolation.statusMessage && (
                <div className={`text-xs p-3 rounded mb-2 ${
                  actionResults.isolation.inProgress 
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                    : actionResults.isolation.success 
                      ? 'bg-green-500/10 text-green-400 border border-green-500/30' 
                      : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {actionResults.isolation.inProgress ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : actionResults.isolation.success ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span>{actionResults.isolation.statusMessage}</span>
                    </div>
                    {actionResults.isolation.success && !actionResults.isolation.inProgress && (
                      <Link 
                        to={createPageUrl('Devices', { highlight: deviceId })}
                        className="text-xs flex items-center gap-1 hover:underline"
                      >
                        View Details
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Live Snapshot */}
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">Capture Live Snapshot</h4>
                    <p className="text-xs text-slate-400">Process list, connections, files</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => snapshotMutation.mutate()}
                  disabled={isAnyLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {actionResults.snapshot.inProgress ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      Capturing...
                    </>
                  ) : (
                    'Capture'
                  )}
                </Button>
              </div>
              {actionResults.snapshot.statusMessage && (
                <div className={`text-xs p-3 rounded mb-2 ${
                  actionResults.snapshot.inProgress 
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                    : actionResults.snapshot.success 
                      ? 'bg-green-500/10 text-green-400 border border-green-500/30' 
                      : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {actionResults.snapshot.inProgress ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : actionResults.snapshot.success ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span>
                        {actionResults.snapshot.statusMessage}
                        {actionResults.snapshot.success && actionResults.snapshot.data && (
                          <span className="ml-1">
                            ({actionResults.snapshot.data.process_count || 0} processes, {actionResults.snapshot.data.connection_count || 0} connections)
                          </span>
                        )}
                      </span>
                    </div>
                    {actionResults.snapshot.success && !actionResults.snapshot.inProgress && (
                      <Link 
                        to={createPageUrl('Devices', { highlight: deviceId })}
                        className="text-xs flex items-center gap-1 hover:underline"
                      >
                        View Details
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Triage Collection */}
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <HardDrive className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">Initiate Triage Collection</h4>
                    <p className="text-xs text-slate-400">Memory, disk, registry artifacts</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => triageMutation.mutate()}
                  disabled={isAnyLoading}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {actionResults.triage.inProgress ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      Collecting...
                    </>
                  ) : (
                    'Collect'
                  )}
                </Button>
              </div>
              {actionResults.triage.statusMessage && (
                <div className={`text-xs p-3 rounded mb-2 ${
                  actionResults.triage.inProgress 
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                    : actionResults.triage.success 
                      ? 'bg-green-500/10 text-green-400 border border-green-500/30' 
                      : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {actionResults.triage.inProgress ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : actionResults.triage.success ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span>{actionResults.triage.statusMessage}</span>
                    </div>
                    {actionResults.triage.success && !actionResults.triage.inProgress && (
                      <Link 
                        to={createPageUrl('Evidence', { device_id: deviceId })}
                        className="text-xs flex items-center gap-1 hover:underline"
                      >
                        View Evidence
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Device Management Link */}
          <div className="pt-4 border-t border-slate-800">
            <Link
              to={createPageUrl('Devices')}
              className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-white">View Device Details</p>
                <p className="text-xs text-slate-400">Monitor operation status and device health</p>
              </div>
              <ExternalLink className="w-4 h-4 text-blue-400" />
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}