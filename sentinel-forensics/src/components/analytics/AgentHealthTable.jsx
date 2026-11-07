import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, Search, ArrowUpDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * AGENT HEALTH SUMMARY TABLE
 * Sortable, searchable, exportable per-agent status
 */
export default function AgentHealthTable({ agents, onAgentClick }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('healthStatus');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Update default sort key to use new field name
  if (sortKey === 'healthStatus') {
    setSortKey('health_status');
  }

  const handleExport = () => {
    const csv = [
      ['Agent ID', 'Host', 'Health', 'Health Reasons', 'Last Seen', 'Minutes Since', 'CPU %', 'Mem %', 'Disk %', 'Errors 1h', 'Errors 24h', 'Queue Max', 'Scan Avg (ms)', 'Bytes Uploaded'],
      ...agents.map(a => [
        a.agentId,
        a.hostId,
        a.health_status,
        a.health_reasons?.join('; ') || '',
        a.lastSeenTsUtc || 'never',
        a.minutesSinceLastSeen,
        a.cpuAvgRecent !== null ? a.cpuAvgRecent : 'N/A',
        a.memPctAvgRecent !== null ? a.memPctAvgRecent : 'N/A',
        a.diskPctAvgRecent !== null ? a.diskPctAvgRecent : 'N/A',
        a.errorsLast1h,
        a.errorsLast24h,
        a.queueDepthMaxRecent !== null ? a.queueDepthMaxRecent : 'N/A',
        a.scanDurationAvgRecent !== null ? a.scanDurationAvgRecent : 'N/A',
        a.bytesUploadedRecent || 0
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent_health_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter and sort
  let displayAgents = agents;
  
  if (searchTerm) {
    displayAgents = displayAgents.filter(a => 
      a.agentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.hostId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  displayAgents = [...displayAgents].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];
    
    // Handle null/undefined
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    
    // Health status special ordering
    if (sortKey === 'health_status') {
      const priority = { critical: 0, warning: 1, stale: 2, healthy: 3, unknown: 4 };
      aVal = priority[aVal];
      bVal = priority[bVal];
    }

    if (sortDir === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  if (!agents || agents.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No agent telemetry data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search agents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800/50 border-slate-700"
          />
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" className="border-slate-700">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700">
            <tr className="text-slate-400">
              <th className="text-left p-3 cursor-pointer hover:text-white" onClick={() => handleSort('agentId')}>
                <div className="flex items-center gap-1">
                  Agent
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="text-left p-3">Host</th>
              <th className="text-left p-3 cursor-pointer hover:text-white" onClick={() => handleSort('health_status')}>
                <div className="flex items-center gap-1">
                  Health
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="text-left p-3 cursor-pointer hover:text-white" onClick={() => handleSort('minutesSinceLastSeen')}>
                <div className="flex items-center gap-1">
                  Last Seen
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="text-right p-3">CPU %</th>
              <th className="text-right p-3">Mem %</th>
              <th className="text-right p-3">Disk %</th>
              <th className="text-right p-3 cursor-pointer hover:text-white" onClick={() => handleSort('errorsLast1h')}>
                <div className="flex items-center gap-1 justify-end">
                  Errors (1h/24h)
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="text-right p-3">Queue Max</th>
              <th className="text-right p-3">Scan (ms)</th>
              <th className="text-right p-3">Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {displayAgents.map((agent, idx) => (
              <tr 
                key={idx} 
                className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                onClick={() => onAgentClick?.(agent)}
              >
                <td className="p-3">
                  <code className="text-xs text-white">{agent.agentName}</code>
                </td>
                <td className="p-3 text-slate-300">
                  <code className="text-xs">{agent.hostId}</code>
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    <Badge className={getHealthColor(agent.health_status)}>
                      {agent.health_status?.toUpperCase()}
                    </Badge>
                    {agent.health_reasons?.length > 0 && (
                      <span className="text-xs text-slate-500" title={agent.health_reasons.join(', ')}>
                        {agent.health_reasons[0]}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-slate-300">
                  {agent.lastSeenTsUtc ? (
                    <div>
                      <div className="text-xs">{formatDistanceToNow(new Date(agent.lastSeenTsUtc), { addSuffix: true })}</div>
                      <div className="text-xs text-slate-500">{new Date(agent.lastSeenTsUtc).toLocaleString()}</div>
                    </div>
                  ) : (
                    <span className="text-slate-500">Never</span>
                  )}
                </td>
                <td className="p-3 text-right text-white">
                  {agent.cpuAvgRecent !== null ? `${agent.cpuAvgRecent}%` : '—'}
                </td>
                <td className="p-3 text-right text-white">
                  {agent.memPctAvgRecent !== null ? `${agent.memPctAvgRecent}%` : 
                   agent.memMbAvgRecent !== null ? `${agent.memMbAvgRecent}MB` : '—'}
                </td>
                <td className="p-3 text-right text-white">
                  {agent.diskPctAvgRecent !== null ? `${agent.diskPctAvgRecent}%` : '—'}
                </td>
                <td className="p-3 text-right">
                  <span className={agent.errorsLast1h > 0 ? 'text-orange-400 font-medium' : 'text-slate-400'}>
                    {agent.errorsLast1h}
                  </span>
                  <span className="text-slate-500"> / </span>
                  <span className={agent.errorsLast24h > 0 ? 'text-orange-400' : 'text-slate-400'}>
                    {agent.errorsLast24h}
                  </span>
                </td>
                <td className="p-3 text-right text-white">
                  {agent.queueDepthMaxRecent !== null ? agent.queueDepthMaxRecent : '—'}
                </td>
                <td className="p-3 text-right text-white">
                  {agent.scanDurationAvgRecent !== null ? `${agent.scanDurationAvgRecent}ms` : '—'}
                </td>
                <td className="p-3 text-right text-white">
                  {agent.bytesUploadedRecent ? formatBytes(agent.bytesUploadedRecent) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {displayAgents.length === 0 && searchTerm && (
        <div className="text-center py-8 text-slate-400">
          No agents match "{searchTerm}"
        </div>
      )}
    </div>
  );
}

function getHealthColor(status) {
  const colors = {
    healthy: 'bg-green-500/20 text-green-400 border-green-500/50',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    critical: 'bg-red-500/20 text-red-400 border-red-500/50',
    stale: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
    unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/50'
  };
  return colors[status] || colors.unknown;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}