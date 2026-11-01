import React from 'react';
import { Shield, TrendingUp, TrendingDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import DashboardMetricsStatus from './DashboardMetricsStatus';

export default function ThreatOverviewWidget({ globalFilters, refreshKey }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-metrics', globalFilters, refreshKey],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardMetrics', globalFilters);
      return result.data;
    },
    refetchInterval: 30000
  });

  if (isLoading) {
    return <div className="h-32 bg-gray-100 rounded animate-pulse" />;
  }

  if (isError && !data) {
    return <DashboardMetricsStatus isError={isError} hasData={false} />;
  }

  const threats = data?.metrics?.threats || {};

  return (
    <div className="space-y-4">
      <DashboardMetricsStatus isError={isError} hasData={Boolean(data)} />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">{threats.total || 0}</div>
          <div className="text-sm text-gray-600">Total Threats</div>
        </div>
        <Shield className="w-10 h-10 text-gray-300" />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-orange-50 rounded-lg">
          <div className="text-lg font-semibold text-orange-700">{threats.active || 0}</div>
          <div className="text-xs text-orange-600">Active</div>
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <div className="text-lg font-semibold text-green-700">{threats.mitigated || 0}</div>
          <div className="text-xs text-green-600">Mitigated</div>
        </div>
      </div>
    </div>
  );
}