import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, AlertTriangle, Activity, FileText, Network, Lock, Database, Loader2, RefreshCw, Download, Filter } from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';

const EVENT_ICONS = {
  evidence_collection: FileText,
  system_event: Activity,
  user_activity: Activity,
  network_activity: Network,
  file_access: FileText,
  authentication: Lock,
  data_transfer: Database,
  anomaly: AlertTriangle,
  custom: Clock
};

const SEVERITY_COLORS = {
  info: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  low: 'bg-green-500/20 text-green-300 border-green-500/50',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  critical: 'bg-red-500/20 text-red-300 border-red-500/50'
};

export default function ForensicTimelineViewer({ caseId }) {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

  const { data: timeline, isLoading } = useQuery({
    queryKey: ['timeline', caseId],
    queryFn: async () => {
      const events = await base44.entities.TimelineEvent.filter({ case_id: caseId });
      return events.sort((a, b) => new Date(a.event_timestamp) - new Date(b.event_timestamp));
    },
    enabled: !!caseId
  });

  const reconstructMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('reconstructTimeline', {
        caseId,
        autoCorrelate: true
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', caseId] });
      toast.success('Timeline reconstructed successfully');
    },
    onError: (error) => {
      toast.error('Failed to reconstruct timeline', { description: error.message });
    }
  });

  const exportTimeline = () => {
    if (!timeline || timeline.length === 0) {
      toast.error('No timeline events to export');
      return;
    }

    const csvContent = [
      ['Timestamp', 'Event Type', 'Title', 'Description', 'Severity', 'Confidence', 'Evidence IDs'].join(','),
      ...timeline.map(event => [
        DateUtils.safeFormatDateTime(event.event_timestamp),
        event.event_type,
        `"${event.event_title}"`,
        `"${event.event_description || ''}"`,
        event.severity,
        event.confidence || 'N/A',
        event.source_evidence_ids?.join(';') || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline_${caseId}_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Timeline exported');
  };

  const filteredTimeline = timeline?.filter(event => {
    const typeMatch = filterType === 'all' || event.event_type === filterType;
    const severityMatch = filterSeverity === 'all' || event.severity === filterSeverity;
    return typeMatch && severityMatch;
  }) || [];

  if (isLoading) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-400" />
            Forensic Timeline ({filteredTimeline.length} events)
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={exportTimeline}
              disabled={filteredTimeline.length === 0}
              className="border-slate-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button
              size="sm"
              onClick={() => reconstructMutation.mutate()}
              disabled={reconstructMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {reconstructMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reconstruct
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-400 mb-1 block flex items-center gap-2">
              <Filter className="w-3 h-3" />
              Event Type
            </label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="evidence_collection">Evidence Collection</SelectItem>
                <SelectItem value="system_event">System Event</SelectItem>
                <SelectItem value="network_activity">Network Activity</SelectItem>
                <SelectItem value="file_access">File Access</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
                <SelectItem value="anomaly">Anomaly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block flex items-center gap-2">
              <Filter className="w-3 h-3" />
              Severity
            </label>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 mb-4">No timeline events</p>
            <Button
              onClick={() => reconstructMutation.mutate()}
              disabled={reconstructMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {reconstructMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reconstruct Timeline
            </Button>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-700" />

            <div className="space-y-6">
              {filteredTimeline.map((event, idx) => {
                const Icon = EVENT_ICONS[event.event_type] || Clock;
                const prevEvent = idx > 0 ? filteredTimeline[idx - 1] : null;
                const gap = prevEvent ? 
                  (new Date(event.event_timestamp) - new Date(prevEvent.event_timestamp)) / 1000 / 60 / 60 : 
                  null;

                return (
                  <div key={event.id}>
                    {/* Gap indicator */}
                    {gap && gap > 1 && (
                      <div className="flex items-center gap-3 pl-14 py-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        <span className="text-xs text-yellow-400">
                          {gap.toFixed(1)} hour gap in timeline
                        </span>
                      </div>
                    )}

                    <div className="relative flex items-start gap-4">
                      {/* Timeline dot */}
                      <div className="relative z-10 flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-purple-500 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-purple-400" />
                        </div>
                      </div>

                      {/* Event content */}
                      <Card className="flex-1 bg-slate-800/50 border-slate-700 hover:border-purple-500/50 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="text-white font-semibold">{event.event_title}</h4>
                              <p className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                                <Clock className="w-3 h-3" />
                                {DateUtils.safeFormatDateTime(event.event_timestamp)}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Badge className={SEVERITY_COLORS[event.severity]}>
                                {event.severity}
                              </Badge>
                              {event.is_critical && (
                                <Badge className="bg-red-500/20 text-red-300">CRITICAL</Badge>
                              )}
                            </div>
                          </div>

                          {event.event_description && (
                            <p className="text-sm text-slate-300 mb-3">{event.event_description}</p>
                          )}

                          <div className="flex flex-wrap gap-2 text-xs">
                            <Badge variant="outline" className="border-slate-600 text-slate-400">
                              Type: {event.event_type.replace('_', ' ')}
                            </Badge>
                            {event.confidence && (
                              <Badge variant="outline" className="border-slate-600 text-slate-400">
                                Confidence: {event.confidence}%
                              </Badge>
                            )}
                            {event.source_evidence_ids?.length > 0 && (
                              <Badge variant="outline" className="border-slate-600 text-slate-400">
                                {event.source_evidence_ids.length} Evidence
                              </Badge>
                            )}
                            {event.correlated_events?.length > 0 && (
                              <Badge variant="outline" className="border-blue-500/50 text-blue-300">
                                {event.correlated_events.length} Correlated
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}