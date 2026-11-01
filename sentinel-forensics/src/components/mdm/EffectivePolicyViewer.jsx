import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, Eye, Code, Copy, CheckCircle, X, 
  ChevronDown, ChevronRight, RefreshCw 
} from 'lucide-react';
import { toast } from 'sonner';
import { resilientAPI } from '../utils/ResilientAPIClient';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export default function MDMEffectivePolicyViewer({ device }) {
  const [viewMode, setViewMode] = useState('graphical');

  const { data: resolution, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['effective-mdm-policy', device.id],
    queryFn: async () => {
      const response = await resilientAPI.callFunction('getEffectiveMDMPolicy', {
        device_id: device.id
      }, 15000);
      return response;
    },
    enabled: !!device.id,
    staleTime: 120000
  });

  const handleCopyJSON = () => {
    if (!resolution) return;
    navigator.clipboard.writeText(JSON.stringify(resolution, null, 2));
    toast.success('JSON copied to clipboard');
  };

  const handleDownloadJSON = () => {
    if (!resolution) return;
    const blob = new Blob([JSON.stringify(resolution, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `effective_policy_${device.id}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON downloaded');
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-1/2" />
          <div className="h-4 bg-slate-700 rounded w-3/4" />
          <div className="h-32 bg-slate-700 rounded" />
        </div>
      </div>
    );
  }

  if (!resolution) {
    return (
      <div className="p-6 text-center">
        <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600" />
        <p className="text-slate-400">Failed to load effective policy</p>
      </div>
    );
  }

  const domains = Object.keys(resolution.effective_policy?.policy_config || {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white">Effective Policy</h4>
          <p className="text-xs text-slate-400">
            Evaluated: {new Date(resolution.evaluated_at).toLocaleString()}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Policy Sources */}
      <div className="flex flex-wrap gap-2">
        {resolution.policy_sources.map((source, idx) => (
          <Badge key={idx} variant="outline" className="text-xs">
            {source.name}
            <span className="ml-1 text-slate-500">(P{source.priority})</span>
          </Badge>
        ))}
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={viewMode === 'graphical' ? 'default' : 'outline'}
          onClick={() => setViewMode('graphical')}
          className={viewMode === 'graphical' ? 'bg-blue-600' : 'border-slate-700'}
        >
          <Eye className="w-4 h-4 mr-2" />
          Graphical
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'json' ? 'default' : 'outline'}
          onClick={() => setViewMode('json')}
          className={viewMode === 'json' ? 'bg-blue-600' : 'border-slate-700'}
        >
          <Code className="w-4 h-4 mr-2" />
          Raw JSON
        </Button>
      </div>

      {/* Content */}
      {viewMode === 'json' ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-sm">Raw JSON</CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyJSON}
                  className="border-slate-700"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadJSON}
                  className="border-slate-700"
                >
                  Download
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-slate-900 p-4 rounded text-xs text-slate-300 overflow-auto max-h-[500px]">
              {JSON.stringify(resolution, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {domains.map(domain => {
            const summary = resolution.domain_summary[domain] || {};
            const config = resolution.effective_policy.policy_config[domain] || {};
            
            return (
              <AccordionItem 
                key={domain} 
                value={domain}
                className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-4 py-3 hover:bg-slate-800/70">
                  <div className="flex items-center gap-3 w-full">
                    <div className="flex-1 text-left">
                      <span className="text-white font-semibold capitalize">
                        {domain.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {summary.conflicts > 0 && (
                        <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                          {summary.conflicts} conflict{summary.conflicts !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {summary.keys} setting{summary.keys !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {Object.entries(config).map(([key, value]) => {
                      const fullPath = `policy_config.${domain}.${key}`;
                      const resolutionInfo = resolution.resolution_map[fullPath];
                      
                      return (
                        <SettingRow
                          key={key}
                          label={key.replace(/_/g, ' ')}
                          value={value}
                          resolutionInfo={resolutionInfo}
                        />
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

function SettingRow({ label, value, resolutionInfo }) {
  const [expanded, setExpanded] = useState(false);

  const formatValue = (val) => {
    if (typeof val === 'boolean') {
      return val ? (
        <Badge className="bg-green-500/20 text-green-400">Enabled</Badge>
      ) : (
        <Badge className="bg-red-500/20 text-red-400">Disabled</Badge>
      );
    }
    if (Array.isArray(val)) {
      return <Badge variant="outline">{val.length} item{val.length !== 1 ? 's' : ''}</Badge>;
    }
    return <span className="text-white font-mono text-sm">{String(val)}</span>;
  };

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white text-sm capitalize">{label}</span>
            {formatValue(value)}
          </div>
          
          {resolutionInfo && (
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                {resolutionInfo.winner_source.name}
              </Badge>
              {resolutionInfo.candidates.length > 1 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1"
                >
                  {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Why?
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {expanded && resolutionInfo && (
        <div className="mt-3 pt-3 border-t border-slate-700 space-y-3">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
            <p className="text-xs text-blue-300 mb-1">
              <strong>Rule:</strong> {resolutionInfo.rule}
            </p>
            <p className="text-xs text-slate-300">
              {resolutionInfo.rationale}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-2">Candidate Values:</p>
            <div className="space-y-2">
              {resolutionInfo.candidates.map((candidate, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded border ${
                    candidate.source_type === resolutionInfo.winner_source.source_type ?
                      'bg-green-500/10 border-green-500/30' :
                      'bg-slate-800/30 border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">{candidate.name}</span>
                    <div className="flex items-center gap-2">
                      {formatValue(candidate.value)}
                      {candidate.source_type === resolutionInfo.winner_source.source_type && (
                        <CheckCircle className="w-3 h-3 text-green-400" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}