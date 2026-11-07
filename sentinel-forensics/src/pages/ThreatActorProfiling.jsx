import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  Target,
  Globe,
  AlertTriangle,
  Activity,
  Database,
  Eye,
  Loader2,
  Play,
  MapPin
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { analyzeThreatActors } from '../functions/analyzeThreatActors';

export default function ThreatActorProfiling() {
  const [selectedActor, setSelectedActor] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: actors = [], isLoading } = useQuery({
    queryKey: ['apt-groups'],
    queryFn: async () => {
      try {
        return await base44.entities.APTGroup.list('-confidence_score', 50);
      } catch (error) {
        console.warn('Failed to load threat actors:', error);
        return [];
      }
    },
    initialData: []
  });

  const { data: iocs = [] } = useQuery({
    queryKey: ['threat-iocs'],
    queryFn: async () => {
      try {
        return await base44.entities.IOCIndicator.filter(
          { extraction_method: 'threat_feed' },
          '-aggregated_threat_score',
          100
        );
      } catch (error) {
        return [];
      }
    },
    initialData: []
  });

  const runAnalysisMutation = useMutation({
    mutationFn: async () => {
      setIsAnalyzing(true);
      const { data } = await analyzeThreatActors({ analyze_all: true });
      return data;
    },
    onSuccess: (data) => {
      setIsAnalyzing(false);
      queryClient.invalidateQueries({ queryKey: ['apt-groups'] });
      
      toast.success('Threat Actor Analysis Complete!', {
        description: `${data.threat_actors_detected} actors detected, ${data.profiles_created?.length || 0} new profiles created`,
        duration: 5000
      });
    },
    onError: (error) => {
      setIsAnalyzing(false);
      toast.error('Analysis failed: ' + error.message);
    }
  });

  const criticalActors = actors.filter(a => a.threat_level === 'critical').length;
  const activeActors = actors.filter(a => a.activity_status === 'active').length;
  const highConfidence = actors.filter(a => a.confidence_score >= 80).length;
  const totalIOCs = actors.reduce((sum, a) => sum + (a.linked_iocs?.length || 0), 0);

  const getThreatLevelColor = (level) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/50',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      low: 'bg-green-500/20 text-green-400 border-green-500/50'
    };
    return colors[level] || colors.medium;
  };

  const getActivityColor = (status) => {
    const colors = {
      active: 'bg-red-500/20 text-red-400',
      evolving: 'bg-orange-500/20 text-orange-400',
      dormant: 'bg-yellow-500/20 text-yellow-400',
      retired: 'bg-gray-500/20 text-gray-400'
    };
    return colors[status] || colors.active;
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              🎯 Threat Actor Profiling
            </h1>
            <p className="text-slate-400">
              APT group identification, TTP analysis, and attribution intelligence
            </p>
          </div>
          <Button
            onClick={() => runAnalysisMutation.mutate()}
            disabled={isAnalyzing}
            className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 min-h-[44px]"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Analysis
              </>
            )}
          </Button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Target className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{actors.length}</p>
                  <p className="text-xs text-slate-400">Threat Actors</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-10 h-10 text-orange-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{criticalActors}</p>
                  <p className="text-xs text-slate-400">Critical Threats</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Activity className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{activeActors}</p>
                  <p className="text-xs text-slate-400">Active Groups</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Database className="w-10 h-10 text-purple-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{totalIOCs}</p>
                  <p className="text-xs text-slate-400">Linked IOCs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Threat Actor Profiles */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Identified Threat Actors</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
                <p className="text-slate-400">Loading threat actor profiles...</p>
              </div>
            ) : actors.length === 0 ? (
              <div className="text-center py-12">
                <Target className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400 mb-4">No threat actors profiled yet</p>
                <p className="text-sm text-slate-500 mb-4">
                  Run analysis to identify threat actors from your IOC data
                </p>
                <Button
                  onClick={() => runAnalysisMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700 min-h-[44px]"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Run First Analysis
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {actors.map((actor) => (
                  <Card
                    key={actor.id}
                    className={`bg-slate-800/50 border transition-all cursor-pointer hover:border-red-500/50 ${
                      actor.threat_level === 'critical' ? 'border-red-500/30' :
                      actor.threat_level === 'high' ? 'border-orange-500/30' :
                      'border-slate-700'
                    }`}
                    onClick={() => setSelectedActor(actor)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            actor.threat_level === 'critical' ? 'bg-red-500/20' :
                            actor.threat_level === 'high' ? 'bg-orange-500/20' :
                            'bg-yellow-500/20'
                          }`}>
                            <Target className={`w-6 h-6 ${
                              actor.threat_level === 'critical' ? 'text-red-400' :
                              actor.threat_level === 'high' ? 'text-orange-400' :
                              'text-yellow-400'
                            }`} />
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="font-bold text-white text-lg">{actor.group_name}</h3>
                              <Badge className={getThreatLevelColor(actor.threat_level)}>
                                {actor.threat_level?.toUpperCase()}
                              </Badge>
                              <Badge className={getActivityColor(actor.activity_status)}>
                                {actor.activity_status?.toUpperCase()}
                              </Badge>
                            </div>

                            {actor.aliases && actor.aliases.length > 0 && (
                              <p className="text-xs text-slate-400 mb-2">
                                Also known as: {actor.aliases.join(', ')}
                              </p>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                              <div>
                                <p className="text-xs text-slate-500">Origin</p>
                                <p className="text-sm text-white flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {actor.origin_country || 'Unknown'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Motivation</p>
                                <p className="text-sm text-white capitalize">
                                  {actor.motivation?.replace(/_/g, ' ') || 'Unknown'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Confidence</p>
                                <p className="text-sm font-bold text-green-400">
                                  {actor.confidence_score || 0}%
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Linked IOCs</p>
                                <p className="text-sm text-white">
                                  {actor.linked_iocs?.length || 0}
                                </p>
                              </div>
                            </div>

                            {actor.target_sectors && actor.target_sectors.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-slate-500">Targets:</span>
                                {actor.target_sectors.slice(0, 4).map((sector, idx) => (
                                  <Badge key={idx} className="bg-blue-500/20 text-blue-400 text-xs">
                                    {sector}
                                  </Badge>
                                ))}
                                {actor.target_sectors.length > 4 && (
                                  <Badge className="bg-slate-700 text-slate-400 text-xs">
                                    +{actor.target_sectors.length - 4} more
                                  </Badge>
                                )}
                              </div>
                            )}

                            {actor.mitre_attack_mapping?.techniques && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs text-slate-500">TTPs:</span>
                                <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                                  {actor.mitre_attack_mapping.techniques.length} techniques
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>

                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedActor(actor);
                          }}
                          size="sm"
                          variant="outline"
                          className="border-slate-700 min-h-[44px]"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actor Details Dialog */}
        {selectedActor && (
          <Dialog open={selectedActor !== null} onOpenChange={() => setSelectedActor(null)}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-2xl">
                  <Target className="w-6 h-6 text-red-400" />
                  {selectedActor.group_name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* Header Info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={getThreatLevelColor(selectedActor.threat_level)}>
                    Threat: {selectedActor.threat_level?.toUpperCase()}
                  </Badge>
                  <Badge className={getActivityColor(selectedActor.activity_status)}>
                    Status: {selectedActor.activity_status?.toUpperCase()}
                  </Badge>
                  <Badge className="bg-slate-700 text-slate-300">
                    Confidence: {selectedActor.confidence_score || 0}%
                  </Badge>
                </div>

                {/* Basic Information */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Aliases</p>
                    <p className="text-white">
                      {selectedActor.aliases?.join(', ') || 'None'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Origin</p>
                    <p className="text-white flex items-center gap-1">
                      <Globe className="w-4 h-4" />
                      {selectedActor.origin_country || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">First Observed</p>
                    <p className="text-white">
                      {selectedActor.first_observed ? new Date(selectedActor.first_observed).getFullYear() : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Motivation</p>
                    <p className="text-white capitalize">
                      {selectedActor.motivation?.replace(/_/g, ' ') || 'Unknown'}
                    </p>
                  </div>
                </div>

                {/* Target Sectors */}
                {selectedActor.target_sectors && selectedActor.target_sectors.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Targeted Sectors</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedActor.target_sectors.map((sector, idx) => (
                        <Badge key={idx} className="bg-blue-500/20 text-blue-400">
                          {sector}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target Regions */}
                {selectedActor.target_regions && selectedActor.target_regions.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Targeted Regions</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedActor.target_regions.map((region, idx) => (
                        <Badge key={idx} className="bg-purple-500/20 text-purple-400">
                          <MapPin className="w-3 h-3 mr-1" />
                          {region}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* TTPs (Tactics, Techniques, Procedures) */}
                {selectedActor.ttps && (
                  <div>
                    <p className="text-sm text-slate-400 mb-3">TTPs - Tactics, Techniques, and Procedures</p>
                    <div className="space-y-3">
                      {Object.entries(selectedActor.ttps).map(([tactic, techniques]) => {
                        if (!techniques || techniques.length === 0) return null;
                        return (
                          <div key={tactic} className="bg-slate-800/50 p-3 rounded-lg">
                            <p className="text-sm font-semibold text-white capitalize mb-2">
                              {tactic.replace(/_/g, ' ')}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {techniques.map((tech, idx) => (
                                <Badge key={idx} className="bg-red-500/20 text-red-400 text-xs">
                                  {tech}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MITRE ATT&CK Mapping */}
                {selectedActor.mitre_attack_mapping && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">MITRE ATT&CK Mapping</p>
                    <div className="grid md:grid-cols-2 gap-3">
                      {selectedActor.mitre_attack_mapping.techniques && (
                        <div className="bg-slate-800/50 p-3 rounded-lg">
                          <p className="text-xs text-slate-500 mb-2">Techniques</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedActor.mitre_attack_mapping.techniques.map((tech, idx) => (
                              <Badge key={idx} className="bg-orange-500/20 text-orange-400 text-xs">
                                {tech}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedActor.mitre_attack_mapping.tactics && (
                        <div className="bg-slate-800/50 p-3 rounded-lg">
                          <p className="text-xs text-slate-500 mb-2">Tactics</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedActor.mitre_attack_mapping.tactics.map((tactic, idx) => (
                              <Badge key={idx} className="bg-yellow-500/20 text-yellow-400 text-xs">
                                {tactic}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Infrastructure */}
                {selectedActor.infrastructure && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Known Infrastructure</p>
                    <div className="grid md:grid-cols-2 gap-3">
                      {selectedActor.infrastructure.known_ips && selectedActor.infrastructure.known_ips.length > 0 && (
                        <div className="bg-slate-800/50 p-3 rounded-lg">
                          <p className="text-xs text-slate-500 mb-2">IP Addresses ({selectedActor.infrastructure.known_ips.length})</p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {selectedActor.infrastructure.known_ips.slice(0, 5).map((ip, idx) => (
                              <code key={idx} className="text-xs text-blue-400 block">
                                {ip}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedActor.infrastructure.known_domains && selectedActor.infrastructure.known_domains.length > 0 && (
                        <div className="bg-slate-800/50 p-3 rounded-lg">
                          <p className="text-xs text-slate-500 mb-2">Domains ({selectedActor.infrastructure.known_domains.length})</p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {selectedActor.infrastructure.known_domains.slice(0, 5).map((domain, idx) => (
                              <code key={idx} className="text-xs text-purple-400 block">
                                {domain}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Behavioral Profile */}
                {selectedActor.behavioral_profile && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Behavioral Profile</p>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="bg-slate-800/50 p-3 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">Sophistication</p>
                        <Badge className="bg-red-500/20 text-red-400">
                          {selectedActor.behavioral_profile.sophistication_level?.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">Resource Level</p>
                        <Badge className="bg-orange-500/20 text-orange-400">
                          {selectedActor.behavioral_profile.resource_level?.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">Stealth Capability</p>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={selectedActor.behavioral_profile.stealth_capability || 0}
                            className="flex-1 h-2"
                          />
                          <span className="text-white text-sm font-bold">
                            {selectedActor.behavioral_profile.stealth_capability || 0}%
                          </span>
                        </div>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">Attack Duration</p>
                        <p className="text-sm text-white">
                          {selectedActor.behavioral_profile.typical_attack_duration || 'Unknown'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Campaigns */}
                {selectedActor.recent_campaigns && selectedActor.recent_campaigns.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Recent Campaigns</p>
                    <div className="space-y-2">
                      {selectedActor.recent_campaigns.map((campaign, idx) => (
                        <div key={idx} className="bg-slate-800/50 p-3 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-semibold text-white text-sm">{campaign.campaign_name}</p>
                              <p className="text-xs text-slate-400 mt-1">
                                Detected: {campaign.date_detected}
                              </p>
                              {campaign.targets && campaign.targets.length > 0 && (
                                <p className="text-xs text-slate-400 mt-1">
                                  Targets: {campaign.targets.join(', ')}
                                </p>
                              )}
                            </div>
                            <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                              {(campaign.attribution_confidence * 100).toFixed(0)}% conf
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Countermeasures */}
                {selectedActor.countermeasures && selectedActor.countermeasures.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Recommended Countermeasures</p>
                    <div className="space-y-2">
                      {selectedActor.countermeasures.map((measure, idx) => (
                        <div key={idx} className="bg-green-500/10 border border-green-500/30 p-3 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-semibold text-white text-sm">{measure.countermeasure_type}</p>
                              <p className="text-xs text-slate-400 mt-1">{measure.description}</p>
                              {measure.implementation_notes && (
                                <p className="text-xs text-green-400 mt-1">
                                  💡 {measure.implementation_notes}
                                </p>
                              )}
                            </div>
                            <Badge className={
                              measure.effectiveness === 'high' ? 'bg-green-500/20 text-green-400' :
                              measure.effectiveness === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }>
                              {measure.effectiveness} effectiveness
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => setSelectedActor(null)}
                  className="w-full bg-slate-700 hover:bg-slate-600 min-h-[44px]"
                >
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* How It Works */}
        <Card className="bg-blue-900/20 border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              Threat Actor Profiling Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-blue-200">
            <p><strong>Automated threat actor attribution through:</strong></p>
            <ol className="list-decimal ml-5 space-y-2">
              <li>
                <strong>IOC Pattern Analysis:</strong> Correlate indicators from multiple feeds to known actor infrastructure
              </li>
              <li>
                <strong>TTP Identification:</strong> Map observed techniques to MITRE ATT&CK framework
              </li>
              <li>
                <strong>Behavioral Profiling:</strong> Analyze attack patterns, sophistication, resource levels
              </li>
              <li>
                <strong>Attribution Scoring:</strong> Calculate confidence based on IOC + TTP matches
              </li>
              <li>
                <strong>Actor Correlation:</strong> Link indicators to known APT groups (APT28, APT29, Lazarus, etc.)
              </li>
              <li>
                <strong>Profile Updates:</strong> Continuously refine profiles as new intelligence arrives
              </li>
            </ol>

            <Alert className="bg-yellow-500/10 border-yellow-500/30 mt-4">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-300 text-xs">
                <strong>Attribution Confidence:</strong> Profiles are created when confidence score ≥75%. 
                Low-confidence correlations are logged but not profiled to prevent false attribution.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}