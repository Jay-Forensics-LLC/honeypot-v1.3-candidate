import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Settings, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PolicyManager() {
  const [showCreate, setShowCreate] = useState(false);
  const [newPolicy, setNewPolicy] = useState({ name: '', enabled: true });
  const queryClient = useQueryClient();

  const { data: policies = [] } = useQuery({
    queryKey: ['policy-profiles'],
    queryFn: () => base44.entities.PolicyProfile.list(),
    initialData: []
  });

  const createPolicy = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      await base44.entities.PolicyProfile.create({
        organization_id: user.organization_id,
        profile_id: `POL-${Date.now()}`,
        name: newPolicy.name,
        enabled: newPolicy.enabled,
        severity_thresholds: {
          unpatched_exposure: {
            health_score_below: 40,
            risk_band: 'CRITICAL'
          },
          network_exposure: {
            min_risk_score: 60
          },
          behavioral_drift: {
            health_range_min: 30,
            health_range_max: 70
          },
          lateral_movement: {
            min_device_count: 3,
            time_window_hours: 24
          }
        },
        auto_containment_enabled: false,
        auto_containment_actions: [],
        notification_channels: []
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-profiles'] });
      toast.success('Policy profile created');
      setShowCreate(false);
      setNewPolicy({ name: '', enabled: true });
    }
  });

  const togglePolicy = useMutation({
    mutationFn: async ({ id, enabled }) => {
      await base44.entities.PolicyProfile.update(id, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-profiles'] });
    }
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Hunt Policies
          </span>
          <Button
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Policy
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showCreate && (
          <div className="p-4 bg-slate-800 rounded-lg space-y-3">
            <Input
              placeholder="Policy name"
              value={newPolicy.name}
              onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
              className="bg-slate-900 border-slate-700 text-white"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreate(false)}
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => createPolicy.mutate()}
                disabled={!newPolicy.name || createPolicy.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Create
              </Button>
            </div>
          </div>
        )}

        {policies.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No policies configured yet
          </div>
        ) : (
          <div className="space-y-2">
            {policies.map((policy) => (
              <div
                key={policy.id}
                className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Switch
                    checked={policy.enabled}
                    onCheckedChange={(enabled) => 
                      togglePolicy.mutate({ id: policy.id, enabled })
                    }
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{policy.name}</p>
                    {policy.enabled ? (
                      <Badge className="bg-green-500/20 text-green-400 text-xs mt-1">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-700 text-slate-400 text-xs mt-1">
                        Disabled
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}