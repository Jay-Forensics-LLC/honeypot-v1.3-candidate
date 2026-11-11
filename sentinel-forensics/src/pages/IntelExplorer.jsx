import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Shield, Mail, Globe, Hash, Target, TrendingUp } from 'lucide-react';
import CorrelationRiskView from '@/components/correlation/CorrelationRiskView';
import CorrelationTable from '@/components/correlation/CorrelationTable';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/components/utils';

export default function IntelExplorer() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const queryClient = useQueryClient();

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Enter search query');
      return;
    }

    setIsSearching(true);
    try {
      const user = await base44.auth.me();
      const query = searchQuery.toLowerCase().trim();

      // Search indicators
      const allIndicators = await base44.entities.Indicator.list();

      const matchedIndicators = allIndicators.filter(ind => 
        ind.value.toLowerCase().includes(query)
      );

      // Fetch correlations for matched indicators
      const correlations = await base44.entities.CorrelationGraph.filter({
        target_type: 'ioc'
      });

      // Get enrichment results and correlations for matched indicators
      const enrichmentResults = [];
      for (const indicator of matchedIndicators.slice(0, 20)) {
        // Find correlation if exists
        const correlation = correlations.find(c => c.target_id === indicator.id);
        
        if (indicator.indicator_type === 'ip') {
          const profiles = await base44.entities.IPRiskProfile.filter({ indicator_id: indicator.id });
          enrichmentResults.push({ 
            indicator, 
            profile: profiles[0] || null, 
            type: 'ip',
            correlation
          });
        } else if (indicator.indicator_type === 'email') {
          const profiles = await base44.entities.EmailRiskProfile.filter({ indicator_id: indicator.id });
          enrichmentResults.push({ 
            indicator, 
            profile: profiles[0] || null, 
            type: 'email',
            correlation
          });
        } else {
          enrichmentResults.push({ 
            indicator, 
            profile: null, 
            type: indicator.indicator_type,
            correlation
          });
        }
      }

      setSearchResults({
        query,
        results: enrichmentResults,
        totalFound: matchedIndicators.length
      });
    } catch (error) {
      toast.error('Search failed', { description: error.message });
    } finally {
      setIsSearching(false);
    }
  };

  const enrichIndicator = async (indicator) => {
    try {
      if (indicator.indicator_type === 'ip') {
        await base44.functions.invoke('runIpEnrichment', {
          caseId: indicator.case_id,
          inputIndicatorIds: [indicator.id],
          parametersJson: { strictness: 1 }
        });
      } else if (indicator.indicator_type === 'email') {
        await base44.functions.invoke('runEmailEnrichment', {
          caseId: indicator.case_id,
          inputIndicatorIds: [indicator.id],
          parametersJson: { strictness: 1 }
        });
      }
      
      queryClient.invalidateQueries();
      toast.success('Enrichment started');
      handleSearch(); // Refresh results
    } catch (error) {
      toast.error('Enrichment failed', { description: error.message });
    }
  };

  const getTypeIcon = (type) => {
    const icons = {
      ip: Shield,
      email: Mail,
      domain: Globe,
      hash_sha256: Hash
    };
    return icons[type] || Shield;
  };

  const getRiskColor = (score) => {
    if (!score) return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    if (score >= 70) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score >= 40) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Intel Explorer</h1>
          <p className="text-slate-400">Search across all indicators and enrichment data</p>
        </div>

        {/* Search */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Search IP, email, domain, hash..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10 bg-slate-800 border-slate-700 text-white h-12 text-lg"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={isSearching}
                className="bg-[#EF4444] hover:bg-[#DC2626] h-12 px-8"
              >
                {isSearching ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Correlations Table */}
        <CorrelationTable caseId={query} />

        {/* Results */}
        {searchResults && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">
                Search Results: {searchResults.results.length} of {searchResults.totalFound} indicators
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {searchResults.results.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-400">No indicators found matching "{searchResults.query}"</p>
                  </div>
                ) : (
                  searchResults.results.map((result) => {
                    const Icon = getTypeIcon(result.type);
                    return (
                      <div
                        key={result.indicator.id}
                        className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                      >
                        <div className="flex items-start gap-3 flex-1">
                          <Icon className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
                          <div className="flex-1 min-w-0 space-y-3">
                            <div>
                              <p className="text-white font-mono text-sm truncate">{result.indicator.value}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                                  {result.indicator.indicator_type}
                                </Badge>
                                {result.indicator.source && (
                                  <Badge variant="outline" className="text-xs">
                                    {result.indicator.source}
                                  </Badge>
                                )}
                                {result.indicator.threat_level && (
                                  <Badge className={
                                    result.indicator.threat_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                                    result.indicator.threat_level === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  }>
                                    {result.indicator.threat_level}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            {/* Show latest risk score from correlations */}
                            {result.correlation && (
                              <CorrelationRiskView correlationId={result.correlation.id} />
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => enrichIndicator(result.indicator)}
                          variant="outline"
                          className="border-slate-700 ml-4"
                        >
                          Enrich Now
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}