import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Download, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import DashboardFilterBar from '../components/analytics/DashboardFilterBar';
import TopThreatsWidget from '../components/analytics/TopThreatsWidget';
import NetworkTimeseriesWidget from '../components/analytics/NetworkTimeseriesWidget';
import VulnTrendsWidget from '../components/analytics/VulnTrendsWidget';
import GeoDistributionWidget from '../components/analytics/GeoDistributionWidget';
import AgentPerformanceWidget from '../components/analytics/AgentPerformanceWidget';
import { subDays } from 'date-fns';
import { useUser } from '../components/hooks/useUser';

export default function AnalyticsDashboard() {
  const { user } = useUser();
  const [filters, setFilters] = useState({
    dateFrom: subDays(new Date(), 7).toISOString(),
    dateTo: new Date().toISOString(),
    caseIds: [],
    agentIds: [],
    severities: [],
    categories: [],
    statuses: []
  });

  const [exporting, setExporting] = useState(false);

  // Fetch cases for filter dropdown
  const { data: cases } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list(),
    initialData: []
  });

  // Fetch widget data in parallel
  const { data: topThreatsData, isLoading: loadingThreats } = useQuery({
    queryKey: ['analytics', 'topThreats', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('analyticsTopThreats', { filters });
      return response.data;
    }
  });

  const { data: networkData, isLoading: loadingNetwork } = useQuery({
    queryKey: ['analytics', 'network', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('analyticsNetworkTimeseries', { filters });
      return response.data;
    }
  });

  const { data: vulnData, isLoading: loadingVuln } = useQuery({
    queryKey: ['analytics', 'vuln', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('analyticsVulnTrends', { filters });
      return response.data;
    }
  });

  const { data: geoData, isLoading: loadingGeo } = useQuery({
    queryKey: ['analytics', 'geo', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('analyticsGeoDistribution', { filters });
      return response.data;
    }
  });

  const { data: agentData, isLoading: loadingAgent, error: agentError } = useQuery({
    queryKey: ['analytics', 'agent', filters],
    queryFn: async () => {
      const response = await base44.functions.invoke('analyticsAgentPerformance', { filters });
      return response.data;
    },
    retry: 1,
    staleTime: 30000 // Cache for 30s to avoid excessive refetch
  });

  const handleExportBundle = async () => {
    setExporting(true);
    try {
      const response = await base44.functions.invoke('analyticsExportBundle', {
        filters,
        widgets: ['topThreats', 'networkTimeseries', 'vulnTrends', 'geoDistribution', 'agentPerformance']
      });

      const blob = new Blob([JSON.stringify(response.data.bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics_evidence_bundle_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Evidence bundle exported');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-[#EF4444]" />
            Analytics Dashboard
          </h1>
          <p className="text-slate-400 mt-1">High-signal operational and forensic analytics</p>
        </div>
        <Button
          onClick={handleExportBundle}
          disabled={exporting}
          variant="outline"
          className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
        >
          <Download className="w-4 h-4 mr-2" />
          {exporting ? 'Exporting...' : 'Export Evidence Bundle'}
        </Button>
      </div>

      {/* Filter Bar */}
      <DashboardFilterBar 
        onFilterChange={setFilters}
        cases={cases}
        agents={[]}
      />

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TopThreatsWidget 
          filters={filters}
          data={topThreatsData?.data}
          meta={topThreatsData?.meta}
          provenance={topThreatsData?.provenance}
        />

        <NetworkTimeseriesWidget 
          filters={filters}
          data={networkData?.data}
          meta={networkData?.meta}
          provenance={networkData?.provenance}
        />

        <VulnTrendsWidget 
          filters={filters}
          data={vulnData?.data}
          meta={vulnData?.meta}
          provenance={vulnData?.provenance}
        />

        <GeoDistributionWidget 
          filters={filters}
          data={geoData?.data}
          meta={geoData?.meta}
          provenance={geoData?.provenance}
        />
      </div>

      {/* Agent Performance - Full Width */}
      <div className="col-span-1 xl:col-span-2">
        <AgentPerformanceWidget 
          filters={filters}
          data={agentData?.data}
          meta={agentData?.meta}
          provenance={agentData?.provenance}
        />
      </div>

      {/* Debug: Seed Data Button (Admin Only) */}
      {user?.role === 'admin' && (
        <div className="col-span-1 xl:col-span-2 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
          <p className="text-xs text-slate-400 mb-2">Admin Tools: Seed test telemetry data</p>
          <Button
            onClick={async () => {
              try {
                toast.promise(
                  base44.functions.invoke('seedAgentTelemetry'),
                  {
                    loading: 'Seeding agent telemetry...',
                    success: (data) => `Created ${data.data.eventsCreated} telemetry events`,
                    error: 'Seeding failed'
                  }
                );
              } catch (error) {
                console.error('Seed error:', error);
              }
            }}
            variant="outline"
            size="sm"
            className="border-blue-500/50 text-blue-400"
          >
            Seed Agent Telemetry (7 days)
          </Button>
        </div>
      )}
    </div>
  );
}