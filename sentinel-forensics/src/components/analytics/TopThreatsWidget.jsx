import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';
import ChartCard from './ChartCard';
import DrilldownDrawer from './DrilldownDrawer';
import { base44 } from '@/api/base44Client';

export default function TopThreatsWidget({ filters, data, meta, provenance }) {
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownData, setDrilldownData] = useState(null);
  const [drilldownPage, setDrilldownPage] = useState(1);

  const handleBarClick = async (barData) => {
    if (!barData?.findingIds?.length) return;

    try {
      const response = await base44.functions.invoke('analyticsDrilldown', {
        drilldownType: 'findings',
        ids: barData.findingIds,
        page: 1,
        pageSize: 50
      });

      setDrilldownData(response.data);
      setDrilldownPage(1);
      setDrilldownOpen(true);
    } catch (error) {
      console.error('Drilldown error:', error);
    }
  };

  const handleExport = () => {
    const csv = [
      ['Type', 'Total', 'Critical', 'High', 'Medium', 'Low', 'Info', 'Avg Confidence', 'Threat Intel Matches', 'Avg TI Confidence'],
      ...data.map(d => [
        d.type,
        d.total,
        d.bySeverity.critical,
        d.bySeverity.high,
        d.bySeverity.medium,
        d.bySeverity.low,
        d.bySeverity.info,
        Math.round(d.avgConfidence * 100),
        d.threatIntelMatches || 0,
        d.avgThreatIntelConfidence || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `top_threats_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) {
    return (
      <ChartCard title="Top Threats by Type" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </ChartCard>
    );
  }

  if (data.length === 0) {
    return (
      <ChartCard title="Top Threats by Type" meta={meta} provenance={provenance}>
        <div className="flex items-center justify-center h-64 text-slate-400">
          No threats found for selected filters
        </div>
      </ChartCard>
    );
  }

  return (
    <>
      <ChartCard 
        title="Top Threats by Type" 
        subtitle={`${meta?.totalFindings || 0} total findings | ${meta?.threatIntelIndicatorsLoaded || 0} threat intel indicators loaded`}
        onExport={handleExport}
        meta={meta}
        provenance={provenance}
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="type" stroke="#94A3B8" fontSize={12} />
            <YAxis stroke="#94A3B8" fontSize={12} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #475569' }}
              labelStyle={{ color: '#F1F5F9' }}
            />
            <Legend />
            <Bar dataKey="bySeverity.critical" stackId="a" fill="#EF4444" name="Critical" onClick={handleBarClick} cursor="pointer" />
            <Bar dataKey="bySeverity.high" stackId="a" fill="#F97316" name="High" onClick={handleBarClick} cursor="pointer" />
            <Bar dataKey="bySeverity.medium" stackId="a" fill="#EAB308" name="Medium" onClick={handleBarClick} cursor="pointer" />
            <Bar dataKey="bySeverity.low" stackId="a" fill="#3B82F6" name="Low" onClick={handleBarClick} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <DrilldownDrawer
        open={drilldownOpen}
        onClose={() => setDrilldownOpen(false)}
        title="Threat Details"
        data={drilldownData?.data}
        page={drilldownPage}
        totalPages={drilldownData?.meta?.totalPages || 1}
        onPageChange={setDrilldownPage}
      />
    </>
  );
}