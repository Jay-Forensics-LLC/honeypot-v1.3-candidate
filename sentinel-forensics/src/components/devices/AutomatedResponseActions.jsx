import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  Lock,
  WifiOff,
  KeyRound,
  Ban,
  Activity,
  AlertTriangle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function AutomatedResponseActions({ device, onActionComplete }) {
  const [executing, setExecuting] = useState(null);

  const executeAction = async (actionType, actionData) => {
    setExecuting(actionType);
    try {
      await base44.functions.invoke('executeMDMAction', {
        device_id: device.id,
        action_type: actionType,
        ...actionData
      });
      
      toast.success(`Action executed: ${actionType.replace(/_/g, ' ')}`);
      if (onActionComplete) onActionComplete();
    } catch (error) {
      toast.error('Action failed', { description: error.message });
    } finally {
      setExecuting(null);
    }
  };

  const actions = [
    {
      id: 'isolate_network',
      name: 'Isolate Device',
      description: 'Disconnect device from network',
      icon: WifiOff,
      severity: 'critical',
      color: 'red',
      requiresConfirmation: true,
      disabled: device.status !== 'enrolled'
    },
    {
      id: 'revoke_credentials',
      name: 'Revoke Credentials',
      description: 'Invalidate all authentication tokens',
      icon: KeyRound,
      severity: 'high',
      color: 'orange',
      requiresConfirmation: true,
      disabled: device.status !== 'enrolled'
    },
    {
      id: 'lock_device',
      name: 'Lock Device',
      description: 'Remote lock with passcode',
      icon: Lock,
      severity: 'medium',
      color: 'yellow',
      requiresConfirmation: true,
      disabled: device.status !== 'enrolled'
    },
    {
      id: 'force_scan',
      name: 'Force Security Scan',
      description: 'Immediate threat scan',
      icon: Shield,
      severity: 'low',
      color: 'blue',
      requiresConfirmation: false,
      disabled: device.status !== 'enrolled'
    }
  ];

  const getSeverityColor = (color) => {
    const colors = {
      red: 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30',
      orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30',
      yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30',
      blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
    };
    return colors[color] || colors.blue;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          Automated Response Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {device.status !== 'enrolled' && (
          <Alert className="bg-yellow-500/10 border-yellow-500/30">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <AlertDescription className="text-yellow-300 text-sm">
              Device must be enrolled and online to execute remote actions
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            const isExecuting = executing === action.id;
            
            return (
              <div
                key={action.id}
                className={`p-4 rounded-lg border transition-all ${getSeverityColor(action.color)} ${
                  action.disabled ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Icon className="w-5 h-5 mt-0.5" />
                    <div>
                      <h4 className="font-semibold mb-1">{action.name}</h4>
                      <p className="text-xs opacity-80">{action.description}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (action.requiresConfirmation) {
                        if (confirm(`Are you sure you want to ${action.name.toLowerCase()}? This action is immediate.`)) {
                          executeAction(action.id, {});
                        }
                      } else {
                        executeAction(action.id, {});
                      }
                    }}
                    disabled={action.disabled || isExecuting}
                    className="border-current"
                  >
                    {isExecuting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Execute'
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Auto-response Rules */}
        <div className="pt-4 border-t border-slate-700">
          <h4 className="text-sm font-semibold text-white mb-3">Auto-Response Rules</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-slate-300">Auto-isolate on critical threat</span>
              </div>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                Active
              </Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-slate-300">Lock on failed auth (3+ attempts)</span>
              </div>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                Active
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}