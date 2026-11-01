import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Mail, Play, Loader2, Search, Eye, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import EmailIntelDetailDrawer from '../components/emailintel/EmailIntelDetailDrawer';
import DisposableDomainManager from '../components/emailintel/DisposableDomainManager';

export default function EmailIntel() {
  const { id: caseId } = useParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [showDomainManager, setShowDomainManager] = useState(false);

  const { data: indicators = [] } = useQuery({
    queryKey: ['indicators', caseId, 'email'],
    queryFn: async () => {
      return await base44.entities.Indicator.filter({ 
        case_id: caseId,
        indicator_type: 'email'
      });
    }
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['email-risk-profiles', caseId],
    queryFn: async () => {
      return await base44.entities.EmailRiskProfile.filter({ case_id: caseId });
    }
  });

  const enrichMutation = useMutation({
    mutationFn: async (indicatorIds) => {
      const { data } = await base44.functions.invoke('runEmailEnrichment', {
        caseId,
        inputIndicatorIds: indicatorIds,
        parametersJson: {
          strictness: 1,
          allowFreeProviders: true,
          disposableDomainListMode: 'built_in_plus_user'
        }
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-risk-profiles', caseId] });
      queryClient.invalidateQueries({ queryKey: ['enrichment-results', caseId] });
      toast.success(`Enriched ${data.results.length} emails`, {
        description: `${data.stats.disposable} disposable detected`
      });
    },
    onError: (error) => {
      toast.error('Enrichment failed', { description: error.message });
    }
  });

  const getRiskColor = (score) => {
    if (score >= 70) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score >= 40) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  };

  const maskEmail = (email) => {
    const [local, domain] = email.split('@');
    if (local.length <= 2) return email;
    return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
  };

  const filtered = indicators.filter(ind => 
    ind.value.toLowerCase().includes(search.toLowerCase())
  );

  const enrichedMap = new Map(profiles.map(p => [p.indicator_id, p]));

  return (
    <>
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Email Intelligence</h1>
              <p className="text-slate-400">{indicators.length} email indicators</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowDomainManager(true)}
                variant="outline"
                className="border-slate-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Manage Disposable Domains
              </Button>
              <Button
                onClick={() => enrichMutation.mutate(indicators.map(i => i.id))}
                disabled={enrichMutation.isPending || indicators.length === 0}
                className="bg-[#EF4444] hover:bg-[#DC2626]"
              >
                {enrichMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enriching...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Enrich All Emails
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Total Emails</p>
                <p className="text-3xl font-bold text-white mt-1">{indicators.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">High Risk</p>
                <p className="text-3xl font-bold text-red-400 mt-1">
                  {profiles.filter(p => p.current_risk_score >= 70).length}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Disposable</p>
                <p className="text-3xl font-bold text-orange-400 mt-1">
                  {profiles.filter(p => p.current_tags.includes('Disposable Email')).length}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Low Risk</p>
                <p className="text-3xl font-bold text-green-400 mt-1">
                  {profiles.filter(p => p.current_risk_score < 40).length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-900 border-slate-800 text-white"
            />
          </div>

          {/* Table */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Email Indicators</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-400">No email indicators found</p>
                  </div>
                ) : (
                  filtered.map((indicator) => {
                    const profile = enrichedMap.get(indicator.id);
                    const domain = indicator.value.split('@')[1];
                    return (
                      <div
                        key={indicator.id}
                        className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                        onClick={() => setSelectedProfile(profile)}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Mail className="w-5 h-5 text-slate-400" />
                          <div className="flex-1">
                            <p className="text-white font-mono text-sm">{maskEmail(indicator.value)}</p>
                            <p className="text-xs text-slate-500 mt-1">Domain: {domain}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {profile ? (
                                <>
                                  <Badge className={getRiskColor(profile.current_risk_score)}>
                                    Risk: {profile.current_risk_score}/100
                                  </Badge>
                                  {profile.current_tags.map((tag, idx) => (
                                    <Badge key={idx} className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                                      {tag}
                                    </Badge>
                                  ))}
                                  <span className="text-xs text-slate-500">
                                    Confidence: {Math.round(profile.current_confidence * 100)}%
                                  </span>
                                </>
                              ) : (
                                <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                                  Not Enriched
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Eye className="w-4 h-4 text-slate-400" />
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {selectedProfile && (
        <EmailIntelDetailDrawer
          profile={selectedProfile}
          indicator={indicators.find(i => i.id === selectedProfile.indicator_id)}
          caseId={caseId}
          onClose={() => setSelectedProfile(null)}
        />
      )}

      {showDomainManager && (
        <DisposableDomainManager
          caseId={caseId}
          onClose={() => setShowDomainManager(false)}
        />
      )}
    </>
  );
}