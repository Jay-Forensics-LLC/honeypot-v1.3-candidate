import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Radio, Activity, AlertTriangle, TrendingUp, Zap, Eye, Filter } from "lucide-react";
import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export default function BLEActivityDashboard() {
  const [liveMode, setLiveMode] = useState(false);
  const [rssiData, setRssiData] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const { data: observations = [] } = useQuery({
    queryKey: ['ble-observations'],
    queryFn: async () => {
      const allObs = await base44.entities.Observation.list('-timestamp', 1000);
      return allObs.filter(obs => obs.observation_type === 'ble_device' && obs.ble_data);
    },
    refetchInterval: liveMode ? 2000 : false,
    initialData: []
  });

  const { data: anomalies = [] } = useQuery({
    queryKey: ['ble-anomalies'],
    queryFn: () => base44.entities.BLEAnomaly.list('-detection_timestamp', 100),
    refetchInterval: liveMode ? 3000 : false,
    initialData: []
  });

  // Process observations for visualization
  useEffect(() => {
    if (observations.length > 0) {
      // Group by MAC address
      const deviceMap = new Map();
      
      observations.forEach(obs => {
        const mac = obs.ble_data?.mac_address;
        if (!mac) return;

        if (!deviceMap.has(mac)) {
          deviceMap.set(mac, {
            mac_address: mac,
            device_name: obs.ble_data?.device_name || 'Unknown',
            rssi_history: [],
            avg_rssi: 0,
            sightings: 0,
            service_uuids: obs.ble_data?.service_uuids || [],
            last_seen: obs.timestamp,
            is_suspicious: false
          });
        }

        const device = deviceMap.get(mac);
        device.rssi_history.push({
          timestamp: new Date(obs.timestamp).getTime(),
          rssi: obs.ble_data?.rssi || 0,
          tx_power: obs.ble_data?.tx_power || 0
        });
        device.sightings++;
        device.last_seen = obs.timestamp;
        
        // Check for anomalies
        if (obs.anomaly_score > 50) {
          device.is_suspicious = true;
        }
      });

      // Calculate averages
      deviceMap.forEach(device => {
        const rssiValues = device.rssi_history.map(h => h.rssi);
        device.avg_rssi = rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length;
      });

      setRssiData(Array.from(deviceMap.values()));
    }
  }, [observations]);

  // Live RSSI data for selected device
  const getDeviceRSSITimeline = (macAddress) => {
    const device = rssiData.find(d => d.mac_address === macAddress);
    if (!device) return [];

    return device.rssi_history
      .slice(-50) // Last 50 readings
      .map((reading, idx) => ({
        index: idx,
        time: new Date(reading.timestamp).toLocaleTimeString(),
        rssi: reading.rssi,
        tx_power: reading.tx_power
      }));
  };

  // UUID Grouping Analysis
  const getUUIDGroups = () => {
    const uuidMap = new Map();
    
    rssiData.forEach(device => {
      device.service_uuids?.forEach(uuid => {
        if (!uuidMap.has(uuid)) {
          uuidMap.set(uuid, {
            uuid,
            device_count: 0,
            devices: []
          });
        }
        const group = uuidMap.get(uuid);
        group.device_count++;
        group.devices.push(device.mac_address);
      });
    });

    return Array.from(uuidMap.values()).sort((a, b) => b.device_count - a.device_count);
  };

  // Signal Correlation Analysis
  const getSignalCorrelation = () => {
    return rssiData.map(device => ({
      name: device.device_name || device.mac_address.substring(0, 8),
      mac: device.mac_address,
      rssi: Math.round(device.avg_rssi),
      sightings: device.sightings,
      suspicious: device.is_suspicious
    }));
  };

  // Anomaly Detection
  const detectAnomalies = () => {
    const detected = [];

    rssiData.forEach(device => {
      // Spoofed Fast Pair detection
      if (device.service_uuids?.some(uuid => uuid.toLowerCase().includes('fe2c'))) {
        const rssiVariance = calculateRSSIVariance(device.rssi_history);
        if (rssiVariance < 2) {
          detected.push({
            type: 'Spoofed Fast Pair',
            device: device.mac_address,
            severity: 'high',
            description: 'Suspiciously consistent RSSI pattern detected for Fast Pair device'
          });
        }
      }

      // TUYA device detection
      if (device.device_name?.toLowerCase().includes('tuya') || 
          device.service_uuids?.some(uuid => uuid.toLowerCase().includes('1910'))) {
        detected.push({
          type: 'TUYA Device',
          device: device.mac_address,
          severity: 'medium',
          description: 'TUYA IoT device detected - potential privacy concern'
        });
      }

      // MAC randomization abuse
      const recentSightings = device.rssi_history.slice(-10);
      if (recentSightings.length >= 5) {
        const timeDeltas = [];
        for (let i = 1; i < recentSightings.length; i++) {
          timeDeltas.push(recentSightings[i].timestamp - recentSightings[i-1].timestamp);
        }
        const avgDelta = timeDeltas.reduce((a, b) => a + b, 0) / timeDeltas.length;
        
        if (avgDelta < 500) { // Less than 500ms between sightings
          detected.push({
            type: 'Rapid Advertising',
            device: device.mac_address,
            severity: 'medium',
            description: 'Abnormally high advertising frequency detected'
          });
        }
      }

      // Stalking pattern (persistent close proximity)
      if (device.avg_rssi > -50 && device.sightings > 100) {
        detected.push({
          type: 'Persistent Proximity',
          device: device.mac_address,
          severity: 'critical',
          description: 'Device consistently in close proximity - possible stalking'
        });
      }
    });

    return detected;
  };

  const calculateRSSIVariance = (rssiHistory) => {
    if (rssiHistory.length < 2) return 0;
    
    const values = rssiHistory.map(r => r.rssi);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  };

  const uuidGroups = getUUIDGroups();
  const signalCorrelation = getSignalCorrelation();
  const detectedAnomalies = detectAnomalies();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">BLE Activity Dashboard</h2>
          <p className="text-slate-400">Real-time Bluetooth Low Energy monitoring and analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={liveMode ? "bg-green-500 animate-pulse" : "bg-slate-700"}>
            {liveMode ? 'LIVE' : 'PAUSED'}
          </Badge>
          <Button
            onClick={() => setLiveMode(!liveMode)}
            className={liveMode ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
          >
            {liveMode ? <><Zap className="w-4 h-4 mr-2" /> Stop Live</> : <><Activity className="w-4 h-4 mr-2" /> Start Live</>}
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Radio className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{rssiData.length}</p>
                <p className="text-xs text-slate-400">Active Devices</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Activity className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">{observations.length}</p>
                <p className="text-xs text-slate-400">Total Observations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-3xl font-bold text-white">{detectedAnomalies.length}</p>
                <p className="text-xs text-slate-400">Anomalies Detected</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Eye className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">{uuidGroups.length}</p>
                <p className="text-xs text-slate-400">Service UUIDs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="rssi" className="space-y-6">
        <TabsList className="bg-slate-900/50">
          <TabsTrigger value="rssi">
            <TrendingUp className="w-4 h-4 mr-2" />
            RSSI Graphs
          </TabsTrigger>
          <TabsTrigger value="correlation">
            <Activity className="w-4 h-4 mr-2" />
            Signal Correlation
          </TabsTrigger>
          <TabsTrigger value="uuids">
            <Filter className="w-4 h-4 mr-2" />
            UUID Grouping
          </TabsTrigger>
          <TabsTrigger value="anomalies">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Anomaly Detection
          </TabsTrigger>
        </TabsList>

        {/* RSSI Graphs */}
        <TabsContent value="rssi">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle>Live RSSI Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDevice ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{selectedDevice.device_name}</h3>
                      <p className="text-sm text-slate-400 font-mono">{selectedDevice.mac_address}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setSelectedDevice(null)}>
                      Back to All Devices
                    </Button>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={getDeviceRSSITimeline(selectedDevice.mac_address)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="time" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" domain={[-100, 0]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                        labelStyle={{ color: '#f1f5f9' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="rssi" stroke="#3b82f6" strokeWidth={2} name="RSSI (dBm)" />
                      <Line type="monotone" dataKey="tx_power" stroke="#10b981" strokeWidth={1} name="TX Power" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-400 text-sm mb-4">Select a device to view detailed RSSI timeline</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    {rssiData.slice(0, 8).map(device => (
                      <div
                        key={device.mac_address}
                        onClick={() => setSelectedDevice(device)}
                        className="p-4 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-500 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-white text-sm">{device.device_name}</h4>
                          {device.is_suspicious && (
                            <Badge className="bg-red-500/20 text-red-400">
                              Suspicious
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-mono mb-2">{device.mac_address}</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Avg RSSI:</span>
                          <span className={`font-mono font-bold ${
                            device.avg_rssi > -50 ? 'text-green-400' :
                            device.avg_rssi > -70 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {Math.round(device.avg_rssi)} dBm
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-slate-500">Sightings:</span>
                          <span className="text-white">{device.sightings}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Signal Correlation */}
        <TabsContent value="correlation">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle>Signal Strength Correlation</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="sightings" name="Sightings" stroke="#94a3b8" />
                  <YAxis dataKey="rssi" name="Avg RSSI" stroke="#94a3b8" domain={[-100, 0]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                    labelStyle={{ color: '#f1f5f9' }}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <Legend />
                  <Scatter name="BLE Devices" data={signalCorrelation} fill="#3b82f6">
                    {signalCorrelation.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.suspicious ? '#ef4444' : '#3b82f6'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>

              <div className="mt-6 space-y-2">
                <h4 className="text-sm font-semibold text-white mb-3">Device Details:</h4>
                {signalCorrelation.slice(0, 10).map((device, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                    <div>
                      <p className="text-sm font-semibold text-white">{device.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{device.mac}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-slate-400">RSSI: <span className="text-white font-mono">{device.rssi} dBm</span></span>
                      <span className="text-slate-400">Seen: <span className="text-white">{device.sightings}x</span></span>
                      {device.suspicious && (
                        <Badge className="bg-red-500/20 text-red-400">Suspicious</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* UUID Grouping */}
        <TabsContent value="uuids">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle>Service UUID Grouping</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={uuidGroups.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="uuid" stroke="#94a3b8" angle={-45} textAnchor="end" height={100} />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                    labelStyle={{ color: '#f1f5f9' }}
                  />
                  <Legend />
                  <Bar dataKey="device_count" fill="#8b5cf6" name="Device Count" />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-6 space-y-2">
                <h4 className="text-sm font-semibold text-white mb-3">UUID Analysis:</h4>
                {uuidGroups.slice(0, 10).map((group, idx) => (
                  <div key={idx} className="p-3 bg-slate-800/50 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <code className="text-xs text-purple-400">{group.uuid}</code>
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {group.device_count} device{group.device_count !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      Devices: {group.devices.slice(0, 3).join(', ')}
                      {group.devices.length > 3 && ` +${group.devices.length - 3} more`}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anomaly Detection */}
        <TabsContent value="anomalies">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Built-in Anomaly Detection
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detectedAnomalies.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Activity className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p>No anomalies detected</p>
                  <p className="text-sm mt-2">All BLE activity appears normal</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {detectedAnomalies.map((anomaly, idx) => {
                    const severityColors = {
                      critical: 'border-red-500 bg-red-500/10',
                      high: 'border-orange-500 bg-orange-500/10',
                      medium: 'border-yellow-500 bg-yellow-500/10',
                      low: 'border-blue-500 bg-blue-500/10'
                    };

                    return (
                      <div key={idx} className={`p-4 rounded-lg border-2 ${severityColors[anomaly.severity]}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-semibold text-white mb-1">{anomaly.type}</h4>
                            <code className="text-xs text-slate-400">{anomaly.device}</code>
                          </div>
                          <Badge className={
                            anomaly.severity === 'critical' ? 'bg-red-500' :
                            anomaly.severity === 'high' ? 'bg-orange-500' :
                            anomaly.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                          }>
                            {anomaly.severity.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-300">{anomaly.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}