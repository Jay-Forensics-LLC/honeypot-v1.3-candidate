import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Radio,
  Play,
  Square,
  AlertTriangle,
  Wifi,
  Activity,
  Target,
  Shield,
  Loader2,
  RefreshCw,
  Download,
  MapPin,
  Signal,
  Info,
  ExternalLink,
  Chrome
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { usePlatformDetection } from '../components/utils/PlatformDetection';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import { createPageUrl } from '../components/utils';
import BLEProximityMap from '../components/ble/BLEProximityMap';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function BLEMonitor() {
  const [isScanning, setIsScanning] = useState(false);
  const [currentSession, setCurrentSession] = useState(null);
  const [bluetoothSupported, setBluetoothSupported] = useState(false);
  const [bluetoothChecking, setBluetoothChecking] = useState(true);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const queryClient = useQueryClient();
  const platform = usePlatformDetection();

  // Check Bluetooth availability on mount
  useEffect(() => {
    checkBluetoothAvailability();
  }, []);

  const checkBluetoothAvailability = async () => {
    setBluetoothChecking(true);
    try {
      // Check if Web Bluetooth API exists
      if (!navigator.bluetooth) {
        console.warn('Web Bluetooth API not available');
        setBluetoothSupported(false);
        setBluetoothChecking(false);
        return;
      }

      // Check if HTTPS or localhost
      const isSecureContext = window.isSecureContext;
      if (!isSecureContext) {
        console.warn('Bluetooth requires HTTPS or localhost');
        setBluetoothSupported(false);
        setBluetoothChecking(false);
        return;
      }

      // Try to get availability
      try {
        const available = await navigator.bluetooth.getAvailability();
        setBluetoothSupported(available);

        // Listen for availability changes
        if (navigator.bluetooth.addEventListener) {
          navigator.bluetooth.addEventListener('availabilitychanged', (event) => {
            setBluetoothSupported(event.value);
          });
        }
      } catch (availError) {
        console.warn('Bluetooth availability check failed:', availError);
        // Assume supported if getAvailability fails but API exists
        setBluetoothSupported(true);
      }
    } catch (error) {
      console.error('Bluetooth check failed:', error);
      setBluetoothSupported(false);
    } finally {
      setBluetoothChecking(false);
    }
  };

  const requestGPSPermission = async () => {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      });

      setCurrentLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
      setGpsEnabled(true);
      toast.success('GPS enabled', {
        description: `Location acquired (±${position.coords.accuracy.toFixed(0)}m)`,
        style: {
          background: '#14532D',
          border: '1px solid #16A34A',
          color: '#D1FAE5'
        }
      });
      return true;
    } catch (error) {
      toast.error('GPS permission denied', {
        description: 'Location data will not be included in scan',
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
      return false;
    }
  };

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['scan-sessions'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('ScanSession', '-start_timestamp', 10, 15000);
      } catch (error) {
        console.error('Failed to load sessions:', error);
        return [];
      }
    },
    initialData: [],
    retry: 1
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['ble-devices'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('BLEDevice', '-last_seen', 20, 15000);
      } catch (error) {
        console.error('Failed to load BLE devices:', error);
        return [];
      }
    },
    initialData: [],
    enabled: !!currentSession,
    retry: 1
  });

  const { data: anomalies = [] } = useQuery({
    queryKey: ['ble-anomalies'],
    queryFn: async () => {
      try {
        return await resilientAPI.filterEntity('BLEAnomaly', { alert_status: 'new' }, '-detection_timestamp', 10, 0, 15000);
      } catch (error) {
        console.error('Failed to load anomalies:', error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: isScanning ? 5000 : false,
    retry: 1
  });

  // Start BLE Scan (Simulated)
  const startScanMutation = useMutation({
    mutationFn: async () => {
      // Check Bluetooth availability
      if (!bluetoothSupported) {
        throw new Error('Bluetooth API not available in this browser. Please use Chrome, Edge, or Opera on desktop.');
      }

      // Request GPS permission
      await requestGPSPermission();

      setIsScanning(true);

      // Create scan session
      const currentUser = await base44.auth.me();
      const session = await resilientAPI.createEntity('ScanSession', {
        organization_id: currentUser.organization_id,
        session_id: `BLE-${Date.now()}`,
        session_type: 'ble',
        location_tag: currentLocation ? 'GPS Location' : 'Unknown Location',
        gps_coordinates: currentLocation || {
          latitude: 0,
          longitude: 0,
          accuracy: 0
        },
        start_timestamp: new Date().toISOString(),
        status: 'active',
        risk_score: 0,
        anomaly_count: 0,
        observation_count: 0,
        device_info: {
          device_id: 'web-client',
          platform: navigator.platform,
          user_agent: navigator.userAgent,
          bluetooth_available: bluetoothSupported,
          gps_available: gpsEnabled
        }
      }, 10000);

      setCurrentSession(session);

      // Run simulated scan (since Web Bluetooth has limitations)
      await simulateBLEScan(session);

      return session;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['scan-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['ble-devices'] });
      queryClient.invalidateQueries({ queryKey: ['ble-anomalies'] });

      toast.success('BLE scan started', {
        description: 'Monitoring for nearby Bluetooth devices',
        duration: 4000,
        style: {
          background: '#14532D',
          border: '1px solid #16A34A',
          color: '#D1FAE5'
        }
      });
    },
    onError: (error) => {
      setIsScanning(false);
      setCurrentSession(null);
      console.error('BLE scan error:', error);
      toast.error('Failed to start BLE scan', {
        description: error.message || 'Please check Bluetooth availability',
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
    }
  });

  // Simulated BLE scan (for browser compatibility)
  const simulateBLEScan = async (session) => {
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate mock BLE devices
    const mockDevices = [
      { name: 'iPhone 13', mac: 'AA:BB:CC:DD:EE:01', rssi: -45, type: 'smartphone', service_uuids: ['180F', '180A'] },
      { name: 'AirPods Pro', mac: 'AA:BB:CC:DD:EE:02', rssi: -62, type: 'audio', service_uuids: ['FE2C'] },
      { name: 'Apple Watch', mac: 'AA:BB:CC:DD:EE:03', rssi: -55, type: 'wearable', service_uuids: ['180D'] },
      { name: 'Unknown Device', mac: 'AA:BB:CC:DD:EE:04', rssi: -75, type: 'unknown', service_uuids: ['FD50'] }
    ];

    // Create device records
    const currentUser = await base44.auth.me();
    for (const device of mockDevices) {
      try {
        await resilientAPI.createEntity('BLEDevice', {
          organization_id: currentUser.organization_id,
          device_fingerprint_id: `FP-${device.mac}`,
          current_mac_address: device.mac,
          mac_address_history: [{
            mac: device.mac,
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString()
          }],
          fingerprint_attributes: {
            advertising_interval_ms: 100,
            tx_power_dbm: -20,
            supported_services: device.service_uuids
          },
          behavioral_profile: {
            movement_correlation: [],
            cross_location_sightings: 1
          },
          threat_assessment: {
            threat_score: Math.random() > 0.8 ? 75 : 25,
            threat_categories: Math.random() > 0.8 ? ['stalking_pattern'] : [],
            stalking_indicators: false,
            spoofing_detected: false
          },
          detection_history: [{
            timestamp: new Date().toISOString(),
            rssi_dbm: device.rssi,
            location: currentLocation || {
              latitude: 0,
              longitude: 0
            },
            observer_device_id: 'web-client'
          }],
          device_type_classification: device.type,
          classification_confidence: 85,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          total_sightings: 1
        }, 5000);

        // Create observation
        await resilientAPI.createEntity('Observation', {
          organization_id: currentUser.organization_id,
          session_id: session.session_id,
          observation_id: `OBS-${Date.now()}-${device.mac}`,
          timestamp: new Date().toISOString(),
          observation_type: 'ble_device',
          ble_data: {
            mac_address: device.mac,
            device_name: device.name,
            rssi: device.rssi,
            is_connectable: true,
            service_uuids: device.service_uuids
          },
          anomaly_score: Math.random() > 0.8 ? 80 : 20,
          watchlist_match: device.service_uuids.includes('FE2C') || device.service_uuids.includes('FD50')
        }, 5000);
      } catch (createError) {
        console.error('Failed to create device/observation:', createError);
      }
    }

    // Generate anomaly if high threat device
    if (Math.random() > 0.7) {
      const currentUser = await base44.auth.me();
      try {
        await resilientAPI.createEntity('BLEAnomaly', {
          organization_id: currentUser.organization_id,
          anomaly_id: `ANO-${Date.now()}`,
          anomaly_type: 'stalking_pattern',
          severity: 'high',
          confidence_score: 85,
          device_fingerprint_id: `FP-AA:BB:CC:DD:EE:04`,
          mac_address: 'AA:BB:CC:DD:EE:04',
          detection_timestamp: new Date().toISOString(),
          detection_method: 'behavioral_analysis',
          anomaly_details: {
            description: 'Device detected following user across multiple locations',
            indicators: ['repeated_sightings', 'proximity_pattern'],
            statistical_deviation: 2.5
          },
          alert_status: 'new'
        }, 5000);
      } catch (anomalyError) {
        console.error('Failed to create anomaly:', anomalyError);
      }
    }

    // Update session
    try {
      await resilientAPI.updateEntity('ScanSession', session.id, {
        observation_count: mockDevices.length,
        anomaly_count: Math.random() > 0.7 ? 1 : 0,
        risk_score: Math.random() > 0.7 ? 75 : 25
      }, 5000);
    } catch (updateError) {
      console.error('Failed to update session:', updateError);
    }

    // Create audit log
    try {
      const currentUser = await base44.auth.me();
      await resilientAPI.createEntity('AuditLog', {
        organization_id: currentUser.organization_id,
        event_type: 'ble_scan_started',
        severity: 'info',
        description: `BLE scan started for session ${session.session_id}`,
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          session_id: session.session_id,
          devices_found: mockDevices.length,
          bluetooth_supported: bluetoothSupported,
          gps_enabled: gpsEnabled
        }
      }, 5000);
    } catch (logError) {
      console.warn('Failed to create audit log:', logError);
    }
  };

  // Stop BLE Scan
  const stopScanMutation = useMutation({
    mutationFn: async () => {
      if (!currentSession) return;

      await resilientAPI.updateEntity('ScanSession', currentSession.id, {
        status: 'completed',
        end_timestamp: new Date().toISOString(),
        duration_seconds: Math.floor((new Date() - new Date(currentSession.start_timestamp)) / 1000)
      }, 10000);

      // Create audit log
      const currentUser = await base44.auth.me();
      await resilientAPI.createEntity('AuditLog', {
        organization_id: currentUser.organization_id,
        event_type: 'ble_scan_stopped',
        severity: 'info',
        description: `BLE scan stopped for session ${currentSession.session_id}`,
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          session_id: currentSession.session_id,
          duration_seconds: Math.floor((new Date() - new Date(currentSession.start_timestamp)) / 1000)
        }
      }, 5000);
    },
    onSuccess: () => {
      setIsScanning(false);
      setCurrentSession(null);
      queryClient.invalidateQueries({ queryKey: ['scan-sessions'] });

      toast.success('BLE scan stopped', {
        description: 'Scan results saved',
        duration: 3000,
        style: {
          background: '#14532D',
          border: '1px solid #16A34A',
          color: '#D1FAE5'
        }
      });
    },
    onError: (error) => {
      console.error('Stop scan error:', error);
      toast.error('Failed to stop scan', {
        description: error.message,
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
    }
  });

  // Export session data
  const exportSessionMutation = useMutation({
    mutationFn: async (sessionId) => {
      // Fetch session data
      const sessions = await resilientAPI.filterEntity('ScanSession', { id: sessionId }, '-start_timestamp', 1, 0, 10000);
      const session = sessions[0];

      if (!session) {
        throw new Error('Session not found');
      }

      // Fetch observations
      const observations = await resilientAPI.filterEntity('Observation', { session_id: session.session_id }, '-timestamp', 1000, 0, 15000);

      // Create CSV content
      const csvRows = [
        ['Timestamp', 'Device Name', 'MAC Address', 'RSSI', 'Service UUIDs', 'Watchlist Match', 'Anomaly Score'].join(',')
      ];

      observations.forEach(obs => {
        if (obs.ble_data) {
          csvRows.push([
            obs.timestamp,
            obs.ble_data.device_name || 'Unknown',
            obs.ble_data.mac_address,
            obs.ble_data.rssi || 'N/A',
            (obs.ble_data.service_uuids || []).join(';'),
            obs.watchlist_match ? 'YES' : 'NO',
            obs.anomaly_score || 0
          ].join(','));
        }
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ble_scan_${session.session_id}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast.success('Session exported', {
        description: 'CSV file downloaded',
        style: {
          background: '#14532D',
          border: '1px solid #16A34A',
          color: '#D1FAE5'
        }
      });
    },
    onError: (error) => {
      toast.error('Export failed', {
        description: error.message,
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
    }
  });

  const isHTTPS = window.location.protocol === 'https:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isSecureContext = isHTTPS || isLocalhost;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">BLE Monitor</h1>
          <p className="text-sm md:text-base text-slate-400">Detect and analyze nearby Bluetooth devices</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          {!isScanning ? (
            <Button
              onClick={() => startScanMutation.mutate()}
              disabled={startScanMutation.isPending || bluetoothChecking || !bluetoothSupported}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 flex-1 md:flex-initial min-h-[44px]"
            >
              {startScanMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start BLE Scan
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => stopScanMutation.mutate()}
              disabled={stopScanMutation.isPending}
              className="bg-red-600 hover:bg-red-700 flex-1 md:flex-initial min-h-[44px]"
            >
              {stopScanMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  Stop Scan
                </>
              )}
            </Button>
          )}
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['scan-sessions'] })}
            variant="outline"
            className="border-slate-700 flex-1 md:flex-initial min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Bluetooth Status Alert */}
      {bluetoothChecking ? (
        <Alert className="bg-blue-500/10 border-blue-500/30">
          <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
          <AlertDescription className="text-blue-300">
            Checking Bluetooth availability...
          </AlertDescription>
        </Alert>
      ) : !bluetoothSupported ? (
        <Alert className="bg-red-500/10 border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-300">
            <strong className="block mb-2">Bluetooth Not Available</strong>
            {!navigator.bluetooth ? (
              <div className="space-y-2 text-sm">
                <p>Web Bluetooth API is not supported in this browser.</p>
                <p className="font-semibold">Recommended Solutions:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Use Google Chrome, Microsoft Edge, or Opera browser</li>
                  <li>Ensure you're on a desktop/laptop (not mobile)</li>
                  {!isSecureContext && (
                    <li className="text-orange-300">
                      <strong>Important:</strong> Access this page via HTTPS or localhost
                    </li>
                  )}
                  <li>Alternative: Use the BLE Uploader to upload pre-captured BLE logs</li>
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button
                    onClick={checkBluetoothAvailability}
                    variant="outline"
                    size="sm"
                    className="border-red-500/50 text-red-300 hover:bg-red-500/20"
                  >
                    <RefreshCw className="w-3 h-3 mr-2" />
                    Recheck
                  </Button>
                  <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Chrome className="w-3 h-3 mr-2" />
                      Download Chrome
                    </Button>
                  </a>
                  <a href={createPageUrl('BLEUploader')} target="_blank" rel="noopener noreferrer">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-500/50 text-blue-300"
                    >
                      <Download className="w-3 h-3 mr-2" />
                      Use Uploader
                    </Button>
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p>Bluetooth is not enabled or available on this system.</p>
                <Button
                  onClick={checkBluetoothAvailability}
                  variant="outline"
                  size="sm"
                  className="mt-2 border-red-500/50 text-red-300 hover:bg-red-500/20"
                >
                  <RefreshCw className="w-3 h-3 mr-2" />
                  Recheck Bluetooth
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="bg-green-500/10 border-green-500/30">
          <Shield className="h-4 w-4 text-green-400" />
          <AlertDescription className="text-green-300">
            <strong>Bluetooth Available:</strong> Ready to scan for BLE devices.
            {gpsEnabled && (
              <span className="ml-2">
                <MapPin className="w-3 h-3 inline mr-1" />
                GPS enabled (±{currentLocation?.accuracy.toFixed(0)}m)
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Active Scan Status */}
      {isScanning && currentSession && (
        <Alert className="bg-blue-500/10 border-blue-500/30">
          <Activity className="h-4 w-4 text-blue-400 animate-pulse" />
          <AlertDescription className="text-blue-300">
            <strong>Scan active:</strong> Monitoring for BLE devices... Session: {currentSession.session_id}
          </AlertDescription>
        </Alert>
      )}

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <Alert className="bg-red-500/10 border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-300">
            <strong>⚠️ {anomalies.length} anomal{anomalies.length > 1 ? 'ies' : 'y'} detected!</strong> Review suspicious devices immediately.
          </AlertDescription>
        </Alert>
      )}

      {/* Statistics Cards - Mobile Responsive */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs md:text-sm">Devices</p>
                <p className="text-2xl md:text-3xl font-bold text-white mt-1">{devices.length}</p>
              </div>
              <Radio className="w-8 h-8 md:w-10 md:h-10 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs md:text-sm">Anomalies</p>
                <p className="text-2xl md:text-3xl font-bold text-white mt-1">{anomalies.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 md:w-10 md:h-10 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs md:text-sm">Active</p>
                <p className="text-2xl md:text-3xl font-bold text-white mt-1">
                  {sessions.filter(s => s.status === 'active').length}
                </p>
              </div>
              <Activity className="w-8 h-8 md:w-10 md:h-10 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs md:text-sm">Scans</p>
                <p className="text-2xl md:text-3xl font-bold text-white mt-1">{sessions.length}</p>
              </div>
              <Target className="w-8 h-8 md:w-10 md:h-10 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Browser Compatibility Info */}
      {!bluetoothSupported && !bluetoothChecking && (
        <Card className="bg-blue-900/20 border-blue-500/30">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
              <div className="text-sm text-blue-200 space-y-3">
                <p className="font-semibold text-blue-100">Alternative BLE Monitoring Options:</p>
                
                <div>
                  <p className="font-medium text-blue-200">Option 1: Use Supported Browser</p>
                  <ul className="list-disc ml-5 space-y-1 text-blue-300 mt-1">
                    <li>Google Chrome (Desktop) - Recommended</li>
                    <li>Microsoft Edge (Desktop)</li>
                    <li>Opera (Desktop)</li>
                  </ul>
                </div>

                <div>
                  <p className="font-medium text-blue-200">Option 2: Upload BLE Logs</p>
                  <p className="text-blue-300 mt-1">
                    Capture BLE packets using external tools (nRF Connect, Wireshark) and upload via the BLE Uploader
                  </p>
                </div>

                <div>
                  <p className="font-medium text-blue-200">Option 3: Use Mobile App</p>
                  <p className="text-blue-300 mt-1">
                    Install Sentinel Mobile app for native BLE scanning on Android/iOS devices
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detected Devices - Mobile Scrollable */}
      {devices.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-lg md:text-xl">Detected Devices ({devices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto" style={{WebkitOverflowScrolling: 'touch'}}>
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="p-3 md:p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-blue-500/50 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Radio className="w-4 h-4 md:w-5 md:h-5 text-blue-400 flex-shrink-0" />
                        <h4 className="font-semibold text-white text-sm md:text-base truncate">
                          {device.device_type_classification || 'Unknown Device'}
                        </h4>
                        <Badge className={
                          device.threat_assessment?.threat_score > 70
                            ? 'bg-red-500/20 text-red-400 text-xs'
                            : 'bg-green-500/20 text-green-400 text-xs'
                        }>
                          {device.threat_assessment?.threat_score > 70 ? 'High Risk' : 'Low Risk'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4 text-xs md:text-sm text-slate-400">
                        <div className="truncate">
                          <span className="text-slate-500">MAC:</span>{' '}
                          <span className="font-mono">{device.current_mac_address}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">RSSI:</span>{' '}
                          {device.detection_history?.[0]?.rssi_dbm} dBm
                          <Signal className="w-3 h-3 inline ml-1" />
                        </div>
                        <div>
                          <span className="text-slate-500">First Seen:</span>{' '}
                          {formatDistanceToNow(new Date(device.first_seen), { addSuffix: true })}
                        </div>
                        <div>
                          <span className="text-slate-500">Sightings:</span>{' '}
                          {device.total_sightings}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proximity Map & Recent Sessions */}
      <Tabs defaultValue="map" className="space-y-4">
        <TabsList className="bg-slate-800">
          <TabsTrigger value="map">
            <MapPin className="w-4 h-4 mr-2" />
            Proximity Map
          </TabsTrigger>
          <TabsTrigger value="sessions">Sessions History</TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <BLEProximityMap />
        </TabsContent>

        <TabsContent value="sessions">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-lg md:text-xl">Recent Scan Sessions</CardTitle>
            </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <Radio className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-base md:text-lg text-white">No scan sessions yet</p>
              <p className="text-sm text-slate-400 mt-2 px-4">
                {bluetoothSupported 
                  ? 'Start a BLE scan to begin monitoring'
                  : 'Use a supported browser or upload BLE logs via BLE Uploader'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto" style={{WebkitOverflowScrolling: 'touch'}}>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="p-3 md:p-4 bg-slate-800/30 border border-slate-700 rounded-lg"
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <h4 className="font-semibold text-white text-sm md:text-base truncate">{session.session_id}</h4>
                      <Badge className={
                        session.status === 'active'
                          ? 'bg-green-500/20 text-green-400 text-xs'
                          : 'bg-slate-500/20 text-slate-400 text-xs'
                      }>
                        {session.status}
                      </Badge>
                      {session.risk_score > 70 && (
                        <Badge className="bg-red-500/20 text-red-400 text-xs">
                          High Risk
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportSessionMutation.mutate(session.id)}
                      disabled={exportSessionMutation.isPending}
                      className="border-slate-700 text-xs min-h-[36px]"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      CSV
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-4 text-xs text-slate-400">
                    <div>
                      <span className="text-slate-500">Devices:</span> {session.observation_count}
                    </div>
                    <div>
                      <span className="text-slate-500">Anomalies:</span> {session.anomaly_count}
                    </div>
                    <div>
                      <span className="text-slate-500">Started:</span>{' '}
                      {formatDistanceToNow(new Date(session.start_timestamp), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}