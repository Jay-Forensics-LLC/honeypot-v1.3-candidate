import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  AlertTriangle, 
  Shield, 
  Network, 
  Database,
  Clock,
  Filter,
  RefreshCw
} from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { format } from 'date-fns';
import { resilientAPI } from '../utils/ResilientAPIClient';

/**
 * LIVE ACTIVITY FEED
 * Real-time security event stream across multiple data sources
 */
export default function LiveActivityFeed({ organizationId }) {
  const [events, setEvents] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchEvents = async () => {
    if (!organizationId) return;

    setIsRefreshing(true);
    try {
      // Fetch from multiple sources in parallel
      const [alerts, auditLogs, securityEvents] = await Promise.all([
        resilientAPI.filterEntity(
          'Alert',
          { organization_id: organizationId },
          '-detection_timestamp',
          10,
          0,
          8000
        ).catch(() => []),
        
        resilientAPI.filterEntity(
          'SentinelAuditLog',
          { organization_id: organizationId },
          '-timestamp',
          10,
          0,
          8000
        ).catch(() => []),
        
        resilientAPI.filterEntity(
          'SecurityEvent',
          { organization_id: organizationId },
          '-detection_timestamp',
          10,
          0,
          8000
        ).catch(() => [])
      ]);

      // Normalize events from different sources
      const normalized = [
        ...(alerts || []).map(a => ({
          id: a.id,
          type: 'alert',
          title: a.title,
          description: a.description,
          severity: a.severity,
          timestamp: a.detection_timestamp || a.created_date,
          source: a.source || 'Alert System',
          metadata: { alert_type: a.alert_type }
        })),
        ...(auditLogs || []).map(a => ({
          id: a.id,
          type: 'audit',
          title: a.action,
          description: a.description || a.action,
          severity: a.severity || 'info',
          timestamp: a.timestamp,
          source: 'Audit Log',
          metadata: { resource_type: a.resource_type }
        })),
        ...(securityEvents || []).map(e => ({
          id: e.id,
          type: 'security_event',
          title: e.event_type,
          description: `Security event detected on device ${e.device_id}`,
          severity: e.severity,
          timestamp: e.detection_timestamp,
          source: 'Security Monitor',
          metadata: { event_type: e.event_type }
        }))
      ];

      // Sort by timestamp descending
      normalized.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );

      setEvents(normalized.slice(0, 50)); // Keep only 50 most recent
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch activity feed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchEvents();
    
    // Poll every 15 seconds
    const interval = setInterval(fetchEvents, 15000);
    
    return () => clearInterval(interval);
  }, [organizationId]);

  // Apply filters
  const filteredEvents = events.filter(event => {
    const typeMatch = filterType === 'all' || event.type === filterType;
    const severityMatch = filterSeverity === 'all' || event.severity === filterSeverity;
    return typeMatch && severityMatch;
  });

  const getEventIcon = (type) => {
    const icons = {
      alert: AlertTriangle,
      audit: Shield,
      security_event: Activity,
      network: Network
    };
    return icons[type] || Database;
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'text-red-400 bg-red-500/10 border-red-500/50',
      high: 'text-orange-400 bg-orange-500/10 border-orange-500/50',
      medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/50',
      low: 'text-blue-400 bg-blue-500/10 border-blue-500/50',
      info: 'text-slate-400 bg-slate-500/10 border-slate-500/50'
    };
    return colors[severity] || colors.info;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Live Activity Feed
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              Updated {format(lastUpdate, 'h:mm:ss a')}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchEvents}
              disabled={isRefreshing}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-3">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="alert">Alerts</SelectItem>
              <SelectItem value="audit">Audit Logs</SelectItem>
              <SelectItem value="security_event">Security Events</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Event Feed */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Activity className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-sm">No events to display</p>
            </div>
          ) : (
            filteredEvents.map(event => {
              const EventIcon = getEventIcon(event.type);
              
              return (
                <div
                  key={event.id}
                  className={`p-3 rounded-lg border transition-all hover:bg-slate-800/30 ${getSeverityColor(event.severity)}`}
                >
                  <div className="flex items-start gap-3">
                    <EventIcon className="w-4 h-4 flex-shrink-0 mt-1" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-white font-semibold text-sm">
                          {event.title}
                        </span>
                        <Badge className="text-xs" variant="outline">
                          {event.type.replace('_', ' ')}
                        </Badge>
                        {event.severity !== 'info' && (
                          <Badge className="text-xs bg-slate-700">
                            {event.severity.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-xs text-slate-300 mb-1">
                        {event.description}
                      </p>
                      
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(event.timestamp), 'h:mm:ss a')}
                        </span>
                        <span>•</span>
                        <span>{event.source}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Activity Stats */}
        <div className="pt-4 border-t border-slate-800 grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-xl font-bold text-white">
              {events.filter(e => e.type === 'alert').length}
            </p>
            <p className="text-xs text-slate-500">Alerts</p>
          </div>
          <div>
            <p className="text-xl font-bold text-white">
              {events.filter(e => e.type === 'audit').length}
            </p>
            <p className="text-xs text-slate-500">Audit</p>
          </div>
          <div>
            <p className="text-xl font-bold text-white">
              {events.filter(e => e.type === 'security_event').length}
            </p>
            <p className="text-xs text-slate-500">Security</p>
          </div>
          <div>
            <p className="text-xl font-bold text-white">
              {events.filter(e => e.severity === 'critical' || e.severity === 'high').length}
            </p>
            <p className="text-xs text-slate-500">High/Critical</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}