import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function ScheduledHunts() {
  const [showCreate, setShowCreate] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ interval: 'daily', enabled: true });
  const queryClient = useQueryClient();

  const { data: policies = [] } = useQuery({
    queryKey: ['policy-profiles'],
    queryFn: () => base44.entities.PolicyProfile.list(),
    initialData: []
  });

  const updateSchedule = useMutation({
    mutationFn: async ({ policyId, schedule }) => {
      await base44.entities.PolicyProfile.update(policyId, { schedule });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-profiles'] });
      toast.success('Schedule updated');
    }
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Scheduled Hunts
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {policies.map(policy => (
          <div key={policy.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white">{policy.name}</p>
              <Switch
                checked={policy.schedule?.enabled || false}
                onCheckedChange={(enabled) => 
                  updateSchedule.mutate({ 
                    policyId: policy.id, 
                    schedule: { ...policy.schedule, enabled } 
                  })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                {policy.schedule?.cron || 'Daily at midnight'}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}