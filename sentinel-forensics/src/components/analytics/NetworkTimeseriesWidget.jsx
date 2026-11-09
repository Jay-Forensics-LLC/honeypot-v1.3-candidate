import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';
import ChartCard from './ChartCard';
import DrilldownDrawer from './DrilldownDrawer';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

export default function NetworkTimeseriesWidget({ filters, data, meta, provenance }) {
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownData, setDrilldownData] = useState(null);

  const handlePointClick = async (pointData) => {
    if (!pointData?.eventIds?.length) return;

    try {
      const response = await base44.functions.invoke('analyticsDrilldown', {
        drilldownType: 'events',
        ids: pointData.eventIds.slice(0, 100),
        page: 1,
        pageSize: 50
      });

      setDrilldownData(response.data);
      setDrilldownOpen(true);
    } catch (error) {
      console.error('Drilldown error:', error);
    }
  };

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Total Connections', 'Unique IPs', 'Unique Domains', 'Bytes Out', 'Bytes In'],
      ...data.map(d => [
        d.timestamp,
        d.totalConnections,
        d.uniqueRemoteIPs,
        d.uniqueDomains,
        d.bytesOut,
        d.bytesIn
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `network_timeseries_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) {
    return (
      <ChartCard title="Network Traffic Over Time" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </ChartCard>
    );
  }

  if (data.length === 0) {
    return (
      <ChartCard title="Network Traffic Over Time" meta={meta} provenance={provenance}>
        <div className="flex items-center justify-center h-64 text-slate-400">
          No network events found for selected filters
        </div>
      </ChartCard>
    );
  }

  return (
    <>
      <ChartCard 
        title="Network Traffic Over Time" 
        subtitle={`${meta?.totalEvents || 0} total events`}
        onExport={handleExport}
        meta={meta}
        provenance={provenance}
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="timestamp" 
              stroke="#94A3B8" 
              fontSize={10}
              tickFormatter={(val) => format(new Date(val), 'MMM d HH:mm')}
            />
            <YAxis stroke="#94A3B8" fontSize={12} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #475569' }}
              labelFormatter={(val) => format(new Date(val), 'PPpp')}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="totalConnections" 
              stroke="#3B82F6" 
              name="Connections" 
              onClick={handlePointClick}
              style={{ cursor: 'pointer' }}
            />
            <Line type="monotone" dataKey="uniqueRemoteIPs" stroke="#10B981" name="Unique IPs" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <DrilldownDrawer
        open={drilldownOpen}
        onClose={() => setDrilldownOpen(false)}
        title="Network Events"
        data={drilldownData?.data}
        page={1}
        totalPages={drilldownData?.meta?.totalPages || 1}
        onPageChange={() => {}}
      />
    </>
  );
}