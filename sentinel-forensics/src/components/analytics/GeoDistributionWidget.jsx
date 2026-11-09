import React from 'react';
import { Loader2, Globe } from 'lucide-react';
import ChartCard from './ChartCard';
import { Badge } from '@/components/ui/badge';

export default function GeoDistributionWidget({ filters, data, meta, provenance }) {
  const handleExport = () => {
    const csv = [
      ['Country', 'Count', 'Critical', 'High', 'Medium', 'Avg Confidence'],
      ...data.map(d => [
        d.country,
        d.count,
        d.severityBreakdown.critical,
        d.severityBreakdown.high,
        d.severityBreakdown.medium,
        Math.round(d.avgConfidence * 100)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geo_distribution_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) {
    return (
      <ChartCard title="Geographic Distribution" subtitle="Findings by country">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </ChartCard>
    );
  }

  if (data.length === 0 || (data.length === 1 && data[0].country === 'Unknown')) {
    return (
      <ChartCard title="Geographic Distribution" meta={meta} provenance={provenance}>
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <Globe className="w-12 h-12 mb-2 opacity-50" />
          <p>No geographic data available</p>
          <p className="text-xs mt-1">Enable IP enrichment for geo attribution</p>
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard 
      title="Geographic Distribution" 
      subtitle={`${data.length} countries`}
      onExport={handleExport}
      meta={meta}
      provenance={provenance}
    >
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {data.map((geo, idx) => (
          <div key={idx} className="p-3 bg-slate-800/50 rounded-lg flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-white">{geo.country}</span>
                <Badge variant="outline">{geo.count} findings</Badge>
              </div>
              <div className="flex gap-2">
                {geo.severityBreakdown.critical > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 text-xs">
                    {geo.severityBreakdown.critical} critical
                  </Badge>
                )}
                {geo.severityBreakdown.high > 0 && (
                  <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                    {geo.severityBreakdown.high} high
                  </Badge>
                )}
                {geo.severityBreakdown.medium > 0 && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                    {geo.severityBreakdown.medium} medium
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Avg Confidence</p>
              <p className="text-sm text-white">{Math.round(geo.avgConfidence * 100)}%</p>
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}