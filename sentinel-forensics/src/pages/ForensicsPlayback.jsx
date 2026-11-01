import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Play, Pause, SkipBack, SkipForward, Rewind, FastForward,
  Flag, MessageSquare, Download, Filter, Clock, User,
  Activity, AlertTriangle, Shield, Database, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { ForensicPlaybackEngine } from '../components/forensics/ForensicPlaybackEngine';
import { RBACGuard } from '../components/security/RBACGuard';
import { Permissions } from '../components/security/RBACConfig';

export default function ForensicsPlayback() {
  const [engine] = useState(() => new ForensicPlaybackEngine());
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [annotationDialog, setAnnotationDialog] = useState(null);
  const [filters, setFilters] = useState({
    eventType: 'all',
    user: 'all',
    severity: 'all',
    dateRange: 'all'
  });

  const timelineRef = useRef(null);

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [events, filters]);

  useEffect(() => {
    if (playing) {
      const interval = setInterval(() => {
        const newTime = currentTime + (100 * speed);
        if (newTime >= duration) {
          setPlaying(false);
          setCurrentTime(duration);
        } else {
          setCurrentTime(newTime);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [playing, currentTime, speed, duration]);

  async function loadEvents() {
    setLoading(true);
    try {
      const allEvents = await engine.loadAllEvents();
      setEvents(allEvents);
      
      if (allEvents.length > 0) {
        const firstTime = new Date(allEvents[0].timestamp).getTime();
        const lastTime = new Date(allEvents[allEvents.length - 1].timestamp).getTime();
        setDuration(lastTime - firstTime);
      }
      
      toast.success(`Loaded ${allEvents.length} events`);
    } catch (error) {
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let filtered = [...events];

    if (filters.eventType !== 'all') {
      filtered = filtered.filter(e => e.eventType === filters.eventType);
    }

    if (filters.user !== 'all') {
      filtered = filtered.filter(e => e.userId === filters.user || e.data?.userId === filters.user);
    }

    if (filters.severity !== 'all') {
      filtered = filtered.filter(e => e.data?.severity === filters.severity);
    }

    if (filters.dateRange !== 'all') {
      const now = Date.now();
      const ranges = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };
      const range = ranges[filters.dateRange];
      if (range) {
        filtered = filtered.filter(e => now - new Date(e.timestamp).getTime() < range);
      }
    }

    setFilteredEvents(filtered);
  }

  function handlePlayPause() {
    setPlaying(!playing);
  }

  function handleSkipBackward() {
    setCurrentTime(Math.max(0, currentTime - 10000));
  }

  function handleSkipForward() {
    setCurrentTime(Math.min(duration, currentTime + 10000));
  }

  function handleSeek(value) {
    setCurrentTime(value[0]);
    setPlaying(false);
  }

  function handleSpeedChange(value) {
    setSpeed(value);
  }

  function handleAnnotate(event) {
    setAnnotationDialog(event);
  }

  async function saveAnnotation() {
    if (!annotationDialog) return;

    try {
      await engine.addAnnotation(annotationDialog.id, {
        text: annotationDialog.annotation,
        flagged: annotationDialog.flagged,
        timestamp: new Date().toISOString()
      });
      
      toast.success('Annotation saved');
      setAnnotationDialog(null);
      loadEvents();
    } catch (error) {
      toast.error('Failed to save annotation');
    }
  }

  async function exportPlayback() {
    try {
      const data = {
        events: filteredEvents,
        filters,
        duration,
        annotations: events.filter(e => e.annotations?.length > 0),
        exportedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `forensics-playback-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Playback exported');
    } catch (error) {
      toast.error('Export failed');
    }
  }

  function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const s = seconds % 60;
    const m = minutes % 60;
    
    if (hours > 0) {
      return `${hours}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function getCurrentEvents() {
    if (!events.length) return [];
    
    const firstTime = new Date(events[0].timestamp).getTime();
    const currentAbsoluteTime = firstTime + currentTime;
    
    return filteredEvents.filter(e => {
      const eventTime = new Date(e.timestamp).getTime();
      return eventTime <= currentAbsoluteTime;
    }).slice(-10);
  }

  const eventTypeColors = {
    user_login: 'bg-green-500/20 text-green-400 border-green-500/50',
    security_breach: 'bg-red-500/20 text-red-400 border-red-500/50',
    config_change: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    alert_triggered: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    data_access: 'bg-purple-500/20 text-purple-400 border-purple-500/50'
  };

  const uniqueEventTypes = [...new Set(events.map(e => e.eventType))];
  const uniqueUsers = [...new Set(events.map(e => e.userId || e.data?.userId).filter(Boolean))];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <RBACGuard permission={Permissions.AUDIT_READ}>
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Forensics Playback</h1>
              <p className="text-slate-400">Replay and analyze historical security events</p>
            </div>
            <Button
              onClick={exportPlayback}
              variant="outline"
              className="border-slate-700 text-white hover:bg-slate-800"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Total Events</p>
                <p className="text-2xl font-bold text-white">{events.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Filtered</p>
                <p className="text-2xl font-bold text-white">{filteredEvents.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Duration</p>
                <p className="text-2xl font-bold text-white">{formatTime(duration)}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Playback Speed</p>
                <p className="text-2xl font-bold text-white">{speed}x</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-slate-400">Event Type</Label>
                  <Select value={filters.eventType} onValueChange={(v) => setFilters({...filters, eventType: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="all">All Types</SelectItem>
                      {uniqueEventTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-slate-400">User</Label>
                  <Select value={filters.user} onValueChange={(v) => setFilters({...filters, user: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="all">All Users</SelectItem>
                      {uniqueUsers.map(user => (
                        <SelectItem key={user} value={user}>{user}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-slate-400">Date Range</Label>
                  <Select value={filters.dateRange} onValueChange={(v) => setFilters({...filters, dateRange: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="1h">Last Hour</SelectItem>
                      <SelectItem value="24h">Last 24 Hours</SelectItem>
                      <SelectItem value="7d">Last 7 Days</SelectItem>
                      <SelectItem value="30d">Last 30 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-slate-400">Severity</Label>
                  <Select value={filters.severity} onValueChange={(v) => setFilters({...filters, severity: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline & Controls */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6 space-y-4">
              {/* Timeline */}
              <div ref={timelineRef} className="relative h-24 bg-slate-800/30 rounded-lg overflow-hidden">
                {filteredEvents.map((event, idx) => {
                  const firstTime = events.length > 0 ? new Date(events[0].timestamp).getTime() : 0;
                  const eventTime = new Date(event.timestamp).getTime();
                  const position = duration > 0 ? ((eventTime - firstTime) / duration) * 100 : 0;
                  
                  return (
                    <div
                      key={idx}
                      className="absolute top-0 h-full w-1 bg-blue-400 opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
                      style={{ left: `${position}%` }}
                      onClick={() => setSelectedEvent(event)}
                      title={`${event.eventType} - ${new Date(event.timestamp).toLocaleString()}`}
                    />
                  );
                })}
                
                {/* Playhead */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-red-500 z-10"
                  style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                >
                  <div className="absolute -top-1 -left-2 w-4 h-4 bg-red-500 rounded-full" />
                </div>
              </div>

              {/* Scrubber */}
              <Slider
                value={[currentTime]}
                max={duration}
                step={100}
                onValueChange={handleSeek}
                className="cursor-pointer"
              />

              {/* Time Display */}
              <div className="flex justify-between text-sm text-slate-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSkipBackward}
                  className="border-slate-700 text-white hover:bg-slate-800"
                >
                  <SkipBack className="w-4 h-4" />
                </Button>

                <Button
                  size="icon"
                  onClick={handlePlayPause}
                  className="bg-blue-600 hover:bg-blue-700 w-12 h-12"
                >
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSkipForward}
                  className="border-slate-700 text-white hover:bg-slate-800"
                >
                  <SkipForward className="w-4 h-4" />
                </Button>

                <div className="ml-6 flex items-center gap-3">
                  <Label className="text-xs text-slate-400">Speed:</Label>
                  <div className="flex gap-2">
                    {[0.5, 1, 2, 5].map(s => (
                      <Button
                        key={s}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSpeedChange(s)}
                        className={`border-slate-700 ${speed === s ? 'bg-blue-600 text-white' : 'text-white hover:bg-slate-800'}`}
                      >
                        {s}x
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Events */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Current Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {getCurrentEvents().length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No events at current time</p>
                ) : (
                  getCurrentEvents().map((event, idx) => (
                    <div key={idx} className="flex items-start justify-between p-3 bg-slate-800/30 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={eventTypeColors[event.eventType] || 'text-slate-400 border-slate-500/30'}>
                            {event.eventType}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                          {event.annotations?.length > 0 && (
                            <MessageSquare className="w-3 h-3 text-blue-400" />
                          )}
                          {event.flagged && (
                            <Flag className="w-3 h-3 text-red-400" />
                          )}
                        </div>
                        <p className="text-sm text-slate-300">
                          {event.data?.description || event.data?.type || 'Event'}
                        </p>
                        {event.userId && (
                          <p className="text-xs text-slate-500 mt-1">
                            <User className="w-3 h-3 inline mr-1" />
                            {event.userId}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAnnotate(event)}
                        className="border-slate-700 text-white hover:bg-slate-800"
                      >
                        <Flag className="w-3 h-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Annotation Dialog */}
        <Dialog open={!!annotationDialog} onOpenChange={() => setAnnotationDialog(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>Annotate Event</DialogTitle>
            </DialogHeader>
            {annotationDialog && (
              <div className="space-y-4">
                <div className="bg-slate-800/30 rounded p-3">
                  <p className="text-xs text-slate-400 mb-1">Event Type</p>
                  <p className="text-sm text-white">{annotationDialog.eventType}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(annotationDialog.timestamp).toLocaleString()}
                  </p>
                </div>

                <div>
                  <Label>Annotation</Label>
                  <Textarea
                    value={annotationDialog.annotation || ''}
                    onChange={(e) => setAnnotationDialog({...annotationDialog, annotation: e.target.value})}
                    placeholder="Add notes about this event..."
                    className="bg-slate-800 border-slate-700 text-white"
                    rows={4}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={annotationDialog.flagged || false}
                    onChange={(e) => setAnnotationDialog({...annotationDialog, flagged: e.target.checked})}
                    className="w-4 h-4"
                  />
                  <Label className="text-sm">Flag for review</Label>
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setAnnotationDialog(null)}
                    className="border-slate-700"
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveAnnotation} className="bg-blue-600 hover:bg-blue-700">
                    Save Annotation
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </RBACGuard>
  );
}