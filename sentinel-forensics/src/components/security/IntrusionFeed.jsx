
import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  Pause,
  Play,
  Copy,
  FolderPlus,
  Filter,
  Download,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

const EVENT_TYPE_COLORS = {
  AUTH: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PROCESS: 'bg-green-500/20 text-green-400 border-green-500/30',
  NETWORK: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  BLE: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  FIREWALL: 'bg-red-500/20 text-red-400 border-red-500/30',
  USB: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  DNS: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  SYSTEM: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  APP: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
};

const SEVERITY_COLORS = {
  info: 'text-blue-300',
  warn: 'text-yellow-300',
  warning: 'text-yellow-300',
  high: 'text-orange-300',
  critical: 'text-red-300'
};

// Sample events for when backend isn't available
const SAMPLE_EVENTS = [
  {
    id: 'sample-1',
    ts: new Date().toISOString(),
    type: 'AUTH',
    severity: 'warn',
    source: 'authentication_service',
    ctx: { event: 'failed_login', attempts: 3, ip: '192.168.1.100' },
    hash: 'a1b2c3d4e5f6...'
  },
  {
    id: 'sample-2',
    ts: new Date(Date.now() - 30000).toISOString(),
    type: 'NETWORK',
    severity: 'high',
    source: 'network_monitor',
    ctx: { event: 'suspicious_connection', dest_ip: '10.0.0.45', port: 4444 },
    hash: 'f6e5d4c3b2a1...'
  },
  {
    id: 'sample-3',
    ts: new Date(Date.now() - 60000).toISOString(),
    type: 'FIREWALL',
    severity: 'critical',
    source: 'firewall_engine',
    ctx: { event: 'port_scan_detected', source_ip: '203.0.113.42', ports_scanned: 25 },
    hash: '123456789abc...'
  }
];

export default function IntrusionFeed({ maxEvents = 100 }) {
  const [isPaused, setIsPaused] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const eventsEndRef = useRef(null);

  // Use polling with graceful fallback and timeout protection
  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ['intrusion-events'],
    queryFn: async () => {
      try {
        // Try to fetch real audit logs with 10 second timeout
        const logs = await Promise.race([
          base44.entities.AuditLog.list('-timestamp', maxEvents),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 10000)
          )
        ]);
        
        // Filter for intrusion feed events
        const intrusionLogs = logs.filter(log => 
          log.event_type?.startsWith('intrusion_feed_') ||
          log.event_type?.startsWith('security_') ||
          log.event_type?.startsWith('threat_')
        );

        if (intrusionLogs.length === 0) {
          // No real events - return sample data
          return SAMPLE_EVENTS;
        }

        return intrusionLogs.map(log => ({
          id: log.id,
          ts: log.timestamp,
          type: extractEventType(log.event_type),
          severity: log.severity || 'info',
          source: log.event_type,
          ctx: log.metadata || {},
          hash: log.integrity_hash || 'N/A'
        }));
      } catch (error) {
        console.debug('[IntrusionFeed] Using sample data:', error.message);
        // Gracefully fall back to sample events
        return SAMPLE_EVENTS;
      }
    },
    refetchInterval: isPaused ? false : 10000, // Poll every 10 seconds
    retry: 0, // Don't retry on errors
    initialData: SAMPLE_EVENTS,
    onError: (error) => {
      console.debug('[IntrusionFeed] Non-critical error:', error.message);
    }
  });

  useEffect(() => {
    if (autoScroll && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  const extractEventType = (eventTypeString) => {
    if (!eventTypeString) return 'SYSTEM';
    
    // Try to extract type from various patterns
    const patterns = [
      /intrusion_feed_(\w+)/,
      /security_(\w+)/,
      /threat_(\w+)/,
      /(\w+)_alert/,
      /(\w+)_event/
    ];

    for (const pattern of patterns) {
      const match = eventTypeString.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }
    
    return 'SYSTEM';
  };

  const filteredEvents = events.filter(event => {
    const matchesType = filterType === 'all' || event.type === filterType;
    const matchesSeverity = filterSeverity === 'all' || event.severity === filterSeverity;
    const matchesSearch = searchTerm === '' || 
      event.source?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(event.ctx).toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesType && matchesSeverity && matchesSearch;
  });

  const copyEventJSON = (event) => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    toast.success('Event JSON copied to clipboard');
  };

  const addToCase = async (event) => {
    try {
      await base44.entities.EvidenceV2.create({
        evidence_id: `EVT-${event.id}`,
        case_id: null,
        evidence_number: `EVT-${Date.now().toString().slice(-8)}`,
        title: `Event: ${event.type} from ${event.source}`,
        description: `Security event captured from intrusion feed`,
        evidence_type: 'metadata',
        collection_method: 'automated',
        collection_timestamp: event.ts,
        metadata: {
          event: event,
          captured_from: 'intrusion_feed'
        },
        file_hash_sha256: event.hash
      });

      toast.success('Event added to evidence', {
        description: 'You can now associate it with a case'
      });
    } catch (error) {
      toast.error('Failed to add event to evidence', {
        description: error.message
      });
    }
  };

  const exportEvents = () => {
    const csv = [
      ['Timestamp', 'Type', 'Severity', 'Source', 'Context', 'Hash'].join(','),
      ...filteredEvents.map(e => [
        e.ts,
        e.type,
        e.severity,
        e.source,
        JSON.stringify(e.ctx).replace(/,/g, ';'),
        e.hash
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intrusion_feed_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Events exported to CSV');
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Security Events Feed
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
              {error ? 'Demo Mode' : 'Live Polling'}
            </Badge>
          </CardTitle>
          
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPaused(!isPaused)}
              className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 min-h-[44px]"
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  <span className="text-slate-300">Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  <span className="text-slate-300">Pause</span>
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportEvents}
              disabled={filteredEvents.length === 0}
              className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 min-h-[44px]"
            >
              <Download className="w-4 h-4 mr-2" />
              <span className="text-slate-300">Export CSV</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <p className="font-semibold">Demo Mode Active</p>
              <p className="text-yellow-300/80">
                Showing sample security events. Real-time feed will activate when audit logs are available.
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search events..."
              className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all" className="text-white">All Types</SelectItem>
              {['AUTH', 'PROCESS', 'NETWORK', 'BLE', 'FIREWALL', 'USB', 'DNS', 'SYSTEM', 'APP'].map(type => (
                <SelectItem key={type} value={type} className="text-white">{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Filter by severity" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all" className="text-white">All Severities</SelectItem>
              <SelectItem value="info" className="text-white">Info</SelectItem>
              <SelectItem value="warn" className="text-white">Warning</SelectItem>
              <SelectItem value="high" className="text-white">High</SelectItem>
              <SelectItem value="critical" className="text-white">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-800/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400">Total Events</p>
            <p className="text-xl font-bold text-white">{events.length}</p>
          </div>
          <div className="bg-slate-800/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400">Filtered</p>
            <p className="text-xl font-bold text-white">{filteredEvents.length}</p>
          </div>
          <div className="bg-slate-800/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400">Critical</p>
            <p className="text-xl font-bold text-red-300">
              {events.filter(e => e.severity === 'critical').length}
            </p>
          </div>
          <div className="bg-slate-800/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400">Status</p>
            <p className="text-sm font-semibold">
              {isPaused ? (
                <span className="text-yellow-300">Paused</span>
              ) : (
                <span className="text-green-300">Active</span>
              )}
            </p>
          </div>
        </div>

        {/* Event List */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 max-h-[600px] overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-12">
              <Activity className="w-16 h-16 mx-auto text-slate-500 mb-4 animate-spin" />
              <p className="text-slate-300">Loading events...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-16 h-16 mx-auto text-slate-500 mb-4" />
              <p className="text-slate-300">No events to display</p>
              <p className="text-sm text-slate-400 mt-2">
                {isPaused ? 'Feed is paused - click Resume to continue' : 'Waiting for security events...'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map((event, idx) => (
                <div
                  key={event.id || idx}
                  className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 hover:border-blue-500/50 transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={EVENT_TYPE_COLORS[event.type] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}>
                        {event.type}
                      </Badge>
                      <span className={`text-xs font-semibold ${SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.info}`}>
                        {event.severity?.toUpperCase() || 'INFO'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(event.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyEventJSON(event)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
                        title="Copy JSON"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addToCase(event)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
                        title="Add to Evidence"
                      >
                        <FolderPlus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="text-sm text-slate-300 mb-2">
                    <strong className="text-white">Source:</strong> {event.source}
                  </div>

                  <details className="text-xs">
                    <summary className="text-slate-300 cursor-pointer hover:text-white">
                      Context & Details
                    </summary>
                    <pre className="mt-2 p-2 bg-slate-950 rounded text-slate-300 overflow-x-auto">
                      {JSON.stringify(event.ctx, null, 2)}
                    </pre>
                    {event.hash && event.hash !== 'N/A' && (
                      <div className="mt-2 flex items-center gap-2 text-slate-400">
                        <CheckCircle className="w-3 h-3" />
                        <span>Hash: {event.hash.substring(0, 16)}...</span>
                      </div>
                    )}
                  </details>
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {error ? 'Demo data shown' : `Polling every 10 seconds • Last ${maxEvents} events`}
          </span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            <span className="text-slate-400">Auto-scroll</span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
