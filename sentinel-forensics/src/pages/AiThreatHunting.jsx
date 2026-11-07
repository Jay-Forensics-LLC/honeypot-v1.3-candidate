import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Target,
  Zap,
  Brain,
  Shield,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Eye,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { runAiThreatHunt } from '../functions/runAiThreatHunt';

export default function AiThreatHunting() {
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('new');
  const queryClient = useQueryClient();

  const { data: findings = [], isLoading } = useQuery({
    queryKey: ['ai-findings', categoryFilter, statusFilter],
    queryFn: async () => {
      const query = {};
      
      if (categoryFilter !== 'all') {
        query.category = categoryFilter;
      }
      
      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }

      return await base44.entities.AiThreatFinding.filter(query, '-suspicion_score', 100);
    },
    staleTime: 30000
  });

  const runHuntMutation = useMutation({
    mutationFn: async (hours = 24) => {
      const response = await runAiThreatHunt({ time_range_hours: hours });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-findings'] });
      toast.success('AI Threat Hunt Complete', {
        description: `Analyzed ${data.events_analyzed} events, created ${data.findings_created} findings`
      });
    },
    onError: (error) => {
      toast.error('Hunt failed', { description: error.message });
    }
  });

  const updateFindingMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      return await base44.entities.AiThreatFinding.update(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-findings'] });
      toast.success('Finding updated');
    }
  });

  const stats = {
    total: findings.length,
    highRisk: findings.filter(f => f.suspicion_score >= 70).length,
    new: findings.filter(f => f.status === 'new').length,
    avgScore: findings.length > 0 
      ? Math.round(findings.reduce((sum, f) => sum + f.suspicion_score, 0) / findings.length)
      : 0
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Brain className="w-8 h-8 text-purple-400" />
              AI Threat Hunting
            </h1>
            <p className="text-slate-400">Pattern-based detection and anomaly analysis</p>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={() => runHuntMutation.mutate(24)}
              disabled={runHuntMutation.isPending}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 min-h-[44px]"
            >
              {runHuntMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Hunting...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Run AI Hunt (24h)
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Target className="w-10 h-10 text-blue-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{stats.total}</p>
                  <p className="text-xs text-slate-400">Total Findings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{stats.highRisk}</p>
                  <p className="text-xs text-slate-400">High Risk (≥70)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Brain className="w-10 h-10 text-purple-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{stats.new}</p>
                  <p className="text-xs text-slate-400">Awaiting Triage</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Shield className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{stats.avgScore}</p>
                  <p className="text-xs text-slate-400">Avg Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-56 bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-white">
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="anomaly">Anomaly</SelectItem>
              <SelectItem value="lateral_movement">Lateral Movement</SelectItem>
              <SelectItem value="credential_access">Credential Access</SelectItem>
              <SelectItem value="exfiltration">Data Exfiltration</SelectItem>
              <SelectItem value="persistence">Persistence</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-white">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="triaged">Triaged</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {findings.map(finding => (
            <Card key={finding.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={
                        finding.suspicion_score >= 80 ? 'bg-red-500/20 text-red-400' :
                        finding.suspicion_score >= 60 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }>
                        Score: {finding.suspicion_score}
                      </Badge>
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {finding.category}
                      </Badge>
                      <Badge className={
                        finding.status === 'new' ? 'bg-orange-500/20 text-orange-400' :
                        finding.status === 'triaged' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-slate-500/20 text-slate-400'
                      }>
                        {finding.status}
                      </Badge>
                    </div>

                    <h4 className="font-semibold text-white mb-1">{finding.summary}</h4>
                    
                    {finding.mitre_mapping && (
                      <div className="text-xs text-slate-400 mb-2">
                        MITRE ATT&CK: {finding.mitre_mapping.tactic_name} → {finding.mitre_mapping.technique_name}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{finding.related_event_ids?.length || 0} events</span>
                      <span>{finding.related_device_ids?.length || 0} devices</span>
                      <span>{new Date(finding.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedFinding(finding);
                      setDetailOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Threat Finding Details</DialogTitle>
            </DialogHeader>

            {selectedFinding && (
              <div className="space-y-4 mt-4">
                <div>
                  <p className="text-sm text-slate-400 mb-2">Summary</p>
                  <p className="text-white">{selectedFinding.summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Suspicion Score</p>
                    <p className="text-2xl font-bold text-white">{selectedFinding.suspicion_score}/100</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Category</p>
                    <Badge className="bg-purple-500/20 text-purple-400">
                      {selectedFinding.category}
                    </Badge>
                  </div>
                </div>

                {selectedFinding.mitre_mapping && (
                  <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                    <p className="text-sm font-semibold text-white mb-2">MITRE ATT&CK Mapping</p>
                    <div className="space-y-1 text-sm">
                      <p className="text-blue-300">
                        <strong>Tactic:</strong> {selectedFinding.mitre_mapping.tactic_name} ({selectedFinding.mitre_mapping.tactic})
                      </p>
                      <p className="text-blue-300">
                        <strong>Technique:</strong> {selectedFinding.mitre_mapping.technique_name} ({selectedFinding.mitre_mapping.technique})
                      </p>
                    </div>
                  </div>
                )}

                {selectedFinding.hypotheses && selectedFinding.hypotheses.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-white mb-3">Investigation Hypotheses</p>
                    <div className="space-y-2">
                      {selectedFinding.hypotheses.map((hyp, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
                          <input
                            type="checkbox"
                            checked={hyp.completed}
                            onChange={(e) => {
                              const updated = [...selectedFinding.hypotheses];
                              updated[idx].completed = e.target.checked;
                              updateFindingMutation.mutate({
                                id: selectedFinding.id,
                                updates: { hypotheses: updated }
                              });
                            }}
                            className="mt-1 min-h-[20px] min-w-[20px]"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm text-white">{hyp.hypothesis}</p>
                              <Badge className={
                                hyp.priority === 'critical' ? 'bg-red-500/20 text-red-400 text-[10px]' :
                                hyp.priority === 'high' ? 'bg-orange-500/20 text-orange-400 text-[10px]' :
                                'bg-yellow-500/20 text-yellow-400 text-[10px]'
                              }>
                                {hyp.priority}
                              </Badge>
                            </div>
                            {hyp.notes && (
                              <p className="text-xs text-slate-400">{hyp.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={() => updateFindingMutation.mutate({
                      id: selectedFinding.id,
                      updates: { status: 'triaged' }
                    })}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark as Triaged
                  </Button>
                  <Button
                    onClick={() => updateFindingMutation.mutate({
                      id: selectedFinding.id,
                      updates: { status: 'dismissed' }
                    })}
                    variant="outline"
                    className="flex-1 border-slate-700 text-white"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}