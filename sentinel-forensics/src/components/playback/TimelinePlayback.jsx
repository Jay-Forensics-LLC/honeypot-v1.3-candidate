import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  Activity,
  AlertTriangle,
  Eye,
  Download,
  Film,
  Filter,
  Maximize2
} from "lucide-react";
import { format, differenceInMilliseconds } from "date-fns";
import { toast } from "sonner";

export default function TimelinePlayback({ sessionId, caseId }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [filterType, setFilterType] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const intervalRef = useRef(null);

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionId ? base44.entities.ScanSession.filter({ session_id: sessionId }).then(r => r[0]) : null,
    enabled: !!sessionId
  });

  const { data: observations = [] } = useQuery({
    queryKey: ['observations', sessionId],
    queryFn: () => base44.entities.Observation.filter({ session_id: session?.session_id }).then(obs => 
      obs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    ),
    enabled: !!session
  });

  const { data: findings = [] } = useQuery({
    queryKey: ['findings', sessionId],
    queryFn: () => base44.entities.IOCFinding.filter({ session_id: session?.session_id }).then(f =>
      f.sort((a, b) => new Date(a.first_seen) - new Date(b.first_seen))
    ),
    enabled: !!session
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts', sessionId],
    queryFn: () => base44.entities.Alert.list('-detection_timestamp', 100).then(a =>
      a.filter(alert => 
        observations.some(obs => 
          Math.abs(differenceInMilliseconds(new Date(alert.detection_timestamp), new Date(obs.timestamp))) < 60000
        )
      )
    ),
    enabled: !!session && observations.length > 0
  });

  // Build unified timeline
  const timeline = React.useMemo(() => {
    const events = [];

    observations.forEach(obs => {
      events.push({
        id: `obs-${obs.id}`,
        type: 'observation',
        timestamp: new Date(obs.timestamp),
        data: obs,
        severity: obs.anomaly_score > 70 ? 'high' : obs.anomaly_score > 40 ? 'medium' : 'low',
        icon: Activity,
        color: obs.anomaly_score > 70 ? 'text-red-400' : obs.anomaly_score > 40 ? 'text-yellow-400' : 'text-blue-400'
      });
    });

    findings.forEach(finding => {
      events.push({
        id: `finding-${finding.id}`,
        type: 'finding',
        timestamp: new Date(finding.first_seen),
        data: finding,
        severity: finding.severity,
        icon: AlertTriangle,
        color: finding.severity === 'critical' ? 'text-red-400' : 
               finding.severity === 'high' ? 'text-orange-400' :
               finding.severity === 'medium' ? 'text-yellow-400' : 'text-blue-400'
      });
    });

    alerts.forEach(alert => {
      events.push({
        id: `alert-${alert.id}`,
        type: 'alert',
        timestamp: new Date(alert.detection_timestamp),
        data: alert,
        severity: alert.severity,
        icon: Eye,
        color: alert.severity === 'critical' ? 'text-red-400' : 'text-orange-400'
      });
    });

    return events.sort((a, b) => a.timestamp - b.timestamp);
  }, [observations, findings, alerts]);

  const filteredTimeline = timeline.filter(event => {
    if (filterType === 'all') return true;
    if (filterType === 'threats') return event.severity === 'critical' || event.severity === 'high';
    return event.type === filterType;
  });

  const duration = timeline.length > 0 
    ? differenceInMilliseconds(timeline[timeline.length - 1].timestamp, timeline[0].timestamp)
    : 0;

  useEffect(() => {
    if (isPlaying && filteredTimeline.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + (100 * playbackSpeed);
          if (next >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return next;
        });
      }, 100);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, duration, filteredTimeline.length]);

  // Find current events at playback position
  const currentEvents = filteredTimeline.filter(event => {
    const eventOffset = differenceInMilliseconds(event.timestamp, timeline[0]?.timestamp || 0);
    return eventOffset <= currentTime && eventOffset >= currentTime - 1000;
  });

  const togglePlayback = () => {
    if (currentTime >= duration && !isPlaying) {
      setCurrentTime(0);
    }
    setIsPlaying(!isPlaying);
  };

  const skipBackward = () => {
    setCurrentTime(Math.max(0, currentTime - 5000));
  };

  const skipForward = () => {
    setCurrentTime(Math.min(duration, currentTime + 5000));
  };

  const exportPlayback = async () => {
    const playbackData = {
      session_id: session?.session_id,
      case_id: caseId,
      exported_at: new Date().toISOString(),
      duration_ms: duration,
      total_events: timeline.length,
      events: timeline.map(event => ({
        timestamp: event.timestamp.toISOString(),
        type: event.type,
        severity: event.severity,
        details: event.data
      })),
      chain_of_custody: {
        action: 'Timeline Export',
        exported_by: (await base44.auth.me()).email,
        timestamp: new Date().toISOString()
      }
    };

    const blob = new Blob([JSON.stringify(playbackData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Timeline_${session?.session_id}_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Timeline exported for legal review');
  };

  if (!session || timeline.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-12 text-center">
          <Film className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400">No timeline data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-slate-900/50 border-slate-800 ${fullscreen ? 'fixed inset-4 z-50' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Film className="w-5 h-5 text-purple-400" />
            Investigation Timeline Playback
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFullscreen(!fullscreen)}
              className="border-slate-700"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportPlayback}
              className="border-slate-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Playback Controls */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={skipBackward}
              className="border-slate-700"
            >
              <SkipBack className="w-4 h-4" />
            </Button>

            <Button
              size="icon"
              onClick={togglePlayback}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={skipForward}
              className="border-slate-700"
            >
              <SkipForward className="w-4 h-4" />
            </Button>

            <div className="flex-1 flex items-center gap-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-white font-mono">
                {Math.floor(currentTime / 1000)}s / {Math.floor(duration / 1000)}s
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Speed:</span>
              {[0.5, 1, 2, 4].map(speed => (
                <Button
                  key={speed}
                  variant={playbackSpeed === speed ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlaybackSpeed(speed)}
                  className={playbackSpeed === speed ? 'bg-purple-600' : 'border-slate-700'}
                >
                  {speed}x
                </Button>
              ))}
            </div>
          </div>

          {/* Timeline Scrubber */}
          <div className="space-y-2">
            <Slider
              value={[currentTime]}
              min={0}
              max={duration}
              step={100}
              onValueChange={([value]) => setCurrentTime(value)}
              className="cursor-pointer"
            />

            {/* Event Markers */}
            <div className="relative h-8 bg-slate-800/30 rounded">
              {timeline.map((event, idx) => {
                const position = (differenceInMilliseconds(event.timestamp, timeline[0].timestamp) / duration) * 100;
                const Icon = event.icon;
                return (
                  <div
                    key={event.id}
                    className="absolute top-1/2 transform -translate-y-1/2 cursor-pointer hover:scale-150 transition-transform"
                    style={{ left: `${position}%` }}
                    onClick={() => {
                      setCurrentTime(differenceInMilliseconds(event.timestamp, timeline[0].timestamp));
                      setSelectedEvent(event);
                    }}
                    title={`${event.type} - ${event.severity}`}
                  >
                    <Icon className={`w-3 h-3 ${event.color}`} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-400">Filter:</span>
          {['all', 'threats', 'observation', 'finding', 'alert'].map(type => (
            <Button
              key={type}
              variant={filterType === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType(type)}
              className={filterType === type ? 'bg-purple-600' : 'border-slate-700'}
            >
              {type === 'all' ? 'All Events' : type.charAt(0).toUpperCase() + type.slice(1)}
            </Button>
          ))}
        </div>

        {/* Current Events Display */}
        <div className="space-y-2">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            Current Events ({currentEvents.length})
          </h4>

          {currentEvents.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {currentEvents.map(event => {
                const Icon = event.icon;
                return (
                  <div
                    key={event.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedEvent?.id === event.id
                        ? 'bg-purple-500/20 border-purple-500'
                        : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                    }`}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${event.color}`} />
                        <span className="text-white font-semibold capitalize">{event.type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={
                          event.severity === 'critical' ? 'bg-red-500' :
                          event.severity === 'high' ? 'bg-orange-500' :
                          event.severity === 'medium' ? 'bg-yellow-500' :
                          'bg-blue-500'
                        }>
                          {event.severity}
                        </Badge>
                        <span className="text-xs text-slate-400">
                          {format(event.timestamp, 'HH:mm:ss.SSS')}
                        </span>
                      </div>
                    </div>

                    {event.type === 'observation' && event.data.ble_data && (
                      <div className="text-xs text-slate-300">
                        <p>MAC: {event.data.ble_data.mac_address}</p>
                        <p>RSSI: {event.data.ble_data.rssi} dBm</p>
                      </div>
                    )}

                    {event.type === 'finding' && (
                      <div className="text-xs text-slate-300">
                        <p>IOC: {event.data.ioc_type} - {event.data.ioc_value}</p>
                        <p>Confidence: {event.data.confidence}%</p>
                      </div>
                    )}

                    {event.type === 'alert' && (
                      <div className="text-xs text-slate-300">
                        <p>{event.data.title}</p>
                        <p>Threat Score: {event.data.threat_score}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Clock className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-sm">No events at current playback position</p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-3 bg-slate-800/50 rounded">
            <p className="text-xs text-slate-400 mb-1">Total Events</p>
            <p className="text-xl font-bold text-white">{timeline.length}</p>
          </div>
          <div className="p-3 bg-slate-800/50 rounded">
            <p className="text-xs text-slate-400 mb-1">Filtered</p>
            <p className="text-xl font-bold text-purple-400">{filteredTimeline.length}</p>
          </div>
          <div className="p-3 bg-slate-800/50 rounded">
            <p className="text-xs text-slate-400 mb-1">Critical</p>
            <p className="text-xl font-bold text-red-400">
              {timeline.filter(e => e.severity === 'critical').length}
            </p>
          </div>
          <div className="p-3 bg-slate-800/50 rounded">
            <p className="text-xs text-slate-400 mb-1">Duration</p>
            <p className="text-xl font-bold text-white">{Math.floor(duration / 1000)}s</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}