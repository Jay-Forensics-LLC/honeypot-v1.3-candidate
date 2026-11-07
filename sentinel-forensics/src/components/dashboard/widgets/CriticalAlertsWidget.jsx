import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import DashboardMetricsStatus from './DashboardMetricsStatus';

export default function CriticalAlertsWidget({ globalFilters, refreshKey }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-metrics', globalFilters],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardMetrics', globalFilters);
      return result.data;
    },
    refetchInterval: 15000
  });
  const previousRefreshKey = useRef(refreshKey);

  useEffect(() => {
    if (previousRefreshKey.current !== refreshKey) {
      previousRefreshKey.current = refreshKey;
      refetch();
    }
  }, [refreshKey, refetch]);

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-20 bg-gray-200 rounded" />
      </div>
    );
  }

  if (isError && !data) {
    return <DashboardMetricsStatus isError={isError} hasData={false} />;
  }

  const criticalCount = data?.metrics?.alerts?.critical_count || 0;

  return (
    <div className="text-center">
      <DashboardMetricsStatus isError={isError} hasData={Boolean(data)} />
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-3">
        <AlertTriangle className="w-8 h-8 text-red-600" />
      </div>
      <div className="text-4xl font-bold text-gray-900 mb-1">{criticalCount}</div>
      <div className="text-sm text-gray-600">Critical Alerts</div>
    </div>
  );
}