import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Maximize2 } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import DrilldownDrawer from './DrilldownDrawer';

/**
 * AGENT METRIC TIMESERIES CHARTS
 * CPU, Memory, Errors, Queue Depth with drilldown
 */
export default function AgentMetricCharts({ timeseries, filters, meta }) {
  const [selectedAgents, setSelectedAgents] = useState(['ALL']);
  const [activeMetric, setActiveMetric] = useState('cpu');
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownData, setDrilldownData] = useState(null);
  const [drilldownMeta, setDrilldownMeta] = useState(null);

  if (!timeseries || Object.keys(timeseries).length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No agent telemetry data available for selected range
      </div>
    );
  }

  const agentIds = Object.keys(timeseries);

  // Prepare chart data (merge all agents into single timeline)
  const prepareChartData = (metric) => {
    const allTimestamps = new Set();
    
    // Collect all unique timestamps
    agentIds.forEach(agentId => {
      if (selectedAgents.includes('ALL') || selectedAgents.includes(agentId)) {
        timeseries[agentId][metric]?.forEach(point => {
          allTimestamps.add(point.ts);
        });
      }
    });

    const sortedTimestamps = Array.from(allTimestamps).sort();

    // Build data points
    return sortedTimestamps.map(ts => {
      const point = { timestamp: ts };
      
      agentIds.forEach(agentId => {
        if (selectedAgents.includes('ALL') || selectedAgents.includes(agentId)) {
          const agentData = timeseries[agentId][metric]?.find(p => p.ts === ts);
          if (agentData) {
            const key = metric === 'errors' ? 'valueSum' : 
                       metric === 'bytesUploaded' ? 'valueSum' :
                       metric === 'queueDepth' ? 'valueMax' : 'valueAvg';
            point[agentId] = agentData[key];
          }
        }
      });

      return point;
    });
  };

  const handlePointClick = async (data, agentId) => {
    if (!data || !agentId) return;

    try {
      const response = await base44.functions.invoke('analyticsAgentMetricDrilldown', {
        agentId,
        metric: activeMetric,
        filters,
        page: 1,
        pageSize: 100
      });

      setDrilldownData(response.data.data);
      setDrilldownMeta(response.data.meta);
      setDrilldownOpen(true);
    } catch (error) {
      console.error('Metric drilldown error:', error);
    }
  };

  const chartData = prepareChartData(activeMetric);

  const getMetricConfig = (metric) => {
    const configs = {
      cpu: { label: 'CPU Utilization (%)', color: '#3B82F6', yAxisMax: 100 },
      memoryMb: { label: 'Memory Usage (MB)', color: '#10B981', yAxisMax: null },
      memoryPct: { label: 'Memory Usage (%)', color: '#10B981', yAxisMax: 100 },
      diskPct: { label: 'Disk Usage (%)', color: '#A855F7', yAxisMax: 100 },
      errors: { label: 'Error Count', color: '#EF4444', yAxisMax: null },
      queueDepth: { label: 'Queue Depth', color: '#F59E0B', yAxisMax: null },
      scanDuration: { label: 'Scan Duration (ms)', color: '#06B6D4', yAxisMax: null },
      bytesUploaded: { label: 'Bytes Uploaded', color: '#EC4899', yAxisMax: null }
    };
    return configs[metric] || configs.cpu;
  };

  const config = getMetricConfig(activeMetric);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={activeMetric} onValueChange={setActiveMetric} className="flex-1">
          <TabsList className="bg-slate-800 flex-wrap">
            <TabsTrigger value="cpu">CPU</TabsTrigger>
            <TabsTrigger value="memoryPct">Mem %</TabsTrigger>
            <TabsTrigger value="diskPct">Disk %</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="queueDepth">Queue</TabsTrigger>
            <TabsTrigger value="scanDuration">Scan Time</TabsTrigger>
            <TabsTrigger value="bytesUploaded">Upload</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select 
          value={selectedAgents[0]} 
          onValueChange={(val) => setSelectedAgents(val === 'ALL' ? ['ALL'] : [val])}
        >
          <SelectTrigger className="w-48 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Agents</SelectItem>
            {agentIds.map(agentId => (
              <SelectItem key={agentId} value={agentId}>
                {agentId.substring(0, 16)}...
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chart */}
      <div className="bg-slate-800/30 p-4 rounded-lg">
        <ResponsiveContainer width="100%" height={300}>
          {(activeMetric === 'errors' || activeMetric === 'bytesUploaded') ? (
            <BarChart data={chartData}>
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
              {agentIds.map((agentId, idx) => (
                selectedAgents.includes('ALL') || selectedAgents.includes(agentId) ? (
                  <Bar 
                    key={agentId}
                    dataKey={agentId}
                    fill={config.color}
                    name={agentId.substring(0, 12)}
                    onClick={(data) => handlePointClick(data, agentId)}
                    style={{ cursor: 'pointer' }}
                  />
                ) : null
              ))}
            </BarChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="timestamp" 
                stroke="#94A3B8" 
                fontSize={10}
                tickFormatter={(val) => format(new Date(val), 'MMM d HH:mm')}
              />
              <YAxis 
                stroke="#94A3B8" 
                fontSize={12}
                domain={config.yAxisMax ? [0, config.yAxisMax] : [0, 'auto']}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #475569' }}
                labelFormatter={(val) => format(new Date(val), 'PPpp')}
              />
              <Legend />
              {agentIds.map((agentId, idx) => (
                selectedAgents.includes('ALL') || selectedAgents.includes(agentId) ? (
                  <Line 
                    key={agentId}
                    type="monotone"
                    dataKey={agentId}
                    stroke={config.color}
                    name={agentId.substring(0, 12)}
                    dot={false}
                    onClick={(data) => handlePointClick(data, agentId)}
                    style={{ cursor: 'pointer' }}
                  />
                ) : null
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Drilldown */}
      <DrilldownDrawer
        open={drilldownOpen}
        onClose={() => setDrilldownOpen(false)}
        title={`${config.label} - Raw Events`}
        data={drilldownData}
        page={drilldownMeta?.page || 1}
        totalPages={drilldownMeta?.totalPages || 1}
        onPageChange={() => {}}
      />
    </div>
  );
}