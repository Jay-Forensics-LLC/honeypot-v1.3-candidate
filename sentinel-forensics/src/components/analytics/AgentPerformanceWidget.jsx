import React, { useState } from 'react';
import { Loader2, Activity, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import ChartCard from './ChartCard';
import KpiTile from './KpiTile';
import AgentHealthTable from './AgentHealthTable';
import AgentMetricCharts from './AgentMetricCharts';

/**
 * AGENT PERFORMANCE WIDGET - COMPLETE IMPLEMENTATION
 * Timeseries charts + health table + drilldown
 */
export default function AgentPerformanceWidget({ filters, data, meta, provenance }) {
  const [focusedAgent, setFocusedAgent] = useState(null);

  const handleExport = () => {
    if (!data) return;
    
    const exportData = {
      kpis: data.kpis,
      summaryTable: data.summaryTable,
      timeseries: data.timeseries,
      meta,
      provenance,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent_performance_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-32 bg-slate-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-slate-800/50 rounded-lg flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </div>
    );
  }

  const kpis = data.kpis || {};

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <KpiTile 
          title="Total Agents" 
          value={kpis.totalAgents || 0} 
          icon={Activity}
          color="blue"
        />
        <KpiTile 
          title="Healthy" 
          value={kpis.healthyAgents || 0} 
          icon={CheckCircle}
          color="green"
        />
        <KpiTile 
          title="Warning" 
          value={kpis.warningAgents || 0} 
          icon={AlertTriangle}
          color="yellow"
        />
        <KpiTile 
          title="Critical" 
          value={kpis.criticalAgents || 0} 
          icon={AlertTriangle}
          color="red"
        />
        <KpiTile 
          title="Stale" 
          value={kpis.staleAgents || 0} 
          icon={Clock}
          color="purple"
        />
        <KpiTile 
          title="Errors (24h)" 
          value={kpis.totalErrors24h || 0} 
          icon={AlertTriangle}
          color="orange"
        />
      </div>

      {/* Timeseries Charts */}
      <ChartCard 
        title="Agent Metrics Over Time" 
        subtitle={`${meta?.totalEvents || 0} telemetry events`}
        onExport={handleExport}
        meta={meta}
        provenance={provenance}
      >
        <AgentMetricCharts 
          timeseries={data.timeseries}
          filters={filters}
          meta={meta}
        />
      </ChartCard>

      {/* Summary Table */}
      <ChartCard 
        title="Agent Health Status" 
        subtitle={`${data.summaryTable?.length || 0} agents`}
      >
        <AgentHealthTable 
          agents={data.summaryTable || []}
          onAgentClick={(agent) => {
            setFocusedAgent(agent);
            // Could expand to filter charts to this agent
          }}
        />
      </ChartCard>

      {/* Health Algorithm Documentation */}
      {data.config && (
        <div className="text-xs text-slate-500 p-3 bg-slate-800/30 rounded">
          <strong>Health Algorithm:</strong> STALE = no data for {Math.round(data.config.staleGraceMs / 60000)}min | 
          CRITICAL = cpu≥{data.config.thresholds.cpu_pct.critical}% OR mem≥{data.config.thresholds.mem_pct.critical}% OR disk≥{data.config.thresholds.disk_pct.critical}% OR queue≥{data.config.thresholds.queue_depth.critical} | 
          WARNING = cpu≥{data.config.thresholds.cpu_pct.warn}% OR mem≥{data.config.thresholds.mem_pct.warn}% OR disk≥{data.config.thresholds.disk_pct.warn}% OR queue≥{data.config.thresholds.queue_depth.warn}
        </div>
      )}
    </div>
  );
}