import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Activity, AlertTriangle, Shield, User, MapPin, Download, ZoomIn } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function IncidentTimelineReconstructor({ logs, securityEvents }) {
  const [focusUser, setFocusUser] = useState('all');
  const [focusEventType, setFocusEventType] = useState('all');
  const [timelineView, setTimelineView] = useState('chronological');

  // Combine and sort all events chronologically
  const timeline = useMemo(() => {
    const combined = [
      ...logs.map(log => ({
        ...log,
        type: 'audit_log',
        displayTime: parseISO(log.timestamp)
      })),
      ...securityEvents.map(event => ({
        ...event,
        type: 'security_event',
        displayTime: parseISO(event.timestamp)
      }))
    ].sort((a, b) => b.displayTime - a.displayTime);

    // Apply filters
    let filtered = combined;
    if (focusUser !== 'all') {
      filtered = filtered.filter(e => e.user_id === focusUser || e.user_email === focusUser);
    }
    if (focusEventType !== 'all') {
      filtered = filtered.filter(e => e.event_type === focusEventType);
    }

    return filtered;
  }, [logs, securityEvents, focusUser, focusEventType]);

  // Get unique users and event types
  const users = useMemo(() => {
    const userSet = new Set([
      ...logs.map(l => l.user_id).filter(Boolean),
      ...securityEvents.map(e => e.user_email).filter(Boolean)
    ]);
    return ['all', ...Array.from(userSet).sort()];
  }, [logs, securityEvents]);

  const eventTypes = useMemo(() => {
    const typeSet = new Set([
      ...logs.map(l => l.event_type),
      ...securityEvents.map(e => e.event_type)
    ]);
    return ['all', ...Array.from(typeSet).sort()];
  }, [logs, securityEvents]);

  // Group by time buckets for pattern detection
  const patternAnalysis = useMemo(() => {
    const buckets = {};
    timeline.forEach(event => {
      const bucket = format(event.displayTime, 'yyyy-MM-dd HH:00');
      if (!buckets[bucket]) buckets[bucket] = [];
      buckets[bucket].push(event);
    });

    return Object.entries(buckets)
      .map(([time, events]) => ({
        time,
        count: events.length,
        critical: events.filter(e => e.severity === 'critical').length,
        failed: events.filter(e => e.success === false).length
      }))
      .sort((a, b) => b.time.localeCompare(a.time));
  }, [timeline]);

  const exportTimeline = () => {
    const csv = [
      ['Timestamp', 'Type', 'Event', 'Severity', 'User', 'IP', 'Success', 'Description'].join(','),
      ...timeline.map(event => [
        format(event.displayTime, 'yyyy-MM-dd HH:mm:ss.SSS'),
        event.type,
        event.event_type,
        event.severity || 'N/A',
        event.user_id || event.user_email || 'N/A',
        event.ip_address || 'N/A',
        event.success !== undefined ? event.success : 'N/A',
        `"${(event.description || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-timeline-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="grid lg:grid-cols-4 gap-4">
            <Select value={focusUser} onValueChange={setFocusUser}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Filter by User" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 max-h-64">
                {users.map(user => (
                  <SelectItem key={user} value={user}>
                    {user === 'all' ? 'All Users' : user}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={focusEventType} onValueChange={setFocusEventType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Event Type" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 max-h-64">
                {eventTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type === 'all' ? 'All Events' : type.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={timelineView} onValueChange={setTimelineView}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="chronological">Chronological</SelectItem>
                <SelectItem value="grouped">Grouped by Hour</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={exportTimeline}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Timeline
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pattern Analysis */}
      {timelineView === 'grouped' && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              Temporal Pattern Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {patternAnalysis.slice(0, 24).map((bucket) => (
                <div key={bucket.time} className="flex items-center gap-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white font-medium">{bucket.time}</span>
                      <div className="flex gap-2">
                        <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                          {bucket.count} events
                        </Badge>
                        {bucket.critical > 0 && (
                          <Badge className="bg-red-500/20 text-red-400 text-xs">
                            {bucket.critical} critical
                          </Badge>
                        )}
                        {bucket.failed > 0 && (
                          <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                            {bucket.failed} failed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${Math.min(100, (bucket.count / 50) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-400" />
            Incident Timeline ({timeline.length} events)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-500 via-blue-500 to-transparent" />
            
            <div className="space-y-4">
              {timeline.map((event, idx) => (
                <div key={idx} className="relative pl-16">
                  {/* Timeline dot */}
                  <div className={`absolute left-4 top-4 w-4 h-4 rounded-full border-2 ${
                    event.severity === 'critical' ? 'bg-red-500 border-red-400' :
                    event.severity === 'high' ? 'bg-orange-500 border-orange-400' :
                    event.severity === 'warning' ? 'bg-yellow-500 border-yellow-400' :
                    'bg-blue-500 border-blue-400'
                  }`} />

                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-purple-500/50 transition-all">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={
                          event.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                          event.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          event.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }>
                          {event.severity || 'info'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {event.event_type.replace(/_/g, ' ')}
                        </Badge>
                        {event.success === false && (
                          <Badge className="bg-red-500/20 text-red-400 text-xs">Failed</Badge>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {format(event.displayTime, 'MMM d, HH:mm:ss.SSS')}
                      </span>
                    </div>

                    <p className="text-white text-sm mb-3">{event.description}</p>

                    <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                      {(event.user_id || event.user_email) && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {event.user_id || event.user_email}
                        </div>
                      )}
                      {event.ip_address && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {event.ip_address}
                        </div>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {event.type === 'audit_log' ? 'Audit Log' : 'Security Event'}
                      </Badge>
                    </div>

                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer text-slate-400 hover:text-white">
                          View Metadata
                        </summary>
                        <pre className="mt-2 p-2 bg-slate-900/50 rounded text-slate-300 overflow-auto">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}