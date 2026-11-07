import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Globe,
  Server,
  FileText,
  Mail,
  Hash,
  Wifi,
  ExternalLink,
  Eye,
  Clock,
  AlertTriangle,
  Search,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import IndicatorDrawer from "./IndicatorDrawer";
import CorrelationRiskView from "@/components/correlation/CorrelationRiskView";

// Render icon directly - NO storage
const renderIndicatorIcon = (type) => {
  const className = "w-5 h-5 text-slate-400";
  
  if (type === 'ip') return <Server className={className} />;
  if (type === 'domain') return <Globe className={className} />;
  if (type === 'url') return <ExternalLink className={className} />;
  if (type === 'email') return <Mail className={className} />;
  if (type === 'md5' || type === 'sha1' || type === 'sha256') return <Hash className={className} />;
  if (type === 'ja3' || type === 'ja4' || type === 'tls_sni' || type === 'ble_uuid') return <Wifi className={className} />;
  if (type === 'cert_sha1' || type === 'process_name' || type === 'registry_path' || type === 'user_agent' || type === 'mutex') return <FileText className={className} />;
  
  return <HelpCircle className={className} />;
};

const getScoreColor = (score) => {
  const s = score || 0;
  if (s >= 80) return 'bg-red-500';
  if (s >= 60) return 'bg-orange-500';
  if (s >= 40) return 'bg-yellow-500';
  if (s >= 20) return 'bg-blue-500';
  return 'bg-green-500';
};

const getScoreLabel = (score) => {
  const s = score || 0;
  if (s >= 80) return 'Critical';
  if (s >= 60) return 'High';
  if (s >= 40) return 'Medium';
  if (s >= 20) return 'Low';
  return 'Unknown';
};

export default function IOCBoard({ caseId, evidenceId }) {
  const [groupBy, setGroupBy] = useState('type');
  const [sortBy, setSortBy] = useState('score_desc');
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showIgnored, setShowIgnored] = useState(false);
  const [drawerIndicator, setDrawerIndicator] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: indicators = [], isLoading } = useQuery({
    queryKey: ['ioc-indicators', caseId, evidenceId],
    queryFn: async () => {
      try {
        const filters = {};
        if (caseId) filters.case_id = caseId;
        if (evidenceId) filters.evidence_id = evidenceId;
        const data = await base44.entities.IOCIndicator.filter(filters);
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('Error loading indicators:', error);
        return [];
      }
    }
  });

  // Fetch correlations for risk scoring
  const { data: correlations = [] } = useQuery({
    queryKey: ['correlations', caseId],
    queryFn: async () => {
      const corr = await base44.entities.CorrelationGraph.list();
      return corr.filter(c => c.metadata?.case_id === caseId);
    },
    enabled: !!caseId
  });

  const processedIndicators = useMemo(() => {
    if (!Array.isArray(indicators)) return [];
    
    let filtered = indicators.filter(ind => {
      if (!ind) return false;
      if (filterType !== 'all' && ind.indicator_type !== filterType) return false;
      
      const value = (ind.value || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      if (searchQuery && !value.includes(query)) return false;
      
      if (!showIgnored && ind.status === 'ignored') return false;
      if (!showIgnored && ind.ignored_until) {
        try {
          if (new Date(ind.ignored_until) > new Date()) return false;
        } catch {}
      }
      
      return true;
    });

    filtered.sort((a, b) => {
      if (!a || !b) return 0;
      
      switch (sortBy) {
        case 'score_desc':
          return (b.reputation_score || 0) - (a.reputation_score || 0);
        case 'score_asc':
          return (a.reputation_score || 0) - (b.reputation_score || 0);
        case 'recent':
          try {
            return new Date(b.last_seen || 0) - new Date(a.last_seen || 0);
          } catch {
            return 0;
          }
        case 'oldest':
          try {
            return new Date(a.first_seen || 0) - new Date(b.first_seen || 0);
          } catch {
            return 0;
          }
        case 'recurrence':
          return (b.recurrence_count || 0) - (a.recurrence_count || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [indicators, filterType, searchQuery, showIgnored, sortBy]);

  const groupedIndicators = useMemo(() => {
    if (!Array.isArray(processedIndicators)) return {};
    
    const groups = {};
    
    processedIndicators.forEach(ind => {
      if (!ind) return;
      
      let key;
      if (groupBy === 'type') {
        key = ind.indicator_type || 'unknown';
      } else {
        const score = ind.reputation_score || 0;
        if (score >= 80) key = 'critical';
        else if (score >= 60) key = 'high';
        else if (score >= 40) key = 'medium';
        else if (score >= 20) key = 'low';
        else key = 'unknown';
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(ind);
    });
    
    return groups;
  }, [processedIndicators, groupBy]);

  const snoozeMutation = useMutation({
    mutationFn: async ({ indicatorId, hours }) => {
      const indicator = indicators.find(i => i?.indicator_id === indicatorId);
      if (!indicator) throw new Error('Indicator not found');
      
      const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
      await base44.entities.IOCIndicator.update(indicator.id, {
        ignored_until: snoozeUntil.toISOString(),
        status: 'ignored'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ioc-indicators'] });
      toast.success('Indicator snoozed');
    },
    onError: (error) => {
      toast.error('Failed to snooze indicator', {
        description: error.message
      });
    }
  });

  const watchlistMutation = useMutation({
    mutationFn: async (indicatorId) => {
      const indicator = indicators.find(i => i?.indicator_id === indicatorId);
      if (!indicator) throw new Error('Indicator not found');
      
      await base44.entities.IOCIndicator.update(indicator.id, {
        watchlisted: !indicator.watchlisted
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ioc-indicators'] });
      toast.success('Watchlist updated');
    },
    onError: (error) => {
      toast.error('Failed to update watchlist', {
        description: error.message
      });
    }
  });

  const markBenignMutation = useMutation({
    mutationFn: async (indicatorId) => {
      const indicator = indicators.find(i => i?.indicator_id === indicatorId);
      if (!indicator) throw new Error('Indicator not found');
      
      await base44.entities.IOCIndicator.update(indicator.id, {
        status: 'benign',
        is_allowlisted: true,
        reputation_score: 10
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ioc-indicators'] });
      toast.success('Marked as benign');
    },
    onError: (error) => {
      toast.error('Failed to mark as benign', {
        description: error.message
      });
    }
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <Card className="bg-[#111] border-[#1E1E1E]">
          <CardContent className="p-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-slate-400">Loading indicators...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            IOC Board
            <Badge className="bg-slate-700">
              {processedIndicators.length} indicators · {Object.keys(groupedIndicators).length} groups
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      <Card className="bg-[#111] border-[#1E1E1E]">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value || '')}
                placeholder="Search indicators..."
                className="pl-10 bg-[#0B0B0C] border-[#2A2A2A] text-[#ECECEC]"
              />
            </div>

            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value || 'type')}
              className="bg-[#0B0B0C] border border-[#2A2A2A] text-[#ECECEC] rounded-md px-3 py-2"
            >
              <option value="type">Group by Type</option>
              <option value="threat">Group by Threat Level</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value || 'score_desc')}
              className="bg-[#0B0B0C] border border-[#2A2A2A] text-[#ECECEC] rounded-md px-3 py-2"
            >
              <option value="score_desc">Score: High to Low</option>
              <option value="score_asc">Score: Low to High</option>
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
              <option value="recurrence">Most Frequent</option>
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value || 'all')}
              className="bg-[#0B0B0C] border border-[#2A2A2A] text-[#ECECEC] rounded-md px-3 py-2"
            >
              <option value="all">All Types</option>
              <option value="ip">IP Addresses</option>
              <option value="domain">Domains</option>
              <option value="url">URLs</option>
              <option value="md5">MD5</option>
              <option value="sha256">SHA256</option>
              <option value="email">Emails</option>
            </select>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Checkbox
              checked={showIgnored}
              onCheckedChange={(checked) => setShowIgnored(!!checked)}
              id="show-ignored"
            />
            <label htmlFor="show-ignored" className="text-sm text-slate-400 cursor-pointer">
              Show ignored/snoozed indicators
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {Object.entries(groupedIndicators).map(([groupKey, groupIndicators]) => {
          if (!Array.isArray(groupIndicators) || groupIndicators.length === 0) return null;
          
          return (
            <Card key={groupKey} className="bg-[#111] border-[#1E1E1E]">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-[#ECECEC] mb-4 capitalize">
                  {groupKey.replace(/_/g, ' ')} ({groupIndicators.length})
                </h2>
                
                <div className="space-y-3">
                  {groupIndicators.map((indicator) => {
                    if (!indicator) return null;
                    
                    const score = indicator.reputation_score || 0;
                    
                    return (
                      <div
                        key={indicator.indicator_id || indicator.id}
                        className="flex items-center justify-between p-4 bg-[#0B0B0C] rounded-lg border border-[#2A2A2A] hover:border-red-500/50 transition-colors"
                      >
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div className="flex-shrink-0 mt-1">
                            {renderIndicatorIcon(indicator.indicator_type)}
                          </div>
                          
                          <div className="flex-1 min-w-0 space-y-3">
                            <div>
                              <p className="text-[#ECECEC] font-mono text-sm truncate">
                                {indicator.value || 'N/A'}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge className={`${getScoreColor(score)} text-white text-xs`}>
                                  {getScoreLabel(score)} ({score})
                                </Badge>
                                
                                {indicator.recurrence_count > 1 && (
                                  <Badge variant="outline" className="border-blue-500/50 text-blue-400 text-xs">
                                    {indicator.recurrence_count}x
                                  </Badge>
                                )}
                                
                                {indicator.watchlisted && (
                                  <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                                    Watchlisted
                                  </Badge>
                                )}
                                
                                {indicator.is_allowlisted && (
                                  <Badge variant="outline" className="border-green-500/50 text-green-400 text-xs">
                                    Allowlisted
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            {/* Show correlation risk if exists */}
                            {(() => {
                              const corr = correlations.find(c => 
                                c.metadata?.observable_value === indicator.value
                              );
                              return corr ? <CorrelationRiskView correlationId={corr.id} /> : null;
                            })()}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            onClick={() => setDrawerIndicator(indicator)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Details
                          </Button>
                          
                          <button
                            onClick={() => snoozeMutation.mutate({ indicatorId: indicator.indicator_id, hours: 24 })}
                            className="p-2 text-slate-400 hover:text-[#ECECEC] hover:bg-[#2A2A2A] rounded transition-colors"
                            title="Snooze 24h"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          
                          <button
                            onClick={() => markBenignMutation.mutate(indicator.indicator_id)}
                            className="p-2 text-slate-400 hover:text-green-400 hover:bg-[#2A2A2A] rounded transition-colors"
                            title="Mark as Benign"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {processedIndicators.length === 0 && (
        <Card className="bg-[#111] border-[#1E1E1E]">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg mb-2">No indicators found</p>
            <p className="text-slate-500 text-sm">
              {searchQuery || filterType !== 'all' 
                ? 'Try adjusting your filters or search query' 
                : 'Upload evidence to extract indicators'}
            </p>
          </CardContent>
        </Card>
      )}

      {drawerIndicator && (
        <IndicatorDrawer
          indicator={drawerIndicator}
          open={!!drawerIndicator}
          onClose={() => setDrawerIndicator(null)}
        />
      )}
    </div>
  );
}