import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Target, TrendingUp } from 'lucide-react';

export default function TopAttackVectors({ logs, onFilterChange, filters = {} }) {
  const vectorData = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    let filtered = [...logs];

    if (filters.severity && filters.severity !== 'all') {
      filtered = filtered.filter(log => log.severity === filters.severity);
    }

    if (filters.timeRange) {
      const cutoff = new Date(Date.now() - filters.timeRange * 60 * 60 * 1000);
      filtered = filtered.filter(log => new Date(log.timestamp) >= cutoff);
    }

    // Classify attack vectors
    const vectorMap = new Map();

    filtered.forEach(log => {
      let vector = 'Unknown';
      
      // Determine attack vector from event type and metadata
      if (log.event_type?.includes('auth') || log.event_type?.includes('login')) {
        vector = log.severity === 'critical' ? 'Brute Force Attack' : 'Authentication Failure';
      } else if (log.event_type?.includes('malware') || log.tags?.includes('malware')) {
        vector = 'Malware Deployment';
      } else if (log.event_type?.includes('network') || log.normalized_fields?.protocol) {
        const proto = log.normalized_fields?.protocol?.toUpperCase();
        if (proto === 'RDP' || log.normalized_fields?.destination_port === 3389) {
          vector = 'RDP Brute Force';
        } else if (proto === 'SSH' || log.normalized_fields?.destination_port === 22) {
          vector = 'SSH Attack';
        } else {
          vector = 'Network Intrusion';
        }
      } else if (log.event_type?.includes('sql') || log.message?.toLowerCase().includes('injection')) {
        vector = 'SQL Injection';
      } else if (log.event_type?.includes('xss') || log.message?.toLowerCase().includes('script')) {
        vector = 'XSS Attack';
      } else if (log.event_type?.includes('phishing') || log.tags?.includes('phishing')) {
        vector = 'Phishing Campaign';
      } else if (log.event_type?.includes('lateral') || log.tags?.includes('lateral_movement')) {
        vector = 'Lateral Movement';
      } else if (log.event_type?.includes('privilege') || log.tags?.includes('privilege_escalation')) {
        vector = 'Privilege Escalation';
      } else if (log.event_type?.includes('exfil') || log.tags?.includes('data_exfiltration')) {
        vector = 'Data Exfiltration';
      }

      vectorMap.set(vector, (vectorMap.get(vector) || 0) + 1);
    });

    const totalEvents = filtered.length;
    
    return Array.from(vectorMap.entries())
      .map(([vector, count]) => ({
        vector,
        count,
        percentage: totalEvents > 0 ? ((count / totalEvents) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [logs, filters]);

  const getBarColor = (index) => {
    const colors = [
      '#EF4444', '#F59E0B', '#EAB308', '#3B82F6', '#8B5CF6',
      '#EC4899', '#10B981', '#14B8A6', '#F97316', '#6366F1'
    ];
    return colors[index % colors.length];
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;

    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
        <p className="font-semibold text-white mb-1">{data.vector}</p>
        <p className="text-sm text-slate-300">
          <strong>{data.count}</strong> events ({data.percentage}%)
        </p>
      </div>
    );
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-red-400" />
            Top Attack Vectors
          </CardTitle>
          
          <div className="flex gap-2">
            <Select
              value={filters.severity || 'all'}
              onValueChange={(value) => onFilterChange?.({ ...filters, severity: value })}
            >
              <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
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
                <SelectItem value="24">Last 24 Hours</SelectItem>
                <SelectItem value="168">Last 7 Days</SelectItem>
                <SelectItem value="720">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {vectorData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Target className="w-16 h-16 text-slate-600 mb-4" />
            <p className="text-slate-400">No attack vectors detected</p>
          </div>
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={vectorData} layout="horizontal" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94A3B8" />
                <YAxis 
                  type="category" 
                  dataKey="vector" 
                  stroke="#94A3B8"
                  width={150}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                  {vectorData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {vectorData.slice(0, 6).map((vector, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getBarColor(idx) }}
                    />
                    <div>
                      <p className="text-sm font-medium text-white">{vector.vector}</p>
                      <p className="text-xs text-slate-400">{vector.count} events</p>
                    </div>
                  </div>
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/50">
                    {vector.percentage}%
                  </Badge>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
              <span>Total events analyzed: {logs?.length || 0}</span>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-green-400" />
                <span>Real-time analysis</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}