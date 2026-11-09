import { useEffect, useRef } from 'react';
import { Smartphone } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import DashboardMetricsStatus from './DashboardMetricsStatus';

export default function DevicePostureWidget({ globalFilters, refreshKey }) {
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
    return <div className="h-48 bg-gray-100 rounded animate-pulse" />;
  }

  if (isError && !data) {
    return <DashboardMetricsStatus isError={isError} hasData={false} />;
  }

  const devices = data?.metrics?.devices || {};
  const chartData = [
    { name: 'Compliant', count: devices.compliant || 0 },
    { name: 'Non-Compliant', count: devices.non_compliant || 0 }
  ];

  return (
    <div>
      <DashboardMetricsStatus isError={isError} hasData={Boolean(data)} />
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-2xl font-bold">{devices.total || 0}</div>
          <div className="text-sm text-gray-600">Total Devices</div>
        </div>
        <Smartphone className="w-8 h-8 text-gray-300" />
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData}>
          <XAxis dataKey="name" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="count" fill="#3B82F6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}