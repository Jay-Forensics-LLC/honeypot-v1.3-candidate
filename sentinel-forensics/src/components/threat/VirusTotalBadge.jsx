import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  CheckCircle
} from 'lucide-react';
import { enrichWithVirusTotal } from '../../functions/enrichWithVirusTotal';
import { toast } from 'sonner';

export default function VirusTotalBadge({ ioc, showDetails = false }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const queryClient = useQueryClient();

  const { data: enrichment, isLoading } = useQuery({
    queryKey: ['vt-enrichment', ioc?.indicator_id],
    queryFn: async () => {
      if (!ioc?.indicator_id) return null;
      
      const results = await base44.entities.EnrichmentResult.filter({
        indicator_id: ioc.indicator_id,
        provider: 'virustotal',
        status: 'success'
      }, '-fetched_at', 1);

      return results[0] || null;
    },
    enabled: !!ioc?.indicator_id,
    staleTime: 300000
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await enrichWithVirusTotal({
        ioc_id: ioc.indicator_id,
        force_refresh: true
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vt-enrichment', ioc?.indicator_id] });
      toast.success('VirusTotal data refreshed');
    },
    onError: (error) => {
      toast.error('Refresh failed', { description: error.message });
    }
  });

  if (!ioc) return null;

  if (isLoading) {
    return <Skeleton className="h-6 w-24 bg-slate-800" />;
  }

  if (!enrichment) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => refreshMutation.mutate()}
        className="border-slate-700 text-slate-400 hover:bg-slate-800 h-8"
      >
        <Shield className="w-3 h-3 mr-1" />
        Check VT
      </Button>
    );
  }

  const reputation = enrichment.summary?.reputation || 'unknown';
  const threatScore = enrichment.summary?.threat_score || 0;

  const getBadgeColor = () => {
    if (reputation === 'malicious') return 'bg-red-500/20 text-red-400 border-red-500/50';
    if (reputation === 'suspicious') return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
    return 'bg-green-500/20 text-green-400 border-green-500/50';
  };

  const getIcon = () => {
    if (reputation === 'malicious') return AlertTriangle;
    if (reputation === 'suspicious') return Shield;
    return CheckCircle;
  };

  const Icon = getIcon();

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-center gap-2">
        <Badge className={`${getBadgeColor()} cursor-help flex items-center gap-1`}>
          <Icon className="w-3 h-3" />
          VT: {reputation}
        </Badge>

        {showDetails && enrichment.links && enrichment.links[0] && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.open(enrichment.links[0].url, '_blank')}
            className="h-6 px-2 text-slate-400 hover:text-white"
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="h-6 px-2 text-slate-400 hover:text-white"
        >
          <RefreshCw className={`w-3 h-3 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {showTooltip && enrichment.summary && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3">
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Threat Score</span>
              <span className="text-white font-bold">{threatScore}/100</span>
            </div>
            {enrichment.summary.key_findings && (
              <div>
                <p className="text-slate-400 mb-1">Findings:</p>
                {enrichment.summary.key_findings.slice(0, 3).map((finding, idx) => (
                  <p key={idx} className="text-slate-300">• {finding}</p>
                ))}
              </div>
            )}
            {enrichment.summary.tags && enrichment.summary.tags.length > 0 && (
              <div>
                <p className="text-slate-400 mb-1">Tags:</p>
                <div className="flex flex-wrap gap-1">
                  {enrichment.summary.tags.slice(0, 5).map((tag, idx) => (
                    <Badge key={idx} className="bg-slate-700 text-slate-300 text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="absolute top-full left-4 transform -mt-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}