import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter, ScatterChart, ZAxis } from 'recharts';
import { Shield, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function CriticalEventTimeline({ logs, onFilterChange, filters = {} }) {
  const severityOptions = ['all', 'critical', 'error', 'warning'];
  const eventTypeOptions = ['all', 'authentication', 'malware', 'lateral_movement', 'privilege_escalation', 'data_exfiltration'];
  const timeRangeOptions = [
    { label: 'Last 24 Hours', value: 24 },
    { label: 'Last 7 Days', value: 168 },
    { label: 'Last 30 Days', value: 720 }
  ];

  const filteredLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    let filtered = [...logs];

    // Filter by severity
    if (filters.severity && filters.severity !== 'all') {
      filtered = filtered.filter(log => log.severity === filters.severity);
    }

    // Filter by event type
    if (filters.eventType && filters.eventType !== 'all') {
      filtered = filtered.filter(log => 
        log.event_type?.toLowerCase().includes(filters.eventType) ||
        log.tags?.some(tag => tag.toLowerCase().includes(filters.eventType))
      );
    }

    // Filter by time range
    if (filters.timeRange) {
      const cutoff = new Date(Date.now() - filters.timeRange * 60 * 60 * 1000);
      filtered = filtered.filter(log => new Date(log.timestamp) >= cutoff);
    }

    return filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [logs, filters]);

  const timelineData = useMemo(() => {
    return filteredLogs.map(log => ({
      timestamp: new Date(log.timestamp).getTime(),
      severity: log.severity,
      event_type: log.event_type,
      source_ip: log.normalized_fields?.source_ip || 'unknown',
      destination_ip: log.normalized_fields?.destination_ip || 'unknown',
      message: log.message,
      mitre_tactic: log.tags?.find(t => t.startsWith('MITRE:'))?.replace('MITRE:', '') || 'Unknown',
      y: log.severity === 'critical' ? 3 : log.severity === 'error' ? 2 : 1,
      z: 100
    }));
  }, [filteredLogs]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;

    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
        <p className="font-semibold text-white mb-2">
          {format(new Date(data.timestamp), 'MMM d, yyyy HH:mm:ss')}
        </p>
        <div className="space-y-1 text-xs">
          <p className="text-slate-300">
            <strong>Event:</strong> {data.event_type}
          </p>
          <p className="text-slate-300">
            <strong>Source:</strong> {data.source_ip}
          </p>
          <p className="text-slate-300">
            <strong>Destination:</strong> {data.destination_ip}
          </p>
          <p className="text-slate-300">
            <strong>MITRE Tactic:</strong> {data.mitre_tactic}
          </p>
          <p className="text-slate-400 mt-2 max-w-xs">
            {data.message.substring(0, 150)}...
          </p>
        </div>
      </div>
    );
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: '#EF4444',
      error: '#F59E0B',
      warning: '#EAB308',
      info: '#3B82F6',
      debug: '#6B7280'
    };
    return colors[severity] || colors.info;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Critical Event Timeline
          </CardTitle>
          
          <div className="flex gap-2 flex-wrap">
            <Select
              value={filters.severity || 'all'}
              onValueChange={(value) => onFilterChange?.({ ...filters, severity: value })}
            >
              <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                {severityOptions.map(opt => (
                  <SelectItem key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.eventType || 'all'}
              onValueChange={(value) => onFilterChange?.({ ...filters, eventType: value })}
            >
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                {eventTypeOptions.map(opt => (
                  <SelectItem key={opt} value={opt}>
                    {opt.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.timeRange?.toString() || '24'}
              onValueChange={(value) => onFilterChange?.({ ...filters, timeRange: parseInt(value) })}
            >
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                {timeRangeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value.toString()}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {timelineData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="w-16 h-16 text-slate-600 mb-4" />
            <p className="text-slate-400">No events match the current filters</p>
            <p className="text-xs text-slate-500 mt-1">Adjust filters to view events</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(ts) => format(new Date(ts), 'HH:mm')}
                  stroke="#94A3B8"
                />
                <YAxis
                  type="number"
                  domain={[0, 4]}
                  ticks={[1, 2, 3]}
                  tickFormatter={(val) => val === 3 ? 'Critical' : val === 2 ? 'Error' : 'Warning'}
                  stroke="#94A3B8"
                />
                <ZAxis range={[50, 400]} />
                <Tooltip content={<CustomTooltip />} />
                <Scatter
                  data={timelineData}
                  fill="#8B5CF6"
                  shape={(props) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={getSeverityColor(payload.severity)}
                        stroke="#fff"
                        strokeWidth={2}
                        opacity={0.8}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
              <span>{filteredLogs.length} events</span>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Critical</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span>Error</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span>Warning</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}