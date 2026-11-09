import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, MapPin, Calendar, Hash } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AnomalyHeatmap() {
  const [timeRange, setTimeRange] = useState('7d');
  const [heatmapType, setHeatmapType] = useState('ioc');

  const { data: indicators = [] } = useQuery({
    queryKey: ['ioc-indicators-heatmap', timeRange],
    queryFn: async () => {
      const days = parseInt(timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      try {
        const allIndicators = await base44.entities.IOCIndicator.list('-last_seen');
        return allIndicators.filter(i => new Date(i.last_seen) >= cutoff);
      } catch {
        return [];
      }
    },
    initialData: []
  });

  const { data: bleDevices = [] } = useQuery({
    queryKey: ['ble-devices-heatmap', timeRange],
    queryFn: async () => {
      const days = parseInt(timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      try {
        const allDevices = await base44.entities.BLEDevice.list('-last_seen');
        return allDevices.filter(d => new Date(d.last_seen) >= cutoff);
      } catch {
        return [];
      }
    },
    enabled: heatmapType === 'ble',
    initialData: []
  });

  // Generate heatmap data
  const generateHeatmap = () => {
    const data = heatmapType === 'ioc' ? indicators : bleDevices;
    const heatmap = {};

    data.forEach(item => {
      const date = new Date(item.last_seen || item.created_date).toISOString().split('T')[0];
      const location = item.metadata?.location || 'Unknown';
      const key = `${date}-${location}`;

      if (!heatmap[key]) {
        heatmap[key] = {
          date,
          location,
          count: 0,
          items: []
        };
      }

      heatmap[key].count++;
      heatmap[key].items.push(item);
    });

    return Object.values(heatmap).sort((a, b) => b.count - a.count);
  };

  const heatmapData = generateHeatmap();
  const maxCount = Math.max(...heatmapData.map(d => d.count), 1);

  const getHeatColor = (count) => {
    const intensity = count / maxCount;
    if (intensity > 0.7) return 'bg-red-500/80';
    if (intensity > 0.4) return 'bg-orange-500/60';
    if (intensity > 0.2) return 'bg-yellow-500/40';
    return 'bg-blue-500/20';
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Anomaly Heatmap</h1>
        <p className="text-slate-400">Visualize threat recurrence patterns over time and location</p>
      </div>

      <div className="flex gap-4">
        <Select value={heatmapType} onValueChange={setHeatmapType}>
          <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-white">
            <SelectItem value="ioc">IOC Indicators</SelectItem>
            <SelectItem value="ble">BLE Devices</SelectItem>
          </SelectContent>
        </Select>

        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-white">
            <SelectItem value="7">Last 7 Days</SelectItem>
            <SelectItem value="30">Last 30 Days</SelectItem>
            <SelectItem value="90">Last 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Recurrence Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          {heatmapData.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              No data in selected time range
            </div>
          ) : (
            <div className="grid gap-2">
              {heatmapData.map((cell, idx) => (
                <div
                  key={idx}
                  className={`${getHeatColor(cell.count)} p-4 rounded-lg border border-slate-700`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Calendar className="w-5 h-5 text-white" />
                      <div>
                        <p className="text-white font-semibold">{cell.date}</p>
                        <p className="text-xs text-slate-300 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {cell.location}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-white/20 text-white">
                      <Hash className="w-3 h-3 mr-1" />
                      {cell.count} detections
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}