import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu, HardDrive, MemoryStick, Package, Server, Wifi } from 'lucide-react';

export default function DeviceInventoryPanel({ device }) {
  const deviceInfo = device.device_info || {};
  const installedSoftware = device.installed_software || [];

  return (
    <div className="space-y-4">
      {/* Hardware Specs */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            Hardware Specifications
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="flex items-start gap-2">
            <Cpu className="w-4 h-4 text-purple-400 mt-0.5" />
            <div>
              <p className="text-xs text-slate-400">CPU</p>
              <p className="text-sm text-white">{deviceInfo.cpu_model || 'Unknown'}</p>
              <p className="text-xs text-slate-500">{deviceInfo.cpu_cores || 0} cores</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <MemoryStick className="w-4 h-4 text-green-400 mt-0.5" />
            <div>
              <p className="text-xs text-slate-400">Memory</p>
              <p className="text-sm text-white">{deviceInfo.memory_total_gb || 0} GB</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <HardDrive className="w-4 h-4 text-orange-400 mt-0.5" />
            <div>
              <p className="text-xs text-slate-400">Storage</p>
              <p className="text-sm text-white">{deviceInfo.disk_total_gb || 0} GB</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Wifi className="w-4 h-4 text-blue-400 mt-0.5" />
            <div>
              <p className="text-xs text-slate-400">Network</p>
              <p className="text-sm text-white font-mono text-xs">{deviceInfo.ip_address || 'N/A'}</p>
              <p className="text-xs text-slate-500 font-mono">{deviceInfo.mac_address || 'N/A'}</p>
            </div>
          </div>

          <div className="col-span-2 pt-2 border-t border-slate-700">
            <p className="text-xs text-slate-400">Manufacturer</p>
            <p className="text-sm text-white">{deviceInfo.manufacturer || 'Unknown'} {deviceInfo.model || ''}</p>
            {deviceInfo.serial_number && (
              <p className="text-xs text-slate-500 font-mono">SN: {deviceInfo.serial_number}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Installed Software */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-400" />
            Installed Software ({installedSoftware.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {installedSoftware.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No software inventory available</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {installedSoftware.slice(0, 20).map((software, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-slate-900/50 rounded border border-slate-700">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{software.name}</p>
                    <p className="text-xs text-slate-400">
                      {software.vendor || 'Unknown vendor'} • v{software.version}
                    </p>
                  </div>
                </div>
              ))}
              {installedSoftware.length > 20 && (
                <p className="text-xs text-slate-500 text-center">
                  +{installedSoftware.length - 20} more applications
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Check-in Status */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Last Check-in</p>
              <p className="text-sm text-white">
                {device.last_check_in ? new Date(device.last_check_in).toLocaleString() : 'Never'}
              </p>
            </div>
            <Badge className={
              device.last_check_in && (Date.now() - new Date(device.last_check_in).getTime()) < 300000
                ? 'bg-green-500/20 text-green-400 border-green-500/50'
                : 'bg-slate-500/20 text-slate-400'
            }>
              {device.last_check_in && (Date.now() - new Date(device.last_check_in).getTime()) < 300000 ? 'Active' : 'Idle'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}