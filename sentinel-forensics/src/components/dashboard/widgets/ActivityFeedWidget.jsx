import React from 'react';
import { Activity } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import DashboardMetricsStatus from './DashboardMetricsStatus';

export default function ActivityFeedWidget({ globalFilters, refreshKey }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-metrics', globalFilters, refreshKey],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardMetrics', globalFilters);
      return result.data;
    },
    refetchInterval: 15000
  });

  if (isLoading) {
    return <div className="space-y-2">{[...Array(5)].map((_, i) => (
      <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
    ))}</div>;
  }

  if (isError && !data) {
    return <DashboardMetricsStatus isError={isError} hasData={false} />;
  }

  const audit = data?.metrics?.audit || {};
  const timeseries = data?.metrics?.timeseries || [];
  const recentActivity = timeseries.slice(-5).reverse();

  return (
    <div className="space-y-3">
      <DashboardMetricsStatus isError={isError} hasData={Boolean(data)} />
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Total Events</span>
        <span className="font-semibold">{audit.total_events || 0}</span>
      </div>
      
      <div className="space-y-2">
        {recentActivity.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3 text-gray-400" />
              <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
            </div>
            <span className="font-medium">{item.audit_events} events</span>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t text-xs text-gray-600">
        {audit.unique_actors || 0} unique actors • {audit.failed_actions || 0} failed actions
      </div>
    </div>
  );
}