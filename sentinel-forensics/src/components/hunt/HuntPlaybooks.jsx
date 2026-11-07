import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Play } from 'lucide-react';
import { toast } from 'sonner';

export default function HuntPlaybooks() {
  const queryClient = useQueryClient();

  const playbooks = [
    {
      id: 'insider-threat',
      name: 'Insider Threat Detection',
      description: 'Detect anomalous behavior patterns from privileged users',
      categories: ['behavioral_drift', 'lateral_movement'],
      severity: 'high'
    },
    {
      id: 'apt-persistence',
      name: 'APT Persistence Hunt',
      description: 'Search for advanced persistent threat indicators',
      categories: ['unpatched_exposure', 'threat_intel_match'],
      severity: 'critical'
    },
    {
      id: 'shadow-it',
      name: 'Shadow IT Discovery',
      description: 'Identify unauthorized devices and services',
      categories: ['shadow_it', 'network_exposure'],
      severity: 'medium'
    }
  ];

  const runPlaybook = useMutation({
    mutationFn: async (playbookId) => {
      const response = await base44.functions.invoke('huntEngine', { 
        scope: 'organization',
        playbook: playbookId 
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hunt-runs'] });
      queryClient.invalidateQueries({ queryKey: ['hunt-findings'] });
      toast.success('Playbook hunt completed');
    }
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-400" />
          Hunt Playbooks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {playbooks.map(playbook => (
          <div key={playbook.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <p className="text-sm font-semibold text-white mb-1">{playbook.name}</p>
                <p className="text-xs text-slate-400 mb-2">{playbook.description}</p>
                <div className="flex gap-2">
                  <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                    {playbook.severity}
                  </Badge>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => runPlaybook.mutate(playbook.id)}
                disabled={runPlaybook.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Play className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}