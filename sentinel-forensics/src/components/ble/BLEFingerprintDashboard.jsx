import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bluetooth,
  Target,
  AlertTriangle,
  CheckCircle,
  Activity
} from "lucide-react";
import { format } from "date-fns";

export default function BLEFingerprintDashboard() {
  const [selectedDevice, setSelectedDevice] = useState(null);

  const { data: devices = [] } = useQuery({
    queryKey: ['ble-fingerprints'],
    queryFn: () => base44.entities.BLEDevice.list('-last_seen', 100),
    initialData: [],
    refetchInterval: 10000
  });

  const { data: anomalies = [] } = useQuery({
    queryKey: ['ble-anomalies'],
    queryFn: () => base44.entities.BLEAnomaly.list('-detection_timestamp', 50),
    initialData: []
  });

  // Calculate statistics
  const uniqueFingerprints = new Set(devices.map(d => d.device_fingerprint_id)).size;
  const stalkingDevices = devices.filter(d => 
    d.behavioral_profile?.stalking_score > 70
  ).length;
  const highThreatDevices = devices.filter(d =>
    d.threat_assessment?.threat_score > 70
  ).length;
  const activeAnomalies = anomalies.filter(a => a.alert_status === 'new').length;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bluetooth className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-400">Unique Fingerprints</span>
            </div>
            <p className="text-2xl font-bold text-white">{uniqueFingerprints}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-red-400" />
              <span className="text-xs text-slate-400">Stalking Risk</span>
            </div>
            <p className="text-2xl font-bold text-white">{stalkingDevices}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-slate-400">High Threat</span>
            </div>
            <p className="text-2xl font-bold text-white">{highThreatDevices}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-slate-400">Active Anomalies</span>
            </div>
            <p className="text-2xl font-bold text-white">{activeAnomalies}</p>
          </CardContent>
        </Card>
      </div>

      {/* Device List */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">BLE Device Fingerprints</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {devices.map(device => (
              <div 
                key={device.id}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  device.threat_assessment?.threat_score > 70
                    ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10'
                    : 'border-slate-700 bg-slate-800/30 hover:bg-slate-800/50'
                }`}
                onClick={() => setSelectedDevice(device)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Bluetooth className="w-4 h-4 text-blue-400" />
                      <span className="font-mono text-sm text-white">
                        {device.device_fingerprint_id.slice(0, 16)}...
                      </span>
                      {device.whitelist_status === 'whitelisted' && (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      Current MAC: {device.current_mac_address}
                    </p>
                    {device.device_type_classification && (
                      <p className="text-xs text-slate-400">
                        Type: {device.device_type_classification} ({device.classification_confidence}%)
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge className={
                      device.threat_assessment?.threat_score > 70 ? 'bg-red-500' :
                      device.threat_assessment?.threat_score > 40 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }>
                      Threat: {device.threat_assessment?.threat_score || 0}
                    </Badge>
                    {device.behavioral_profile?.stalking_score > 70 && (
                      <Badge className="bg-purple-500">
                        Stalking: {device.behavioral_profile.stalking_score}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t border-slate-700">
                  <div>
                    <span className="text-slate-400">Sightings:</span>
                    <span className="text-white ml-1">{device.total_sightings}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Last Seen:</span>
                    <span className="text-white ml-1">
                      {device.last_seen ? format(new Date(device.last_seen), 'HH:mm') : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Status:</span>
                    <span className="text-white ml-1">{device.whitelist_status}</span>
                  </div>
                </div>

                {device.fingerprint_attributes && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-900/50 p-2 rounded">
                      <span className="text-slate-400">Adv Interval:</span>
                      <span className="text-white ml-1">
                        {device.fingerprint_attributes.advertising_interval_ms}ms
                      </span>
                    </div>
                    <div className="bg-slate-900/50 p-2 rounded">
                      <span className="text-slate-400">TX Power:</span>
                      <span className="text-white ml-1">
                        {device.fingerprint_attributes.tx_power_dbm}dBm
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}