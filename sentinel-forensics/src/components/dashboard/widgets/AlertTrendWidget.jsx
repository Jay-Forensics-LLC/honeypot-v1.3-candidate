import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function AlertTrendWidget({ globalFilters, refreshKey }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metrics', globalFilters, refreshKey],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardMetrics', globalFilters);
      return result.data;
    },
    refetchInterval: 30000
  });

  if (isLoading) {
    return <div className="h-48 bg-gray-100 rounded animate-pulse" />;
  }

  const chartData = data?.metrics?.timeseries || [];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData}>
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit' })}
          fontSize={12}
        />
        <YAxis fontSize={12} />
        <Tooltip 
          labelFormatter={(t) => new Date(t).toLocaleString()}
          contentStyle={{ fontSize: 12 }}
        />
        <Line type="monotone" dataKey="alerts" stroke="#EF4444" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}