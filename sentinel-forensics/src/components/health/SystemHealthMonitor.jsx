import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Cpu,
  HardDrive,
  Wifi,
  Database,
  Clock,
  TrendingUp,
  CheckCircle
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function SystemHealthMonitor() {
  const [metrics, setMetrics] = useState({
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    latency: 0
  });

  const [history, setHistory] = useState([]);
  const [overallHealth, setOverallHealth] = useState(100);

  useEffect(() => {
    const updateMetrics = () => {
      // Simulate system metrics (in production, get from actual system APIs)
      const newMetrics = {
        cpu: Math.floor(Math.random() * 40) + 20,
        memory: Math.floor(Math.random() * 30) + 40,
        disk: Math.floor(Math.random() * 20) + 50,
        network: Math.floor(Math.random() * 50) + 10,
        latency: Math.floor(Math.random() * 50) + 10,
        timestamp: new Date().toLocaleTimeString()
      };

      setMetrics(newMetrics);
      setHistory(prev => [...prev.slice(-20), newMetrics]);

      // Calculate overall health
      const health = 100 - Math.max(
        newMetrics.cpu * 0.3,
        newMetrics.memory * 0.3,
        newMetrics.disk * 0.2,
        newMetrics.latency * 0.2
      );
      setOverallHealth(Math.round(health));
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 2000);

    return () => clearInterval(interval);
  }, []);

  const getHealthStatus = () => {
    if (overallHealth >= 90) return { status: 'Excellent', color: 'text-green-400', bg: 'bg-green-500' };
    if (overallHealth >= 70) return { status: 'Good', color: 'text-blue-400', bg: 'bg-blue-500' };
    if (overallHealth >= 50) return { status: 'Warning', color: 'text-yellow-400', bg: 'bg-yellow-500' };
    return { status: 'Critical', color: 'text-red-400', bg: 'bg-red-500' };
  };

  const healthStatus = getHealthStatus();

  return (
    <div className="space-y-6">
      {/* Overall Health */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className={`w-5 h-5 ${healthStatus.color}`} />
              System Health
            </div>
            <Badge className={`${healthStatus.bg} text-white`}>
              {healthStatus.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Overall Score</span>
              <span className={`text-3xl font-bold ${healthStatus.color}`}>
                {overallHealth}%
              </span>
            </div>
            <Progress value={overallHealth} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* CPU Usage */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-400" />
                <span className="text-sm text-slate-400">CPU</span>
              </div>
              <span className="text-xl font-bold text-white">{metrics.cpu}%</span>
            </div>
            <Progress value={metrics.cpu} className="h-2" />
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-400" />
                <span className="text-sm text-slate-400">Memory</span>
              </div>
              <span className="text-xl font-bold text-white">{metrics.memory}%</span>
            </div>
            <Progress value={metrics.memory} className="h-2" />
          </CardContent>
        </Card>

        {/* Disk Usage */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-purple-400" />
                <span className="text-sm text-slate-400">Disk</span>
              </div>
              <span className="text-xl font-bold text-white">{metrics.disk}%</span>
            </div>
            <Progress value={metrics.disk} className="h-2" />
          </CardContent>
        </Card>

        {/* Network Activity */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wifi className="w-5 h-5 text-orange-400" />
                <span className="text-sm text-slate-400">Network</span>
              </div>
              <span className="text-xl font-bold text-white">{metrics.network} MB/s</span>
            </div>
            <Progress value={metrics.network} className="h-2" />
          </CardContent>
        </Card>

        {/* Latency */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-400" />
                <span className="text-sm text-slate-400">Latency</span>
              </div>
              <span className="text-xl font-bold text-white">{metrics.latency} ms</span>
            </div>
            <div className={`text-xs ${metrics.latency < 50 ? 'text-green-400' : 'text-yellow-400'}`}>
              {metrics.latency < 50 ? 'Excellent' : 'Moderate'}
            </div>
          </CardContent>
        </Card>

        {/* Database Status */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-pink-400" />
                <span className="text-sm text-slate-400">Database</span>
              </div>
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-xs text-green-400">Connected</div>
          </CardContent>
        </Card>
      </div>

      {/* Performance History Chart */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Performance History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} name="CPU" />
              <Line type="monotone" dataKey="memory" stroke="#10b981" strokeWidth={2} dot={false} name="Memory" />
              <Line type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={2} dot={false} name="Latency" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-400 mb-1">Platform</p>
              <p className="text-white font-semibold">{navigator.platform}</p>
            </div>
            <div>
              <p className="text-slate-400 mb-1">Browser</p>
              <p className="text-white font-semibold">{navigator.userAgent.match(/Firefox|Chrome|Safari|Edge/)?.[0] || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-slate-400 mb-1">Screen</p>
              <p className="text-white font-semibold">{window.screen.width} x {window.screen.height}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}