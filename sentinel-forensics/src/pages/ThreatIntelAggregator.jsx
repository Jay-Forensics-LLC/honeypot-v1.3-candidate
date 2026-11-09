import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Target,
  Plus,
  GitBranch,
  Shield,
  AlertTriangle,
  Loader2,
  Database
} from 'lucide-react';
import { toast } from 'sonner';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import { analyzeThreatActors } from '../functions/analyzeThreatActors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function ThreatIntelAggregator() {
  const [manualIntelOpen, setManualIntelOpen] = useState(false);
  const [correlationDialogOpen, setCorrelationDialogOpen] = useState(false);
  const [selectedIOC, setSelectedIOC] = useState(null);
  const [newThreatIntel, setNewThreatIntel] = useState({
    threat_id: '',
    threat_type: 'malware',
    severity: 'medium',
    indicators: [],
    source: 'manual_input'
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: iocs = [] } = useQuery({
    queryKey: ['aggregated-iocs'],
    queryFn: async () => {
      try {
        return await resilientAPI.filterEntity(
          'IOCIndicator',
          { threat_classification: { $in: ['malicious', 'suspicious'] } },
          '-aggregated_threat_score',
          100,
          0,
          15000
        );
      } catch (error) {
        return [];
      }
    },
    initialData: []
  });

  const { data: aptGroups = [] } = useQuery({
    queryKey: ['apt-groups-aggregator'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('APTGroup', '-last_updated', 50, 10000);
      } catch (error) {
        return [];
      }
    },
    initialData: []
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ['active-incidents'],
    queryFn: async () => {
      try {
        return await resilientAPI.filterEntity(
          'IncidentResponse',
          { status: { $in: ['detected', 'investigating', 'contained'] } },
          '-detected_at',
          20,
          0,
          10000
        );
      } catch (error) {
        return [];
      }
    },
    initialData: []
  });

  const createThreatIntelMutation = useMutation({
    mutationFn: async () => {
      const intel = await base44.entities.ThreatIntelligence.create({
        threat_id: `THREAT-${Date.now()}`,
        ...newThreatIntel,
        shared_by: user.email,
        verified: false,
        timestamp: new Date().toISOString()
      });

      return intel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aggregated-iocs'] });
      setManualIntelOpen(false);
      setNewThreatIntel({
        threat_id: '',
        threat_type: 'malware',
        severity: 'medium',
        indicators: [],
        source: 'manual_input'
      });
      toast.success('Threat intelligence added!');
    },
    onError: (error) => {
      toast.error('Failed to add threat intel: ' + error.message);
    }
  });

  const analyzeActorsMutation = useMutation({
    mutationFn: async () => {
      const { data } = await analyzeThreatActors({
        ioc_sample: iocs.slice(0, 50).map(i => ({
          type: i.indicator_type,
          value: i.value,
          threat_score: i.aggregated_threat_score
        }))
      });

      return data;
    },
    onSuccess: (data) => {
      toast.success('Threat actor analysis completed!', {
        description: `Identified ${data.identified_actors?.length || 0} potential threat actors`
      });
    },
    onError: (error) => {
      toast.error('Analysis failed: ' + error.message);
    }
  });

  const correlateIOCMutation = useMutation({
    mutationFn: async (iocId) => {
      const ioc = iocs.find(i => i.id === iocId);
      
      // Find incidents with this IOC
      const relatedIncidents = incidents.filter(inc =>
        inc.related_evidence_ids?.some(evidenceId => evidenceId.includes(ioc.value)) ||
        inc.description?.includes(ioc.value)
      );

      // Find agents with this IOC
      const agents = await base44.entities.EndpointAgent.list('-last_heartbeat', 100);
      const relatedAgents = agents.filter(agent =>
        agent.network_summary?.suspicious_connections > 0 ||
        agent.anomalies_detected?.some(a => a.description?.includes(ioc.value))
      );

      return {
        ioc,
        related_incidents: relatedIncidents,
        related_agents: relatedAgents
      };
    },
    onSuccess: (data) => {
      setSelectedIOC(data);
      setCorrelationDialogOpen(true);
      toast.success('IOC correlation completed!');
    },
    onError: (error) => {
      toast.error('Correlation failed: ' + error.message);
    }
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Threat Intelligence Aggregator</h1>
          <p className="text-slate-400">Correlate and analyze threat intelligence from multiple sources</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => analyzeActorsMutation.mutate()}
            disabled={analyzeActorsMutation.isPending || iocs.length === 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {analyzeActorsMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Target className="w-4 h-4 mr-2" />
            )}
            Analyze Threat Actors
          </Button>
          <Button
            onClick={() => setManualIntelOpen(true)}
            className="bg-gradient-to-r from-blue-600 to-purple-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Manual Intel
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Database className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{iocs.length}</p>
                <p className="text-xs text-slate-400">Total IOCs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {iocs.filter(i => i.threat_classification === 'malicious').length}
                </p>
                <p className="text-xs text-slate-400">Malicious</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Target className="w-10 h-10 text-orange-400" />
              <div>
                <p className="text-3xl font-bold text-white">{aptGroups.length}</p>
                <p className="text-xs text-slate-400">APT Groups</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">{incidents.length}</p>
                <p className="text-xs text-slate-400">Active Incidents</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* IOC Correlation View */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-blue-400" />
            IOC Correlation & Auto-Enrichment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {iocs.slice(0, 20).map((ioc) => (
              <Card key={ioc.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Badge className={
                        ioc.threat_classification === 'malicious' ? 'bg-red-500/20 text-red-400' :
                        ioc.threat_classification === 'suspicious' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-green-500/20 text-green-400'
                      }>
                        {ioc.indicator_type}
                      </Badge>
                      <code className="text-sm text-white font-mono flex-1">{ioc.value}</code>
                      <Badge className="bg-purple-500/20 text-purple-400">
                        Score: {ioc.aggregated_threat_score || 0}/100
                      </Badge>
                      <Badge className="bg-slate-700 text-slate-300">
                        {ioc.feed_sources?.length || 0} feed(s)
                      </Badge>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => correlateIOCMutation.mutate(ioc.id)}
                      disabled={correlateIOCMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 ml-4"
                    >
                      {correlateIOCMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <GitBranch className="w-4 h-4 mr-2" />
                          Correlate
                        </>
                      )}
                    </Button>
                  </div>

                  {ioc.feed_sources && ioc.feed_sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ioc.feed_sources.map((feed, i) => (
                        <Badge key={i} className="bg-blue-500/10 text-blue-300 text-[10px]">
                          {feed.feed_name} ({feed.confidence * 100}%)
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* APT Profiles */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-orange-400" />
            Threat Actor Profiles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {aptGroups.map((apt) => (
              <Card key={apt.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">{apt.group_name}</h3>
                        <Badge className={
                          apt.threat_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                          apt.threat_level === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }>
                          {apt.threat_level}
                        </Badge>
                        <Badge className="bg-blue-500/20 text-blue-400">
                          {apt.activity_status}
                        </Badge>
                      </div>

                      {apt.aliases && apt.aliases.length > 0 && (
                        <p className="text-xs text-slate-400 mb-2">
                          Aliases: {apt.aliases.join(', ')}
                        </p>
                      )}

                      <div className="grid md:grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-slate-500">Origin:</p>
                          <p className="text-white">{apt.origin_country || 'Unknown'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Motivation:</p>
                          <p className="text-white">{apt.motivation || 'Unknown'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Linked IOCs:</p>
                          <p className="text-white">{apt.linked_iocs?.length || 0}</p>
                        </div>
                      </div>

                      {apt.target_sectors && apt.target_sectors.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-slate-500 mb-1">Target Sectors:</p>
                          <div className="flex flex-wrap gap-1">
                            {apt.target_sectors.map((sector, i) => (
                              <Badge key={i} className="bg-purple-500/20 text-purple-300 text-[10px]">
                                {sector}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Manual Intel Input Dialog */}
      <Dialog open={manualIntelOpen} onOpenChange={setManualIntelOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Add Manual Threat Intelligence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Threat ID</label>
              <Input
                value={newThreatIntel.threat_id}
                onChange={(e) => setNewThreatIntel({...newThreatIntel, threat_id: e.target.value})}
                placeholder="e.g., APT-2025-001"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-300 mb-2 block">Threat Type</label>
                <select
                  value={newThreatIntel.threat_type}
                  onChange={(e) => setNewThreatIntel({...newThreatIntel, threat_type: e.target.value})}
                  className="w-full bg-slate-800 border-slate-700 rounded px-3 py-2 text-sm"
                >
                  <option value="malware">Malware</option>
                  <option value="rootkit">Rootkit</option>
                  <option value="surveillance">Surveillance</option>
                  <option value="network_attack">Network Attack</option>
                  <option value="social_engineering">Social Engineering</option>
                  <option value="physical_threat">Physical Threat</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-300 mb-2 block">Severity</label>
                <select
                  value={newThreatIntel.severity}
                  onChange={(e) => setNewThreatIntel({...newThreatIntel, severity: e.target.value})}
                  className="w-full bg-slate-800 border-slate-700 rounded px-3 py-2 text-sm"
                >
                  <option value="info">Info</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-300 mb-2 block">Source</label>
              <Input
                value={newThreatIntel.source}
                onChange={(e) => setNewThreatIntel({...newThreatIntel, source: e.target.value})}
                placeholder="e.g., Internal investigation"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setManualIntelOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createThreatIntelMutation.mutate()}
                disabled={createThreatIntelMutation.isPending || !newThreatIntel.threat_id}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createThreatIntelMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Intelligence
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* IOC Correlation Dialog */}
      <Dialog open={correlationDialogOpen} onOpenChange={setCorrelationDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle>IOC Correlation Results</DialogTitle>
          </DialogHeader>
          
          {selectedIOC && (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded p-4">
                <p className="text-xs text-slate-400 mb-1">Indicator:</p>
                <code className="text-sm text-white font-mono">{selectedIOC.ioc.value}</code>
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">
                  Related Incidents ({selectedIOC.related_incidents.length})
                </h4>
                {selectedIOC.related_incidents.length === 0 ? (
                  <p className="text-sm text-slate-400">No related incidents found</p>
                ) : (
                  <div className="space-y-2">
                    {selectedIOC.related_incidents.map(inc => (
                      <div key={inc.id} className="bg-slate-800/50 rounded p-2 text-sm">
                        <p className="text-white">{inc.title}</p>
                        <p className="text-xs text-slate-400">{inc.incident_number}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-semibold text-white mb-2">
                  Related Agents ({selectedIOC.related_agents.length})
                </h4>
                {selectedIOC.related_agents.length === 0 ? (
                  <p className="text-sm text-slate-400">No related agents found</p>
                ) : (
                  <div className="space-y-2">
                    {selectedIOC.related_agents.map(agent => (
                      <div key={agent.id} className="bg-slate-800/50 rounded p-2 text-sm">
                        <p className="text-white">{agent.hostname}</p>
                        <p className="text-xs text-slate-400">{agent.platform}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}