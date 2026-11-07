import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import moment from 'moment';

export default function SIEMMetricsChart({ logs, timeRange }) {
  const chartData = useMemo(() => {
    // Group logs by time buckets
    const buckets = {};
    const bucketSize = timeRange === 'last_1h' ? 5 : // 5 minutes
                       timeRange === 'last_24h' ? 60 : // 1 hour
                       timeRange === 'last_7d' ? 360 : // 6 hours
                       1440; // 24 hours for 30d

    logs.forEach(log => {
      const timestamp = moment(log.timestamp);
      const bucketKey = timestamp.startOf('minute').valueOf();
      const roundedBucket = Math.floor(bucketKey / (bucketSize * 60000)) * (bucketSize * 60000);

      if (!buckets[roundedBucket]) {
        buckets[roundedBucket] = {
          time: roundedBucket,
          total: 0,
          critical: 0,
          error: 0,
          warning: 0,
          info: 0
        };
      }

      buckets[roundedBucket].total++;
      buckets[roundedBucket][log.severity] = (buckets[roundedBucket][log.severity] || 0) + 1;
    });

    return Object.values(buckets)
      .sort((a, b) => a.time - b.time)
      .map(bucket => ({
        ...bucket,
        time: moment(bucket.time).format(
          timeRange === 'last_1h' ? 'HH:mm' :
          timeRange === 'last_24h' ? 'HH:mm' :
          'MMM DD HH:mm'
        )
      }));
  }, [logs, timeRange]);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <TrendingUp className="w-5 h-5 text-green-400" />
          Event Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="time" 
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8' }}
            />
            <YAxis 
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#fff'
              }}
            />
            <Legend 
              wrapperStyle={{ color: '#94a3b8' }}
            />
            <Line 
              type="monotone" 
              dataKey="critical" 
              stroke="#ef4444" 
              strokeWidth={2}
              name="Critical"
            />
            <Line 
              type="monotone" 
              dataKey="error" 
              stroke="#f97316" 
              strokeWidth={2}
              name="Error"
            />
            <Line 
              type="monotone" 
              dataKey="warning" 
              stroke="#eab308" 
              strokeWidth={2}
              name="Warning"
            />
            <Line 
              type="monotone" 
              dataKey="info" 
              stroke="#3b82f6" 
              strokeWidth={2}
              name="Info"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}