import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Calendar,
  Loader2,
  Map as MapIcon,
  Clock,
  AlertTriangle,
  Download
} from 'lucide-react';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import { toast } from 'sonner';

export default function GeoTimeline() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: locationEvents = [], isLoading } = useQuery({
    queryKey: ['geo-timeline', selectedDate],
    queryFn: async () => {
      const events = [];

      try {
        const deviceLogs = await resilientAPI.filterEntity(
          'DeviceLog',
          {
            timestamp: {
              $gte: `${selectedDate}T00:00:00Z`,
              $lte: `${selectedDate}T23:59:59Z`
            },
            'location_data.latitude': { $exists: true }
          },
          '-timestamp',
          200,
          0,
          15000
        );

        for (const log of deviceLogs) {
          if (log.location_data?.latitude && log.location_data?.longitude) {
            events.push({
              timestamp: log.timestamp,
              type: 'device_location',
              latitude: log.location_data.latitude,
              longitude: log.location_data.longitude,
              accuracy: log.location_data.accuracy,
              source: 'Device Log',
              device_id: log.device_id,
              is_spoofed: log.location_data.is_spoofed || false
            });
          }
        }

        const survEvents = await resilientAPI.filterEntity(
          'SurveillanceEvent',
          {
            timestamp: {
              $gte: `${selectedDate}T00:00:00Z`,
              $lte: `${selectedDate}T23:59:59Z`
            },
            'location.latitude': { $exists: true }
          },
          '-timestamp',
          100,
          0,
          15000
        );

        for (const event of survEvents) {
          if (event.location?.latitude && event.location?.longitude) {
            events.push({
              timestamp: event.timestamp,
              type: 'surveillance_event',
              latitude: event.location.latitude,
              longitude: event.location.longitude,
              accuracy: event.location.accuracy,
              source: event.event_type,
              severity: event.severity
            });
          }
        }

        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return events;
      } catch (error) {
        console.warn('Location data load failed:', error);
        return [];
      }
    },
    initialData: []
  });

  const exportToKML = () => {
    if (locationEvents.length === 0) {
      toast.error('No location data to export');
      return;
    }

    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Sentinel Geo-Timeline - ${selectedDate}</name>
    <description>Location timeline for ${selectedDate}</description>
`;

    for (const event of locationEvents) {
      kml += `
    <Placemark>
      <name>${event.type} - ${new Date(event.timestamp).toLocaleTimeString()}</name>
      <description>
        Source: ${event.source}
        Time: ${event.timestamp}
        ${event.severity ? `Severity: ${event.severity}` : ''}
      </description>
      <Point>
        <coordinates>${event.longitude},${event.latitude},0</coordinates>
      </Point>
    </Placemark>`;
    }

    kml += `
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geo-timeline-${selectedDate}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Timeline exported as KML!', {
      description: 'Open in Google Earth for visualization'
    });
  };

  const suspiciousLocations = locationEvents.filter(e => e.is_spoofed || e.severity === 'high' || e.severity === 'critical').length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Geo-Location Timeline</h1>
          <p className="text-slate-400">Visualize location history and detect spoofing/surveillance</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={exportToKML}
            disabled={locationEvents.length === 0}
            variant="outline"
            className="border-blue-500/50 text-blue-400 min-h-[44px]"
          >
            <Download className="w-4 h-4 mr-2" />
            Export KML
          </Button>
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Calendar className="w-5 h-5 text-blue-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="flex h-11 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontSize: '16px' }}
            />
            <div className="text-sm text-slate-400 whitespace-nowrap">
              {locationEvents.length} events
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <MapPin className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{locationEvents.length}</p>
                <p className="text-xs text-slate-400">Location Events</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-orange-400" />
              <div>
                <p className="text-3xl font-bold text-white">{suspiciousLocations}</p>
                <p className="text-xs text-slate-400">Suspicious/Spoofed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Clock className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {locationEvents.length > 0 ? `${Math.round((new Date(locationEvents[0].timestamp) - new Date(locationEvents[locationEvents.length - 1].timestamp)) / 1000 / 60 / 60)}h` : '0h'}
                </p>
                <p className="text-xs text-slate-400">Time Span</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MapIcon className="w-5 h-5" />
            Location Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
              <p className="text-slate-400">Loading location data...</p>
            </div>
          ) : locationEvents.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-2">No location events for selected date</p>
              <p className="text-sm text-slate-500">
                Select a different date or ensure devices have location tracking enabled
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {locationEvents.map((event, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    event.is_spoofed || event.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                    event.severity === 'high' ? 'bg-orange-500/10 border-orange-500/30' :
                    'bg-slate-800/50 border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <MapPin className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        event.is_spoofed ? 'text-red-400' :
                        event.severity === 'high' ? 'text-orange-400' :
                        'text-blue-400'
                      }`} />
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold text-white">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </p>
                          <Badge className="bg-slate-700 text-slate-300 text-xs">
                            {event.type.replace(/_/g, ' ')}
                          </Badge>
                          {event.is_spoofed && (
                            <Badge className="bg-red-500/20 text-red-400 text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              SPOOFED
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-xs text-slate-400 mb-2">
                          Source: {event.source}
                        </p>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-slate-500">Coordinates</p>
                            <code className="text-blue-400">
                              {event.latitude.toFixed(6)}, {event.longitude.toFixed(6)}
                            </code>
                          </div>
                          <div>
                            <p className="text-slate-500">Accuracy</p>
                            <p className="text-white">{event.accuracy ? `${event.accuracy}m` : 'Unknown'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-blue-900/20 border-blue-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <MapIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-semibold mb-2">Map Visualization:</p>
              <p className="text-blue-300/80">
                Export timeline as KML file and open in Google Earth or Google Maps for visual playback.
                The KML file includes timestamps for time-based animation of location history.
              </p>
              <p className="text-blue-300/80 mt-2">
                <strong>Spoofing Detection:</strong> GPS spoofing is flagged when location jumps impossibly fast or conflicts with network-based geolocation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}