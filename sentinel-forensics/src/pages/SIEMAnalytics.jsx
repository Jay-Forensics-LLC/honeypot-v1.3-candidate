
import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Database,
  Search,
  Filter,
  Activity,
  Shield,
  AlertTriangle,
  Globe,
  Clock,
  BarChart3,
  Loader2, // New Lucide icon import
  Target,   // New Lucide icon import
  Zap       // New Lucide icon import
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import LogStreamWidget from '../components/siem/LogStreamWidget';
import AlertRulesManager from '../components/siem/AlertRulesManager';
import SIEMMetricsChart from '../components/siem/SIEMMetricsChart';
import ThreatMapWidget from '../components/siem/ThreatMapWidget';
import LogCollector from '../components/siem/LogCollector';
import CriticalEventTimeline from '../components/siem/CriticalEventTimeline'; // New import
import ThreatOriginMap from '../components/siem/ThreatOriginMap';           // New import
import TopAttackVectors from '../components/siem/TopAttackVectors';         // New import
import IOCMatchBadge from '../components/siem/IOCMatchBadge';               // New import
import { correlateIOCsWithLogs } from '../functions/correlateIOCsWithLogs'; // New import
import { toast } from 'sonner'; // Assuming sonner is installed for toast notifications

export default function SIEMAnalytics() {
  const queryClient = useQueryClient(); // Initialize queryClient for invalidating queries

  const [timeRange, setTimeRange] = useState('last_24h');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterSource, setFilterSource] = useState('all');

  // New state variables for new widgets and features
  const [timelineFilters, setTimelineFilters] = useState({ severity: 'all', eventType: 'all', timeRange: 24 });
  const [mapFilters, setMapFilters] = useState({ severity: 'all', timeRange: 24 });
  const [vectorFilters, setVectorFilters] = useState({ severity: 'all', timeRange: 24 });
  const [showIOCOnly, setShowIOCOnly] = useState(false);

  // New primary query for SIEM logs, fetching a broader set for client-side filtering
  const { data: siemLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['siem-logs'], // This query fetches raw logs, filters applied in useMemo
    queryFn: async () => {
      // Fetch a larger number of recent logs to enable robust client-side filtering
      const logs = await base44.entities.SIEMLog.list('-timestamp', 500);
      return logs;
    },
    staleTime: 30000, // Data is considered fresh for 30 seconds
    refetchInterval: 60000 // Refetch every 60 seconds to keep data reasonably updated
  });

  const { data: alertRules = [] } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => base44.entities.SIEMAlertRule.filter({ enabled: true })
  });

  // Mutation for running IOC correlation
  const correlateAllMutation = useMutation({
    mutationFn: async () => {
      // Assuming correlateIOCsWithLogs returns an object with a 'data' property as per outline
      const response = await correlateIOCsWithLogs({ auto_correlate_all: true });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['siem-logs'] }); // Invalidate logs to refetch with new correlations
      toast.success('IOC Correlation Complete', {
        description: `${data.logs_matched} logs matched ${data.total_ioc_matches} IOCs`
      });
    },
    onError: (error) => {
      toast.error('Correlation failed', {
        description: error.message
      });
    }
  });

  // Combined filtering logic for all logs displayed and used by widgets
  const logsForDisplay = useMemo(() => {
    let currentLogs = siemLogs;

    // Apply IOC filter first if enabled
    if (showIOCOnly) {
      currentLogs = currentLogs.filter(log => log.threat_indicators && log.threat_indicators.length > 0);
    }

    // Apply time range filter
    const cutoffTime = getTimeRangeCutoff(timeRange);
    currentLogs = currentLogs.filter(log => new Date(log.timestamp) >= cutoffTime);

    // Apply severity filter
    if (filterSeverity !== 'all') {
      currentLogs = currentLogs.filter(log => log.severity === filterSeverity);
    }

    // Apply source type filter
    if (filterSource !== 'all') {
      currentLogs = currentLogs.filter(log => log.source_type === filterSource);
    }

    // Apply search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      currentLogs = currentLogs.filter(log =>
        log.message?.toLowerCase().includes(query) ||
        log.source_name?.toLowerCase().includes(query) ||
        log.event_type?.toLowerCase().includes(query) ||
        log.normalized_fields?.source_ip?.toLowerCase().includes(query) ||
        log.normalized_fields?.destination_ip?.toLowerCase().includes(query)
      );
    }

    return currentLogs;
  }, [siemLogs, showIOCOnly, timeRange, filterSeverity, filterSource, searchQuery]);

  // Stats are calculated based on the fully filtered logsForDisplay
  const stats = {
    total_logs: logsForDisplay.length,
    critical_logs: logsForDisplay.filter(l => l.severity === 'critical').length,
    alerts_generated: logsForDisplay.filter(l => l.alert_generated).length,
    unique_sources: new Set(logsForDisplay.map(l => l.source_id)).size,
    top_event_types: getTopEventTypes(logsForDisplay, 5),
    severity_distribution: getSeverityDistribution(logsForDisplay)
  };

  function getTimeRangeCutoff(range) {
    const now = new Date();
    switch (range) {
      case 'last_1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'last_24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'last_7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'last_30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  function getTopEventTypes(logs, limit) {
    const counts = {};
    logs.forEach(log => {
      if (log.event_type) {
        counts[log.event_type] = (counts[log.event_type] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([type, count]) => ({ type, count }));
  }

  function getSeverityDistribution(logs) {
    const dist = {
      critical: 0,
      error: 0,
      warning: 0,
      info: 0,
      debug: 0
    };

    logs.forEach(log => {
      if (log.severity && dist.hasOwnProperty(log.severity)) {
        dist[log.severity]++;
      }
    });

    return dist;
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Database className="w-8 h-8 text-blue-400" />
              SIEM Analytics
            </h1>
            <p className="text-slate-400">Security Information & Event Management</p>
          </div>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
              <Clock className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="last_1h">Last Hour</SelectItem>
              <SelectItem value="last_24h">Last 24 Hours</SelectItem>
              <SelectItem value="last_7d">Last 7 Days</SelectItem>
              <SelectItem value="last_30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Activity className="w-10 h-10 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.total_logs.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">Total Events</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.critical_logs}</p>
                  <p className="text-xs text-slate-400">Critical Events</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Shield className="w-10 h-10 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.alerts_generated}</p>
                  <p className="text-xs text-slate-400">Alerts Triggered</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Globe className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.unique_sources}</p>
                  <p className="text-xs text-slate-400">Unique Sources</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <LogCollector />

        <SIEMMetricsChart logs={logsForDisplay} timeRange={timeRange} />

        <ThreatMapWidget logs={logsForDisplay} />

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Filter className="w-5 h-5" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Search Logs</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search messages, sources..."
                    className="pl-10 bg-slate-800 border-slate-700 text-white"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-400">Severity</label>
                <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="debug">Debug</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-400">Source Type</label>
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="endpoint_agent">Endpoint Agents</SelectItem>
                    <SelectItem value="network_device">Network Devices</SelectItem>
                    <SelectItem value="application">Applications</SelectItem>
                    <SelectItem value="firewall">Firewall</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* New UI elements for IOC Correlation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowIOCOnly(!showIOCOnly)}
              variant={showIOCOnly ? 'default' : 'outline'}
              className={showIOCOnly ? 'bg-red-600 hover:bg-red-700' : 'border-slate-700 text-white'}
            >
              <Target className="w-4 h-4 mr-2" />
              {showIOCOnly ? 'Showing IOC Matches' : 'Show Only IOC Matches'}
            </Button>

            <Badge className="bg-slate-800 text-white">
              {logsForDisplay.length} logs
            </Badge>
          </div>

          <Button
            onClick={() => correlateAllMutation.mutate()}
            disabled={correlateAllMutation.isPending}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
          >
            {correlateAllMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Correlating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Run IOC Correlation
              </>
            )}
          </Button>
        </div>

        {/* NEW WIDGETS */}
        <CriticalEventTimeline
          logs={logsForDisplay}
          onFilterChange={setTimelineFilters}
          filters={timelineFilters}
        />

        <ThreatOriginMap
          logs={logsForDisplay}
          onFilterChange={setMapFilters}
          filters={mapFilters}
        />

        <TopAttackVectors
          logs={logsForDisplay}
          onFilterChange={setVectorFilters}
          filters={vectorFilters}
        />

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              Top Event Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.top_event_types.map((event, idx) => (
                <div key={event.type || idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-purple-500/20 text-purple-300">
                      #{idx + 1}
                    </Badge>
                    <span className="text-white">{event.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full"
                        style={{
                          width: `${(event.count / stats.total_logs) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-sm text-slate-300 w-16 text-right">
                      {event.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <LogStreamWidget
          logs={logsForDisplay}
          loading={logsLoading}
          onLogClick={(log) => {
            console.log('Log clicked:', log);
          }}
        />

        {/* Update log display to show IOC badges */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Security Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logsForDisplay.slice(0, 20).map((log) => (
                <div key={log.id} className="p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-white">{log.event_type}</p>
                        {log.threat_indicators && log.threat_indicators.length > 0 && (
                          <IOCMatchBadge log={log} compact />
                        )}
                        <Badge className={
                          log.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                          log.severity === 'error' ? 'bg-orange-500/20 text-orange-400' :
                          log.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }>
                          {log.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">{log.message}</p>
                      {log.normalized_fields?.source_ip && (
                        <p className="text-xs text-slate-500 mt-1">
                          Source: <code className="text-blue-400">{log.normalized_fields.source_ip}</code>
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <AlertRulesManager rules={alertRules} />
      </div>
    </div>
  );
}
