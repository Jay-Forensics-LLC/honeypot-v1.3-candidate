import { useEffect, useRef } from 'react';
import { Database, Lock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import DashboardMetricsStatus from './DashboardMetricsStatus';

export default function EvidenceIntegrityWidget({ globalFilters, refreshKey }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-metrics', globalFilters],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardMetrics', globalFilters);
      return result.data;
    }
  });
  const previousRefreshKey = useRef(refreshKey);

  useEffect(() => {
    if (previousRefreshKey.current !== refreshKey) {
      previousRefreshKey.current = refreshKey;
      refetch();
    }
  }, [refreshKey, refetch]);

  if (isLoading) {
    return <div className="h-24 bg-gray-100 rounded animate-pulse" />;
  }

  if (isError && !data) {
    return <DashboardMetricsStatus isError={isError} hasData={false} />;
  }

  const evidence = data?.metrics?.evidence || {};

  return (
    <div className="text-center">
      <DashboardMetricsStatus isError={isError} hasData={Boolean(data)} />
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-2">
        <Database className="w-6 h-6 text-blue-600" />
      </div>
      <div className="text-3xl font-bold text-gray-900">{evidence.total || 0}</div>
      <div className="text-sm text-gray-600 mb-3">Evidence Items</div>
      
      <div className="flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <Lock className="w-3 h-3 text-gray-500" />
          <span>{evidence.locked || 0} Locked</span>
        </div>
        <div className="text-gray-400">•</div>
        <div>{evidence.total_size_mb || 0} MB</div>
      </div>
    </div>
  );
}