import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Globe, AlertTriangle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Mock geo-IP lookup (replace with real API later)
const geoIPLookup = (ip) => {
  const mockGeoData = {
    '192.168.1.1': { country: 'United States', city: 'New York', lat: 40.7128, lon: -74.0060 },
    '10.0.0.1': { country: 'United Kingdom', city: 'London', lat: 51.5074, lon: -0.1278 },
    '172.16.0.1': { country: 'Germany', city: 'Berlin', lat: 52.5200, lon: 13.4050 },
    '8.8.8.8': { country: 'United States', city: 'Mountain View', lat: 37.4056, lon: -122.0775 },
    '1.1.1.1': { country: 'Australia', city: 'Sydney', lat: -33.8688, lon: 151.2093 }
  };

  // Hash IP to get consistent location
  const hash = ip.split('.').reduce((acc, num) => acc + parseInt(num), 0);
  const locations = Object.values(mockGeoData);
  return locations[hash % locations.length] || { 
    country: 'Unknown', 
    city: 'Unknown', 
    lat: 0, 
    lon: 0 
  };
};

function MapUpdater({ center }) {
  const map = useMap();
  React.useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

export default function ThreatOriginMap({ logs, onFilterChange, filters = {} }) {
  const [selectedCountry, setSelectedCountry] = useState(null);

  const threatLocations = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    let filtered = [...logs];

    if (filters.severity && filters.severity !== 'all') {
      filtered = filtered.filter(log => log.severity === filters.severity);
    }

    if (filters.eventType && filters.eventType !== 'all') {
      filtered = filtered.filter(log => 
        log.event_type?.toLowerCase().includes(filters.eventType)
      );
    }

    if (filters.timeRange) {
      const cutoff = new Date(Date.now() - filters.timeRange * 60 * 60 * 1000);
      filtered = filtered.filter(log => new Date(log.timestamp) >= cutoff);
    }

    // Group by location
    const locationMap = new Map();

    filtered.forEach(log => {
      const sourceIP = log.normalized_fields?.source_ip || log.source_id;
      if (!sourceIP || sourceIP === 'unknown') return;

      const geoData = geoIPLookup(sourceIP);
      const key = `${geoData.lat},${geoData.lon}`;

      if (!locationMap.has(key)) {
        locationMap.set(key, {
          ...geoData,
          count: 0,
          events: [],
          ips: new Set(),
          eventTypes: new Map()
        });
      }

      const location = locationMap.get(key);
      location.count++;
      location.events.push(log);
      location.ips.add(sourceIP);

      const eventType = log.event_type || 'unknown';
      location.eventTypes.set(eventType, (location.eventTypes.get(eventType) || 0) + 1);
    });

    return Array.from(locationMap.values()).map(loc => ({
      ...loc,
      ips: Array.from(loc.ips),
      topEventTypes: Array.from(loc.eventTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => ({ type, count }))
    }));
  }, [logs, filters]);

  const getSeverityColor = (count) => {
    if (count >= 10) return '#EF4444';
    if (count >= 5) return '#F59E0B';
    if (count >= 2) return '#EAB308';
    return '#3B82F6';
  };

  const getMarkerRadius = (count) => {
    return Math.min(20, 5 + count * 2);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-400" />
            Threat Origin Map
          </CardTitle>
          
          <div className="flex gap-2">
            <Select
              value={filters.severity || 'all'}
              onValueChange={(value) => onFilterChange?.({ ...filters, severity: value })}
            >
              <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {threatLocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Globe className="w-16 h-16 text-slate-600 mb-4" />
            <p className="text-slate-400">No threat origins to display</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div style={{ height: '400px', borderRadius: '8px', overflow: 'hidden' }}>
              <MapContainer
                center={[20, 0]}
                zoom={2}
                style={{ height: '100%', width: '100%', background: '#1E293B' }}
                zoomControl={true}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                {selectedCountry && (
                  <MapUpdater center={[selectedCountry.lat, selectedCountry.lon]} />
                )}
                {threatLocations.map((location, idx) => (
                  <CircleMarker
                    key={idx}
                    center={[location.lat, location.lon]}
                    radius={getMarkerRadius(location.count)}
                    fillColor={getSeverityColor(location.count)}
                    fillOpacity={0.6}
                    stroke={true}
                    color="#fff"
                    weight={2}
                    eventHandlers={{
                      click: () => setSelectedCountry(location)
                    }}
                  >
                    <Popup className="custom-popup">
                      <div className="p-2">
                        <h4 className="font-semibold text-sm mb-2">
                          {location.city}, {location.country}
                        </h4>
                        <div className="space-y-1 text-xs">
                          <p><strong>Events:</strong> {location.count}</p>
                          <p><strong>Unique IPs:</strong> {location.ips.length}</p>
                          <div className="mt-2">
                            <p className="font-semibold mb-1">Top Event Types:</p>
                            {location.topEventTypes.map((et, i) => (
                              <div key={i} className="flex justify-between">
                                <span>{et.type}</span>
                                <span className="text-slate-600">{et.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            {selectedCountry && (
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  {selectedCountry.city}, {selectedCountry.country}
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Total Events</p>
                    <p className="text-2xl font-bold text-white">{selectedCountry.count}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Unique IPs</p>
                    <p className="text-2xl font-bold text-white">{selectedCountry.ips.length}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs text-slate-400 mb-2">Top Attacking IPs:</p>
                  <div className="space-y-1">
                    {selectedCountry.ips.slice(0, 5).map((ip, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <code className="text-blue-400">{ip}</code>
                        <Badge variant="outline" className="text-[10px]">
                          {selectedCountry.events.filter(e => 
                            e.normalized_fields?.source_ip === ip
                          ).length} events
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}