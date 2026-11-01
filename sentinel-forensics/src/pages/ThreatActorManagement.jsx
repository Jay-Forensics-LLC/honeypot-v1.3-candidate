import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Shield, Target, Calendar, Hash } from 'lucide-react';
import { toast } from 'sonner';
import AttackMapper from '@/components/threat/AttackMapper';

export default function ThreatActorManagement() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedActor, setSelectedActor] = useState(null);
  const [formData, setFormData] = useState({
    actor_name: '',
    origin_country: '',
    motivation: 'unknown',
    sophistication: 'medium',
    threat_level: 'medium',
    aliases: '',
    ttps: []
  });

  const { data: actors = [], isLoading } = useQuery({
    queryKey: ['threat-actors'],
    queryFn: () => base44.entities.ThreatActor.list()
  });

  const createActorMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('manageThreatActors', {
        operation: 'create',
        data: {
          ...data,
          aliases: data.aliases ? data.aliases.split(',').map(a => a.trim()) : []
        }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threat-actors'] });
      setShowDialog(false);
      setFormData({ actor_name: '', origin_country: '', motivation: 'unknown', sophistication: 'medium', threat_level: 'medium', aliases: '', ttps: [] });
      toast.success('Threat actor created');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create actor');
    }
  });

  const getThreatColor = (level) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/50',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/50'
    };
    return colors[level] || colors.medium;
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Threat Actor Intelligence</h1>
            <p className="text-slate-400">Track APT groups, campaigns, and TTPs</p>
          </div>
          <Button onClick={() => setShowDialog(true)} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Actor
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {actors.map(actor => (
            <Card key={actor.id} className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Users className="w-5 h-5 text-red-400" />
                      {actor.actor_name}
                    </CardTitle>
                    {actor.aliases && actor.aliases.length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">
                        aka: {actor.aliases.join(', ')}
                      </p>
                    )}
                  </div>
                  <Badge className={getThreatColor(actor.threat_level)}>
                    {actor.threat_level}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Origin</p>
                    <p className="text-white">{actor.origin_country || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Sophistication</p>
                    <Badge variant="outline">{actor.sophistication}</Badge>
                  </div>
                  <div>
                    <p className="text-slate-500">Motivation</p>
                    <p className="text-white text-xs">{actor.motivation?.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Confidence</p>
                    <p className="text-white">{actor.confidence_score}%</p>
                  </div>
                </div>

                {actor.campaigns && actor.campaigns.length > 0 && (
                  <div>
                    <p className="text-slate-500 text-xs mb-2">Campaigns</p>
                    <div className="space-y-1">
                      {actor.campaigns.map((campaign, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <Target className="w-3 h-3 text-red-400" />
                          <span className="text-white">{campaign.name}</span>
                          {campaign.start_date && (
                            <span className="text-slate-500">({new Date(campaign.start_date).getFullYear()})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {actor.ttps && actor.ttps.length > 0 && (
                  <div>
                    <p className="text-slate-500 text-xs mb-2">ATT&CK TTPs ({actor.ttps.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {actor.ttps.slice(0, 5).map((ttp, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {ttp.technique_id}
                        </Badge>
                      ))}
                      {actor.ttps.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{actor.ttps.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedActor(actor)}
                  >
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {actors.length === 0 && !isLoading && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No threat actors tracked</p>
            </CardContent>
          </Card>
        )}

        {/* Create Actor Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Add Threat Actor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-400">Actor Name</Label>
                  <Input
                    value={formData.actor_name}
                    onChange={(e) => setFormData({ ...formData, actor_name: e.target.value })}
                    placeholder="e.g., APT28, Lazarus Group"
                    className="bg-slate-800 border-slate-700 text-white mt-2"
                  />
                </div>
                <div>
                  <Label className="text-slate-400">Origin Country</Label>
                  <Input
                    value={formData.origin_country}
                    onChange={(e) => setFormData({ ...formData, origin_country: e.target.value })}
                    placeholder="e.g., Russia, China"
                    className="bg-slate-800 border-slate-700 text-white mt-2"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-400">Aliases (comma-separated)</Label>
                <Input
                  value={formData.aliases}
                  onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                  placeholder="e.g., Fancy Bear, Sofacy"
                  className="bg-slate-800 border-slate-700 text-white mt-2"
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-400">Motivation</Label>
                  <Select value={formData.motivation} onValueChange={(v) => setFormData({ ...formData, motivation: v })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cyber_espionage">Cyber Espionage</SelectItem>
                      <SelectItem value="financial_gain">Financial Gain</SelectItem>
                      <SelectItem value="hacktivism">Hacktivism</SelectItem>
                      <SelectItem value="cyber_warfare">Cyber Warfare</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-400">Sophistication</Label>
                  <Select value={formData.sophistication} onValueChange={(v) => setFormData({ ...formData, sophistication: v })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-400">Threat Level</Label>
                  <Select value={formData.threat_level} onValueChange={(v) => setFormData({ ...formData, threat_level: v })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={() => createActorMutation.mutate(formData)}
                disabled={!formData.actor_name || !formData.threat_level || createActorMutation.isPending}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                Create Threat Actor
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Actor Detail Dialog */}
        <Dialog open={!!selectedActor} onOpenChange={() => setSelectedActor(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">{selectedActor?.actor_name}</DialogTitle>
            </DialogHeader>
            {selectedActor && (
              <div className="space-y-4 py-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4 space-y-2">
                      <div>
                        <p className="text-slate-500 text-xs">Origin</p>
                        <p className="text-white">{selectedActor.origin_country || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Motivation</p>
                        <p className="text-white">{selectedActor.motivation?.replace(/_/g, ' ')}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Sophistication</p>
                        <Badge>{selectedActor.sophistication}</Badge>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Attribution Confidence</p>
                        <p className="text-white">{selectedActor.confidence_score}%</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4 space-y-2">
                      <div>
                        <p className="text-slate-500 text-xs">Linked IOCs</p>
                        <p className="text-white font-semibold">{selectedActor.associated_iocs?.length || 0}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Active Campaigns</p>
                        <p className="text-white font-semibold">{selectedActor.campaigns?.length || 0}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Mapped TTPs</p>
                        <p className="text-white font-semibold">{selectedActor.ttps?.length || 0}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {selectedActor.campaigns && selectedActor.campaigns.length > 0 && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white text-sm flex items-center gap-2">
                        <Target className="w-4 h-4 text-red-400" />
                        Campaigns
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedActor.campaigns.map((campaign, idx) => (
                        <div key={idx} className="bg-slate-900/50 rounded p-3">
                          <p className="text-white font-semibold">{campaign.name}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>{campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : 'Unknown'}</span>
                            </div>
                            {campaign.targets && campaign.targets.length > 0 && (
                              <div>
                                Targets: {campaign.targets.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {selectedActor.ttps && selectedActor.ttps.length > 0 && (
                  <AttackMapper ttps={selectedActor.ttps} />
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}