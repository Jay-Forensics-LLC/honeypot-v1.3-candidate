import { useEffect, useRef } from 'react';
import { FileCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import DashboardMetricsStatus from './DashboardMetricsStatus';

export default function PolicyComplianceWidget({ globalFilters, refreshKey }) {
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
    return <div className="h-32 bg-gray-100 rounded animate-pulse" />;
  }

  if (isError && !data) {
    return <DashboardMetricsStatus isError={isError} hasData={false} />;
  }

  const devices = data?.metrics?.devices || {};
  const avgCompliance = devices.avg_compliance || 0;

  return (
    <div className="space-y-4">
      <DashboardMetricsStatus isError={isError} hasData={Boolean(data)} />
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">Device Compliance</h3>
        <FileCheck className="w-5 h-5 text-gray-400" />
      </div>
      
      <div className="relative">
        <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
          <div 
            style={{ width: `${avgCompliance}%` }}
            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"
          />
        </div>
        <div className="text-2xl font-bold mt-2">{avgCompliance}%</div>
        <div className="text-sm text-gray-600">Average Compliance</div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="font-semibold text-green-600">{devices.compliant || 0}</div>
          <div className="text-gray-600">Compliant</div>
        </div>
        <div>
          <div className="font-semibold text-red-600">{devices.non_compliant || 0}</div>
          <div className="text-gray-600">Non-Compliant</div>
        </div>
      </div>
    </div>
  );
}