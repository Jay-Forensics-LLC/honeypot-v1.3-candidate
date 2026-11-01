import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Database, Play, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import IndicatorTable from '../components/enrichment/IndicatorTable';
import EnrichmentRunHistoryTable from '../components/enrichment/EnrichmentRunHistoryTable';
import EnrichmentResultList from '../components/enrichment/EnrichmentResultList';

/**
 * ENRICHMENT DASHBOARD
 * Per-case indicator extraction and enrichment interface
 */

export default function EnrichmentDashboard() {
  const { id: caseId } = useParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('indicators');

  // Fetch case
  const { data: caseData } = useQuery({
    queryKey: ['case', caseId],
    queryFn: async () => {
      const cases = await base44.entities.Case.filter({ id: caseId });
      return cases[0];
    }
  });

  // Fetch indicators
  const { data: indicators = [], isLoading: loadingIndicators } = useQuery({
    queryKey: ['indicators', caseId],
    queryFn: async () => {
      return await base44.entities.Indicator.filter({ case_id: caseId });
    }
  });

  // Fetch enrichment runs
  const { data: runs = [] } = useQuery({
    queryKey: ['enrichment-runs', caseId],
    queryFn: async () => {
      return await base44.entities.EnrichmentRun.filter({ case_id: caseId });
    }
  });

  // Fetch enrichment results
  const { data: results = [] } = useQuery({
    queryKey: ['enrichment-results', caseId],
    queryFn: async () => {
      return await base44.entities.EnrichmentResult.filter({ case_id: caseId });
    }
  });

  // Extract indicators mutation
  const extractMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('extractIndicatorsFromCase', {
        caseId,
        includeIPs: true,
        includeEmails: true,
        includeDomains: true,
        includeUrls: true,
        includeHashes: true
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['indicators', caseId] });
      toast.success(`Extracted ${data.stats.total} indicators`, {
        description: Object.entries(data.stats.by_type)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', ')
      });
    },
    onError: (error) => {
      toast.error('Extraction failed', {
        description: error.message
      });
    }
  });

  if (!caseData) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Indicator Enrichment
            </h1>
            <p className="text-slate-400">
              Case: {caseData.name}
            </p>
          </div>

          <Button
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
            className="bg-[#EF4444] hover:bg-[#DC2626]"
          >
            {extractMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                Extract Indicators
              </>
            )}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Indicators</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {indicators.length}
                  </p>
                </div>
                <Database className="w-8 h-8 text-[#EF4444]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Enrichment Runs</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {runs.length}
                  </p>
                </div>
                <Play className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Results</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {results.length}
                  </p>
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  {results.filter(r => r.risk_score && r.risk_score > 70).length} High Risk
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Avg Confidence</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {results.length > 0
                      ? Math.round(
                          (results.reduce((sum, r) => sum + r.confidence, 0) / results.length) * 100
                        )
                      : 0}%
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-900/50 border border-slate-800">
            <TabsTrigger value="indicators" className="data-[state=active]:bg-slate-800">
              Indicators ({indicators.length})
            </TabsTrigger>
            <TabsTrigger value="runs" className="data-[state=active]:bg-slate-800">
              Runs ({runs.length})
            </TabsTrigger>
            <TabsTrigger value="results" className="data-[state=active]:bg-slate-800">
              Results ({results.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="indicators" className="mt-6">
            <IndicatorTable indicators={indicators} caseId={caseId} />
          </TabsContent>

          <TabsContent value="runs" className="mt-6">
            <EnrichmentRunHistoryTable runs={runs} />
          </TabsContent>

          <TabsContent value="results" className="mt-6">
            <EnrichmentResultList results={results} indicators={indicators} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}