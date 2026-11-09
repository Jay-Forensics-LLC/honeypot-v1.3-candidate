import { Card, CardContent } from '@/components/ui/card';
import { 
  TrendingUp, 
  Activity,
  Shield,
  AlertTriangle 
} from 'lucide-react';

export default function EventStats({ events = [] }) {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const stats = {
    total: events.length,
    lastHour: events.filter(e => new Date(e.ts).getTime() > oneHourAgo).length,
    lastDay: events.filter(e => new Date(e.ts).getTime() > oneDayAgo).length,
    critical: events.filter(e => e.severity === 'critical').length,
    high: events.filter(e => e.severity === 'high').length,
    byType: {}
  };

  // Count by type
  events.forEach(e => {
    stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
  });

  const topType = Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400">Last Hour</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.lastHour}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">Active</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-slate-400">Last 24h</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.lastDay}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-slate-400">
              {((stats.lastHour / stats.lastDay) * 100).toFixed(0)}% recent
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-slate-400">Critical</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{stats.critical}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-orange-400">
              +{stats.high} high
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-xs text-slate-400">Top Type</span>
          </div>
          <p className="text-lg font-bold text-white">
            {topType ? topType[0] : 'N/A'}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-slate-400">
              {topType ? topType[1] : 0} events
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}