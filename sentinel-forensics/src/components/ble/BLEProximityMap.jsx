import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wifi, MapPin, Radio, AlertTriangle, RefreshCw, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

function calculateDistanceFromRSSI(rssi) {
  // Convert RSSI to approximate distance in meters
  // Formula: distance = 10 ^ ((Measured Power - RSSI) / (10 * N))
  // Measured Power at 1m = -59 dBm, N (path loss exponent) = 2-4
  const measuredPower = -59;
  const pathLossExponent = 2.5;
  const distance = Math.pow(10, (measuredPower - rssi) / (10 * pathLossExponent));
  return Math.min(distance, 1000); // Cap at 1km
}

function getThreatColor(device) {
  if (device.threat_level === 'critical') return '#ef4444';
  if (device.threat_level === 'high') return '#f97316';
  if (device.threat_level === 'medium') return '#eab308';
  return '#22c55e';
}

export default function BLEProximityMap() {
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [mapCenter, setMapCenter] = useState([37.7749, -122.4194]); // Default: San Francisco
  const [selectedDevice, setSelectedDevice] = useState(null);

  const { data: bleDevices = [], refetch, isLoading } = useQuery({
    queryKey: ['ble-proximity-devices'],
    queryFn: () => base44.entities.BLEDevice.list('-last_seen', 100),
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  const { data: networkLogs = [] } = useQuery({
    queryKey: ['network-logs-location'],
    queryFn: () => base44.entities.NetworkLog.filter({ is_suspicious: true }, '-timestamp', 50),
    refetchInterval: 15000
  });

  // Get user's location
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setUserLocation(coords);
        setMapCenter([coords.lat, coords.lng]);
        setLocationError(null);
      },
      (error) => {
        setLocationError(error.message);
        toast.error('Location access denied - using approximate location');
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const enrichedDevices = bleDevices.map(device => {
    const rssi = device.signal_strength || -70;
    const distance = calculateDistanceFromRSSI(rssi);
    
    // Calculate approximate position based on user location and distance
    let lat = mapCenter[0];
    let lng = mapCenter[1];
    
    if (userLocation && device.last_seen_location) {
      lat = device.last_seen_location.latitude || userLocation.lat + (Math.random() - 0.5) * 0.01;
      lng = device.last_seen_location.longitude || userLocation.lng + (Math.random() - 0.5) * 0.01;
    } else {
      // Approximate position based on signal strength
      const angle = Math.random() * 2 * Math.PI;
      const distanceInDegrees = distance / 111320; // Convert meters to degrees
      lat = mapCenter[0] + Math.cos(angle) * distanceInDegrees;
      lng = mapCenter[1] + Math.sin(angle) * distanceInDegrees;
    }

    return {
      ...device,
      position: [lat, lng],
      distance,
      rssi,
      color: getThreatColor(device)
    };
  });

  const handleCenterOnUser = () => {
    if (userLocation) {
      setMapCenter([userLocation.lat, userLocation.lng]);
      toast.success('Centered on your location');
    } else {
      toast.error('Location not available');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-400" />
              BLE Proximity Map
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCenterOnUser}
                disabled={!userLocation}
              >
                <Crosshair className="w-4 h-4 mr-2" />
                Center
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {locationError && (
            <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-300 font-medium">Location Access Limited</p>
                  <p className="text-xs text-yellow-200 mt-1">{locationError}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Wifi className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-400">Devices</span>
              </div>
              <p className="text-2xl font-bold text-white">{enrichedDevices.length}</p>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-slate-400">Threats</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {enrichedDevices.filter(d => d.threat_level === 'critical' || d.threat_level === 'high').length}
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Radio className="w-4 h-4 text-green-400" />
                <span className="text-xs text-slate-400">Avg RSSI</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {enrichedDevices.length > 0 
                  ? Math.round(enrichedDevices.reduce((sum, d) => sum + d.rssi, 0) / enrichedDevices.length)
                  : 0} dBm
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-slate-400">Range</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {enrichedDevices.length > 0 
                  ? Math.round(Math.max(...enrichedDevices.map(d => d.distance)))
                  : 0}m
              </p>
            </div>
          </div>

          <div className="h-[500px] rounded-lg overflow-hidden border border-slate-700">
            <MapContainer
              center={mapCenter}
              zoom={15}
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              
              <MapController center={mapCenter} />

              {/* User's location marker */}
              {userLocation && (
                <>
                  <Marker position={[userLocation.lat, userLocation.lng]}>
                    <Popup>
                      <div className="p-2">
                        <p className="font-semibold text-blue-600">Your Location</p>
                        <p className="text-xs text-gray-600 mt-1">
                          Accuracy: ±{Math.round(userLocation.accuracy)}m
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[userLocation.lat, userLocation.lng]}
                    radius={userLocation.accuracy}
                    pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }}
                  />
                </>
              )}

              {/* BLE Device markers */}
              {enrichedDevices.map((device) => (
                <React.Fragment key={device.id}>
                  <Marker
                    position={device.position}
                    icon={L.divIcon({
                      className: 'custom-marker',
                      html: `<div style="background-color: ${device.color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
                      iconSize: [20, 20],
                      iconAnchor: [10, 10]
                    })}
                    eventHandlers={{
                      click: () => setSelectedDevice(device)
                    }}
                  >
                    <Popup>
                      <div className="p-2 min-w-[200px]">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-gray-800">{device.device_name || 'Unknown Device'}</p>
                          <Badge 
                            className="text-xs"
                            style={{ backgroundColor: device.color, color: 'white' }}
                          >
                            {device.threat_level || 'unknown'}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs text-gray-600">
                          <p><span className="font-medium">MAC:</span> {device.mac_address}</p>
                          {device.ip_address && <p><span className="font-medium">IP:</span> {device.ip_address}</p>}
                          <p><span className="font-medium">RSSI:</span> {device.rssi} dBm</p>
                          <p><span className="font-medium">Distance:</span> ~{Math.round(device.distance)}m</p>
                          <p><span className="font-medium">Type:</span> {device.device_type || 'BLE'}</p>
                          {device.manufacturer && <p><span className="font-medium">Manufacturer:</span> {device.manufacturer}</p>}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={device.position}
                    radius={device.distance}
                    pathOptions={{ 
                      color: device.color, 
                      fillColor: device.color, 
                      fillOpacity: 0.1,
                      weight: 1
                    }}
                  />
                </React.Fragment>
              ))}
            </MapContainer>
          </div>

          {selectedDevice && (
            <Card className="mt-4 bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white font-semibold">{selectedDevice.device_name || 'Unknown Device'}</h3>
                    <p className="text-xs text-slate-400 mt-1">{selectedDevice.mac_address}</p>
                  </div>
                  <Badge style={{ backgroundColor: selectedDevice.color, color: 'white' }}>
                    {selectedDevice.threat_level || 'unknown'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/50 rounded p-2">
                    <p className="text-xs text-slate-400">Signal Strength</p>
                    <p className="text-white font-semibold">{selectedDevice.rssi} dBm</p>
                  </div>
                  <div className="bg-slate-900/50 rounded p-2">
                    <p className="text-xs text-slate-400">Distance</p>
                    <p className="text-white font-semibold">~{Math.round(selectedDevice.distance)}m</p>
                  </div>
                  {selectedDevice.ip_address && (
                    <div className="bg-slate-900/50 rounded p-2">
                      <p className="text-xs text-slate-400">IP Address</p>
                      <p className="text-white font-semibold text-xs">{selectedDevice.ip_address}</p>
                    </div>
                  )}
                  <div className="bg-slate-900/50 rounded p-2">
                    <p className="text-xs text-slate-400">Device Type</p>
                    <p className="text-white font-semibold">{selectedDevice.device_type || 'BLE'}</p>
                  </div>
                </div>

                {selectedDevice.metadata && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <p className="text-xs text-slate-400 mb-2">Additional Info</p>
                    <pre className="text-xs text-slate-300 bg-slate-900/50 rounded p-2 overflow-auto max-h-32">
                      {JSON.stringify(selectedDevice.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-200">
                <p className="font-medium mb-1">Proximity Detection Active</p>
                <p>Distances are estimated using RSSI signal strength. Red markers indicate critical threats, orange are high priority, yellow are medium, and green are normal devices.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}