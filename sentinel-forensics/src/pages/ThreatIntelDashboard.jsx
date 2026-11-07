import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Globe,
  Target,
  AlertTriangle,
  Network,
  Shield,
  Zap,
  Database,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import ThreatActorTimeline from '../components/threat/ThreatActorTimeline';
import CampaignAnalysisChart from '../components/threat/CampaignAnalysisChart';
import IOCCorrelationGraph from '../components/threat/IOCCorrelationGraph';
import { ingestOTXFeed } from '@/functions/ingestOTXFeed';
import { correlateIntelWithEvents } from '@/functions/correlateIntelWithEvents';

export default function ThreatIntelDashboard() {
  const [correlating, setCorrelating] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: iocs = [] } = useQuery({
    queryKey: ['iocs'],
    queryFn: () => base44.entities.IOCIndicator.list('-updated_date', 100)
  });

  const { data: aptGroups = [] } = useQuery({
    queryKey: ['apt-groups'],
    queryFn: () => base44.entities.APTGroup.list()
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => base44.entities.ThreatCampaign.list('-last_observed', 20)
  });

  const { data: correlations = [] } = useQuery({
    queryKey: ['correlations'],
    queryFn: () => base44.entities.ThreatIntelCorrelation.list('-correlated_at', 50)
  });

  const ingestOTXMutation = useMutation({
    mutationFn: async () => {
      const response = await ingestOTXFeed({
        feed_type: 'pulses',
        query_params: { subscribed: false }
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('OTX Feed Ingested', {
        description: `${data.iocs_ingested} IOCs, ${data.campaigns_created} campaigns`
      });
      queryClient.invalidateQueries({ queryKey: ['iocs'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error) => {
      toast.error('OTX Ingestion Failed', { description: error.message });
    }
  });

  const runCorrelationMutation = useMutation({
    mutationFn: async () => {
      const response = await correlateIntelWithEvents({});
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Correlation Complete', {
        description: `${data.correlations_found} correlations, ${data.incidents_created} incidents`
      });
      queryClient.invalidateQueries({ queryKey: ['correlations'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error) => {
      toast.error('Correlation Failed', { description: error.message });
    }
  });

  const stats = {
    total_iocs: iocs.length,
    malicious_iocs: iocs.filter(i => i.threat_classification === 'malicious').length,
    active_campaigns: campaigns.filter(c => c.campaign_status === 'active').length,
    apt_groups_tracked: aptGroups.length,
    recent_correlations: correlations.filter(c => 
      new Date(c.correlated_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length
  };

  const activeCampaigns = campaigns.filter(c => c.campaign_status === 'active');
  const highConfidenceCorrelations = correlations.filter(c => c.confidence_score >= 70);

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Globe className="w-8 h-8 text-blue-400" />
              Threat Intelligence Hub
            </h1>
            <p className="text-slate-400">Integrated threat intel feeds, correlation, and campaign tracking</p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => ingestOTXMutation.mutate()}
              disabled={ingestOTXMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {ingestOTXMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Ingesting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Ingest OTX Feed
                </>
              )}
            </Button>

            <Button
              onClick={() => runCorrelationMutation.mutate()}
              disabled={runCorrelationMutation.isPending}
              className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700"
            >
              {runCorrelationMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Correlating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Run Correlation
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Database className="w-10 h-10 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.total_iocs.toLocaleString()}</p>
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
                  <p className="text-2xl font-bold text-white">{stats.malicious_iocs}</p>
                  <p className="text-xs text-slate-400">Malicious</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Target className="w-10 h-10 text-purple-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.active_campaigns}</p>
                  <p className="text-xs text-slate-400">Active Campaigns</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Shield className="w-10 h-10 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.apt_groups_tracked}</p>
                  <p className="text-xs text-slate-400">APT Groups</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Network className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.recent_correlations}</p>
                  <p className="text-xs text-slate-400">Correlations (24h)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Campaigns */}
        <CampaignAnalysisChart campaigns={activeCampaigns} />

        {/* Threat Actor Timeline */}
        <ThreatActorTimeline aptGroups={aptGroups} />

        {/* IOC Correlation Graph */}
        <IOCCorrelationGraph correlations={highConfidenceCorrelations} />

        {/* High-Confidence Correlations */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Zap className="w-5 h-5 text-yellow-400" />
              High-Confidence Correlations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {highConfidenceCorrelations.length === 0 ? (
              <div className="text-center py-12">
                <Network className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">No high-confidence correlations</p>
                <p className="text-xs text-slate-500 mt-2">Click "Run Correlation" to analyze threat intel</p>
              </div>
            ) : (
              <div className="space-y-3">
                {highConfidenceCorrelations.slice(0, 10).map(corr => (
                  <div
                    key={corr.id}
                    className="p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-purple-500/20 text-purple-300">
                            {corr.correlation_type}
                          </Badge>
                          <Badge className="bg-green-500/20 text-green-300">
                            Confidence: {corr.confidence_score}%
                          </Badge>
                          {corr.incident_id && (
                            <Badge className="bg-red-500/20 text-red-300">
                              Incident Created
                            </Badge>
                          )}
                        </div>
                        
                        {corr.match_details && (
                          <p className="text-sm text-slate-300 mb-2">
                            Matched: {corr.match_details.ioc_value} → {corr.match_details.log_value}
                          </p>
                        )}
                        
                        {corr.threat_context?.apt_group && (
                          <p className="text-xs text-slate-400">
                            APT Group: <span className="text-red-400">{corr.threat_context.apt_group}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}