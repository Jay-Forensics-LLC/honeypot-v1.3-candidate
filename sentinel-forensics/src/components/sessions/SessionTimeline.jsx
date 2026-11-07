import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Activity, 
  Calendar, 
  CheckCircle, 
  XCircle,
  TrendingUp
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function SessionTimeline() {
  const [timeRange, setTimeRange] = useState('7d');
  const [viewMode, setViewMode] = useState('timeline');

  const { data: automationLogs = [] } = useQuery({
    queryKey: ['automation-logs', timeRange],
    queryFn: async () => {
      const logs = await base44.entities.AuditLog.list('-timestamp', 500);
      
      // Filter for automation/rule events
      return logs.filter(log => 
        log.event_type?.includes('automation') || 
        log.event_type?.includes('rule') ||
        log.event_type?.includes('scan')
      );
    },
    initialData: []
  });

  // Process data for visualizations
  const timelineData = automationLogs.reduce((acc, log) => {
    const date = format(parseISO(log.timestamp || log.created_date), 'MMM dd');
    
    if (!acc[date]) {
      acc[date] = { date, success: 0, failure: 0, total: 0 };
    }
    
    acc[date].total++;
    if (log.success) {
      acc[date].success++;
    } else {
      acc[date].failure++;
    }
    
    return acc;
  }, {});

  const chartData = Object.values(timelineData).slice(-14); // Last 14 days

  // Event type distribution
  const eventTypes = automationLogs.reduce((acc, log) => {
    const type = log.event_type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(eventTypes).map(([name, value]) => ({ name, value }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  // Success rate over time
  const successRate = chartData.map(d => ({
    date: d.date,
    rate: d.total > 0 ? Math.round((d.success / d.total) * 100) : 0
  }));

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Automation & Rule Timeline
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={timeRange === '24h' ? 'default' : 'outline'}
                onClick={() => setTimeRange('24h')}
              >
                24h
              </Button>
              <Button
                size="sm"
                variant={timeRange === '7d' ? 'default' : 'outline'}
                onClick={() => setTimeRange('7d')}
              >
                7d
              </Button>
              <Button
                size="sm"
                variant={timeRange === '30d' ? 'default' : 'outline'}
                onClick={() => setTimeRange('30d')}
              >
                30d
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <Activity className="w-8 h-8 text-blue-400 mb-2" />
              <p className="text-2xl font-bold text-white">{automationLogs.length}</p>
              <p className="text-xs text-slate-400">Total Events</p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {automationLogs.filter(l => l.success).length}
              </p>
              <p className="text-xs text-slate-400">Successful</p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <XCircle className="w-8 h-8 text-red-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {automationLogs.filter(l => !l.success).length}
              </p>
              <p className="text-xs text-slate-400">Failed</p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <TrendingUp className="w-8 h-8 text-purple-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {automationLogs.length > 0 
                  ? Math.round((automationLogs.filter(l => l.success).length / automationLogs.length) * 100)
                  : 0}%
              </p>
              <p className="text-xs text-slate-400">Success Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visualizations */}
      <Tabs value={viewMode} onValueChange={setViewMode}>
        <TabsList className="bg-slate-900/50">
          <TabsTrigger value="timeline">Timeline View</TabsTrigger>
          <TabsTrigger value="charts">Charts & Analytics</TabsTrigger>
          <TabsTrigger value="events">Event List</TabsTrigger>
        </TabsList>

        {/* Timeline View */}
        <TabsContent value="timeline">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle>Execution Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #475569',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="success" stackId="a" fill="#10b981" name="Success" />
                  <Bar dataKey="failure" stackId="a" fill="#ef4444" name="Failure" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Charts View */}
        <TabsContent value="charts" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Success Rate Trend */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle>Success Rate Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={successRate}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #475569',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="rate" 
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      name="Success Rate (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Event Type Distribution */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle>Event Type Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #475569',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Event List */}
        <TabsContent value="events">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle>Recent Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {automationLogs.slice(0, 50).map((log, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-slate-800/30 rounded border border-slate-700"
                  >
                    <div className="flex-shrink-0 mt-1">
                      {log.success ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white mb-1">{log.description}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{log.event_type}</span>
                        <span>•</span>
                        <span>{format(parseISO(log.timestamp || log.created_date), 'PPp')}</span>
                      </div>
                    </div>

                    <Badge className={log.severity === 'critical' || log.severity === 'error' ? 'bg-red-500' : 'bg-blue-500'}>
                      {log.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info */}
      <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500">
        <div className="flex items-start gap-3 text-sm text-purple-400">
          <Calendar className="w-5 h-5 mt-0.5" />
          <div>
            <strong>Session Timeline:</strong> Visualize the execution history of all automations and rules. 
            Track success rates, identify patterns, and troubleshoot failures with detailed analytics.
          </div>
        </div>
      </div>
    </div>
  );
}