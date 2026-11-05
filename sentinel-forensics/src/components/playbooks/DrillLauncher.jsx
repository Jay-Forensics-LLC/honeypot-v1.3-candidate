import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Loader2, TrendingUp, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function DrillLauncher() {
  const [scenarioType, setScenarioType] = useState('ransomware');
  const [selectedPlaybook, setSelectedPlaybook] = useState('');
  const navigate = useNavigate();

  const { data: playbooks = [] } = useQuery({
    queryKey: ['playbooks'],
    queryFn: () => base44.entities.IncidentPlaybook.filter({ is_active: true })
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['drill-sessions'],
    queryFn: () => base44.entities.DrillSession.filter({}, '-started_at', 10)
  });

  const launchMutation = useMutation({
    mutationFn: () => base44.functions.invoke('simulateDrill', {
      scenario_type: scenarioType,
      playbook_id: selectedPlaybook || null
    }),
    onSuccess: (response) => {
      toast.success('🎯 Drill simulation started!');
      navigate(createPageUrl(`CaseDetail/${response.data.case_id}`));
    },
    onError: () => {
      toast.error('Failed to start drill');
    }
  });

  const scenarios = [
    { value: 'ransomware', label: 'Ransomware Attack', icon: '🔒' },
    { value: 'data_breach', label: 'Data Breach', icon: '🗄️' },
    { value: 'insider_threat', label: 'Insider Threat', icon: '👤' },
    { value: 'legal_challenge', label: 'Legal Challenge (Adversarial)', icon: '⚖️' }
  ];

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border-orange-500/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-orange-400" />
            Incident Response Drills
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 mb-2 block">Select Scenario</label>
            <Select value={scenarioType} onValueChange={setScenarioType}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                {scenarios.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.icon} {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-2 block">Playbook (Optional)</label>
            <Select value={selectedPlaybook} onValueChange={setSelectedPlaybook}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="Choose playbook or proceed without" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                <SelectItem value={null}>No playbook</SelectItem>
                {playbooks.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-blue-200">
              <strong>What happens:</strong> Synthetic case with evidence, adversarial challenges via AI, 
              performance tracking, after-action report generation
            </p>
          </div>

          <Button
            onClick={() => launchMutation.mutate()}
            disabled={launchMutation.isPending}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            {launchMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Target className="w-4 h-4 mr-2" />
            )}
            Launch Drill Simulation
          </Button>
        </CardContent>
      </Card>

      {/* Recent Sessions */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            Recent Drill Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-center text-slate-400 py-6">No drill sessions yet</p>
          ) : (
            <div className="space-y-2">
              {sessions.map(session => (
                <Card key={session.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{session.session_name}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(session.started_at).toLocaleDateString()} • {session.participants?.length || 0} participants
                      </p>
                    </div>
                    <Badge className={
                      session.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                      session.status === 'in_progress' ? 'bg-blue-500/20 text-blue-300' :
                      'bg-slate-500/20 text-slate-300'
                    }>
                      {session.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}