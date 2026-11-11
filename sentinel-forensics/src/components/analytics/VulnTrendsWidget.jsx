import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Loader2 } from 'lucide-react';
import ChartCard from './ChartCard';
import { format } from 'date-fns';

export default function VulnTrendsWidget({ filters, data, meta, provenance }) {
  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Discovered', 'Open', 'Closed', 'Cumulative Open', 'Critical', 'High', 'Medium'],
      ...data.map(d => [
        d.timestamp,
        d.discovered,
        d.open,
        d.closed,
        d.cumulativeOpen,
        d.bySeverity.critical,
        d.bySeverity.high,
        d.bySeverity.medium
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vuln_trends_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) {
    return (
      <ChartCard title="Vulnerability Trends" subtitle="CVE-verified only">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </ChartCard>
    );
  }

  if (data.length === 0) {
    return (
      <ChartCard title="Vulnerability Trends" subtitle="CVE-verified only" meta={meta} provenance={provenance}>
        <div className="flex items-center justify-center h-64 text-slate-400">
          No CVE-verified vulnerabilities found
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard 
      title="Vulnerability Trends" 
      subtitle={`${meta?.totalVulnerabilities || 0} CVE-verified vulnerabilities`}
      onExport={handleExport}
      meta={meta}
      provenance={provenance}
    >
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorOpen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="timestamp" 
            stroke="#94A3B8" 
            fontSize={10}
            tickFormatter={(val) => format(new Date(val), 'MMM d')}
          />
          <YAxis stroke="#94A3B8" fontSize={12} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #475569' }}
            labelFormatter={(val) => format(new Date(val), 'PPp')}
          />
          <Legend />
          <Area type="monotone" dataKey="cumulativeOpen" stroke="#EF4444" fillOpacity={1} fill="url(#colorOpen)" name="Open Vulnerabilities" />
          <Line type="monotone" dataKey="discovered" stroke="#3B82F6" name="Discovered" />
          <Line type="monotone" dataKey="closed" stroke="#10B981" name="Closed" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}