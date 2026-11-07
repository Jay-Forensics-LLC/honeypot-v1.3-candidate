import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Power, Shield, RefreshCw, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function RemoteActionsPanel({ device }) {
  const [actionStatus, setActionStatus] = useState({});
  const queryClient = useQueryClient();

  const executeActionMutation = useMutation({
    mutationFn: async ({ action, deviceId }) => {
      const response = await base44.functions.invoke('executeRemoteDeviceAction', {
        device_id: deviceId,
        action: action
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      setActionStatus({ success: true, message: data.message });
      queryClient.invalidateQueries({ queryKey: ['org-query', 'Device'] });
      toast.success('Action completed', {
        description: data.message
      });
    },
    onError: (error, variables) => {
      setActionStatus({ success: false, message: error.message });
      toast.error('Action failed', {
        description: error.message
      });
    }
  });

  const handleAction = (action) => {
    setActionStatus({ inProgress: true, action });
    executeActionMutation.mutate({ action, deviceId: device.device_id });
  };

  const actions = [
    {
      id: 'reboot',
      name: 'Reboot Device',
      description: 'Safely restart the device',
      icon: Power,
      color: 'blue',
      dangerous: false
    },
    {
      id: 'security_scan',
      name: 'Run Security Scan',
      description: 'Full malware and vulnerability scan',
      icon: Shield,
      color: 'green',
      dangerous: false
    },
    {
      id: 'update_agent',
      name: 'Update Agent',
      description: 'Update to latest agent version',
      icon: RefreshCw,
      color: 'purple',
      dangerous: false
    }
  ];

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Power className="w-4 h-4 text-orange-400" />
          Remote Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {device.status !== 'enrolled' && (
          <Alert className="bg-yellow-900/20 border-yellow-500/30">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-200 text-xs">
              Device must be enrolled to execute remote actions
            </AlertDescription>
          </Alert>
        )}

        {actionStatus.inProgress && (
          <Alert className="bg-blue-900/20 border-blue-500/30">
            <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
            <AlertDescription className="text-blue-200 text-xs">
              Executing {actionStatus.action}...
            </AlertDescription>
          </Alert>
        )}

        {actionStatus.success !== undefined && !actionStatus.inProgress && (
          <Alert className={actionStatus.success ? 'bg-green-900/20 border-green-500/30' : 'bg-red-900/20 border-red-500/30'}>
            {actionStatus.success ? (
              <CheckCircle className="h-4 w-4 text-green-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-400" />
            )}
            <AlertDescription className={actionStatus.success ? 'text-green-200 text-xs' : 'text-red-200 text-xs'}>
              {actionStatus.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          {actions.map(action => {
            const Icon = action.icon;
            return (
              <div key={action.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 text-${action.color}-400`} />
                    <div>
                      <p className="text-sm font-medium text-white">{action.name}</p>
                      <p className="text-xs text-slate-400">{action.description}</p>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAction(action.id)}
                  disabled={device.status !== 'enrolled' || executeActionMutation.isPending}
                  className={`w-full bg-${action.color}-600 hover:bg-${action.color}-700`}
                >
                  {executeActionMutation.isPending && actionStatus.action === action.id ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    `Execute ${action.name}`
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}