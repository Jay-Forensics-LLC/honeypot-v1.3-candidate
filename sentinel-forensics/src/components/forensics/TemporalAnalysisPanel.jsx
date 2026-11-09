import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Clock, Activity, AlertTriangle } from 'lucide-react';
import { format, parseISO, startOfHour, differenceInMinutes } from 'date-fns';

export default function TemporalAnalysisPanel({ logs }) {
  // Hourly distribution
  const hourlyData = useMemo(() => {
    const buckets = {};
    logs.forEach(log => {
      const hour = format(startOfHour(parseISO(log.timestamp)), 'MMM d, HH:00');
      if (!buckets[hour]) {
        buckets[hour] = { hour, total: 0, critical: 0, high: 0, warning: 0, failed: 0 };
      }
      buckets[hour].total++;
      if (log.severity === 'critical') buckets[hour].critical++;
      if (log.severity === 'high') buckets[hour].high++;
      if (log.severity === 'warning') buckets[hour].warning++;
      if (log.success === false) buckets[hour].failed++;
    });

    return Object.values(buckets).sort((a, b) => 
      new Date(a.hour).getTime() - new Date(b.hour).getTime()
    ).slice(-24);
  }, [logs]);

  // Event type distribution
  const eventTypeData = useMemo(() => {
    const distribution = {};
    logs.forEach(log => {
      const type = log.event_type;
      distribution[type] = (distribution[type] || 0) + 1;
    });

    return Object.entries(distribution)
      .map(([type, count]) => ({ type: type.replace(/_/g, ' '), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [logs]);

  // Velocity analysis - events per minute
  const velocityAnalysis = useMemo(() => {
    if (logs.length < 2) return { avg: 0, max: 0, spikes: [] };

    const sortedLogs = [...logs].sort((a, b) => 
      parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime()
    );

    const intervals = [];
    for (let i = 1; i < sortedLogs.length; i++) {
      const diff = differenceInMinutes(
        parseISO(sortedLogs[i].timestamp),
        parseISO(sortedLogs[i - 1].timestamp)
      );
      if (diff > 0) intervals.push(1 / diff); // events per minute
    }

    const avg = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const max = Math.max(...intervals);
    
    // Detect spikes (3x average)
    const threshold = avg * 3;
    const spikes = intervals.filter(v => v > threshold).length;

    return { avg: avg.toFixed(2), max: max.toFixed(2), spikes };
  }, [logs]);

  // User activity patterns
  const userActivity = useMemo(() => {
    const users = {};
    logs.forEach(log => {
      const user = log.user_id || 'system';
      if (!users[user]) {
        users[user] = { user, total: 0, critical: 0, failed: 0 };
      }
      users[user].total++;
      if (log.severity === 'critical') users[user].critical++;
      if (log.success === false) users[user].failed++;
    });

    return Object.values(users)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* Velocity Metrics */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-8 h-8 text-blue-400" />
            </div>
            <p className="text-3xl font-bold text-white">{velocityAnalysis.avg}</p>
            <p className="text-sm text-slate-400">Avg Events/Min</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-3xl font-bold text-white">{velocityAnalysis.max}</p>
            <p className="text-sm text-slate-400">Peak Events/Min</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="w-8 h-8 text-orange-400" />
            </div>
            <p className="text-3xl font-bold text-white">{velocityAnalysis.spikes}</p>
            <p className="text-sm text-slate-400">Activity Spikes</p>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Event Distribution */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            24-Hour Event Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={hourlyData}>
              <defs>
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="criticalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" stroke="#94A3B8" style={{ fontSize: '11px' }} />
              <YAxis stroke="#94A3B8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#E2E8F0' }}
              />
              <Legend />
              <Area type="monotone" dataKey="total" stroke="#3B82F6" fillOpacity={1} fill="url(#totalGradient)" name="Total Events" />
              <Area type="monotone" dataKey="critical" stroke="#EF4444" fillOpacity={1} fill="url(#criticalGradient)" name="Critical" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Event Type Distribution */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Top Event Types</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={eventTypeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#94A3B8" />
              <YAxis dataKey="type" type="category" stroke="#94A3B8" width={150} style={{ fontSize: '11px' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#E2E8F0' }}
              />
              <Bar dataKey="count" fill="#8B5CF6" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* User Activity */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">User Activity Patterns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {userActivity.map((user) => (
              <div key={user.user} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white">{user.user}</span>
                    <div className="flex gap-2">
                      <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                        {user.total} events
                      </Badge>
                      {user.critical > 0 && (
                        <Badge className="bg-red-500/20 text-red-400 text-xs">
                          {user.critical} critical
                        </Badge>
                      )}
                      {user.failed > 0 && (
                        <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                          {user.failed} failed
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      style={{ width: `${Math.min(100, (user.total / logs.length) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}