import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const COLORS = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#F59E0B',
  LOW: '#3B82F6',
  INFO: '#6B7280'
};

export default function AlertsBySeverityWidget({ globalFilters, refreshKey }) {
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

  const bySeverity = data?.metrics?.alerts?.by_severity || {};
  const chartData = Object.entries(bySeverity)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500">
        No alerts to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          outerRadius={60}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#6B7280'} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}