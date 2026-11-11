import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Play, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ContainmentCenter({ findingId, actions, onClose }) {
  const [selectedActions, setSelectedActions] = useState([]);
  const queryClient = useQueryClient();

  const executeAction = useMutation({
    mutationFn: async (actionType) => {
      const action = await base44.entities.ContainmentAction.create({
        organization_id: (await base44.auth.me()).organization_id,
        action_id: `ACT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        finding_id: findingId,
        action_type: actionType,
        status: 'pending_approval',
        requested_by: (await base44.auth.me()).email
      });
      return action;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containment-actions'] });
      toast.success('Containment action queued for approval');
    }
  });

  const approveAction = useMutation({
    mutationFn: async (actionId) => {
      await base44.entities.ContainmentAction.update(actionId, {
        status: 'approved',
        approved_by: (await base44.auth.me()).email,
        executed_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containment-actions'] });
      toast.success('Action approved and executed');
    }
  });

  const actionTypes = [
    { id: 'isolate_device', label: 'Isolate Device', icon: Shield, color: 'red', risk: 'high' },
    { id: 'disable_service', label: 'Disable Service', icon: X, color: 'orange', risk: 'medium' },
    { id: 'quarantine', label: 'Quarantine Files', icon: AlertTriangle, color: 'yellow', risk: 'medium' },
    { id: 'force_password_reset', label: 'Force Password Reset', icon: Shield, color: 'blue', risk: 'low' },
    { id: 'increase_monitoring', label: 'Increase Monitoring', icon: Shield, color: 'green', risk: 'low' },
    { id: 'create_ticket', label: 'Create Ticket', icon: Check, color: 'slate', risk: 'low' }
  ];

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'high': return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'medium': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      case 'low': return 'text-green-400 bg-green-500/10 border-green-500/30';
      default: return 'text-slate-400 bg-slate-700';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-400" />
          Containment Center
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-300">
            ⚠️ All containment actions require approval before execution and are fully audited.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {actionTypes.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => executeAction.mutate(action.id)}
                disabled={executeAction.isPending}
                className={`p-4 rounded-lg border-2 text-left transition-all hover:scale-[1.02] ${
                  getRiskColor(action.risk)
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className="w-5 h-5" />
                  <Badge className="text-xs">
                    {action.risk} risk
                  </Badge>
                </div>
                <p className="text-sm font-semibold text-white">{action.label}</p>
              </button>
            );
          })}
        </div>

        {executeAction.isPending && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Queueing action...
          </div>
        )}
      </CardContent>
    </Card>
  );
}