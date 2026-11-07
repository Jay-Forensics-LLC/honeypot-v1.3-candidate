import React from 'react';
import { Clock, Filter, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function IncidentTimeline() {
  const [caseId, setCaseId] = React.useState(null);
  const [eventTypeFilter, setEventTypeFilter] = React.useState('all');
  const [zoom, setZoom] = React.useState('7d');

  // Get case from URL if present
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('caseId');
    if (id) setCaseId(id);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['timeline-events', caseId, eventTypeFilter],
    queryFn: async () => {
      const result = await base44.functions.invoke('timelineManagement', {
        action: 'list',
        case_id: caseId,
        filters: eventTypeFilter !== 'all' ? { event_type: eventTypeFilter } : {}
      });
      return result.data;
    },
    enabled: !!caseId
  });

  if (!caseId) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No Case Selected</h2>
          <p className="text-gray-600">Select a case to view its timeline</p>
        </div>
      </div>
    );
  }

  const eventTypeColors = {
    alert: 'bg-red-100 text-red-700',
    evidence_upload: 'bg-blue-100 text-blue-700',
    finding: 'bg-purple-100 text-purple-700',
    device_event: 'bg-green-100 text-green-700',
    policy_change: 'bg-yellow-100 text-yellow-700',
    user_action: 'bg-gray-100 text-gray-700',
    manual_note: 'bg-indigo-100 text-indigo-700'
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Incident Timeline</h1>
            <p className="text-gray-600">Visual progression of incident events</p>
          </div>
          <div className="flex gap-2">
            <Select value={zoom} onValueChange={setZoom}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24 Hours</SelectItem>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-gray-500" />
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="alert">Alerts</SelectItem>
                  <SelectItem value="evidence_upload">Evidence</SelectItem>
                  <SelectItem value="finding">Findings</SelectItem>
                  <SelectItem value="device_event">Device Events</SelectItem>
                  <SelectItem value="policy_change">Policy Changes</SelectItem>
                  <SelectItem value="user_action">User Actions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        ) : data?.events?.length > 0 ? (
          <div className="relative space-y-4">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-300" />

            {data.events.map((event, idx) => (
              <div key={event.id} className="relative pl-20">
                {/* Dot */}
                <div className="absolute left-6 top-4 w-4 h-4 rounded-full bg-blue-500 border-4 border-white" />

                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={eventTypeColors[event.event_type] || 'bg-gray-100 text-gray-700'}>
                          {event.event_type}
                        </Badge>
                        <span className="text-sm text-gray-600">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <h3 className="font-semibold mb-1">{event.title}</h3>
                    {event.details_json && Object.keys(event.details_json).length > 0 && (
                      <pre className="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded overflow-auto">
                        {JSON.stringify(event.details_json, null, 2)}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No timeline events found
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}