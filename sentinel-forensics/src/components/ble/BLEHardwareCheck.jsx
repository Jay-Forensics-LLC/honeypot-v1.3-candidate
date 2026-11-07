import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Bluetooth,
  RefreshCw,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';

export default function BLEHardwareCheck({ onStatusChange }) {
  const [bleStatus, setBleStatus] = useState({
    available: null,
    enabled: null,
    scanning: false,
    error: null
  });
  const [checking, setChecking] = useState(false);

  const checkBLECapability = async () => {
    setChecking(true);
    
    try {
      // Check if Web Bluetooth API is available
      if (!navigator.bluetooth) {
        setBleStatus({
          available: false,
          enabled: false,
          scanning: false,
          error: 'Web Bluetooth API not supported in this browser'
        });
        toast.error('Bluetooth not supported', {
          description: 'Try using Chrome, Edge, or Opera browser'
        });
        onStatusChange?.(false);
        setChecking(false);
        return;
      }

      // Check if Bluetooth is available on the device
      const availability = await navigator.bluetooth.getAvailability();
      
      if (!availability) {
        setBleStatus({
          available: false,
          enabled: false,
          scanning: false,
          error: 'No Bluetooth adapter detected on this device'
        });
        toast.error('No Bluetooth hardware found');
        onStatusChange?.(false);
        setChecking(false);
        return;
      }

      // Try to request a device to check if Bluetooth is enabled
      // This will fail if Bluetooth is disabled
      try {
        // Check permission state
        const permissionStatus = await navigator.permissions.query({ name: 'bluetooth' });
        
        setBleStatus({
          available: true,
          enabled: permissionStatus.state !== 'denied',
          scanning: false,
          error: null
        });

        if (permissionStatus.state === 'denied') {
          toast.warning('Bluetooth permission denied', {
            description: 'Please allow Bluetooth access in browser settings'
          });
          onStatusChange?.(false);
        } else {
          toast.success('Bluetooth ready', {
            description: 'Hardware detected and functional'
          });
          onStatusChange?.(true);
        }
      } catch (permError) {
        // If permission query fails, Bluetooth is likely available but not permitted
        setBleStatus({
          available: true,
          enabled: false,
          scanning: false,
          error: 'Bluetooth permission not granted'
        });
        onStatusChange?.(false);
      }

    } catch (error) {
      console.error('BLE check error:', error);
      setBleStatus({
        available: false,
        enabled: false,
        scanning: false,
        error: error.message
      });
      toast.error('Bluetooth check failed', {
        description: error.message
      });
      onStatusChange?.(false);
    }
    
    setChecking(false);
  };

  const requestBluetoothAccess = async () => {
    try {
      // Request device to trigger permission prompt
      await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: []
      });
      
      toast.success('Bluetooth access granted');
      checkBLECapability();
    } catch (error) {
      if (error.name === 'NotFoundError') {
        toast.info('No device selected', {
          description: 'Please select a device or cancel to enable scanning'
        });
      } else {
        toast.error('Access denied', {
          description: error.message
        });
      }
    }
  };

  useEffect(() => {
    checkBLECapability();
  }, []);

  const getStatusIcon = () => {
    if (checking) return <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
    if (bleStatus.available === null) return <Bluetooth className="w-5 h-5 text-slate-400" />;
    if (bleStatus.available && bleStatus.enabled) return <CheckCircle className="w-5 h-5 text-green-400" />;
    if (bleStatus.available && !bleStatus.enabled) return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    return <XCircle className="w-5 h-5 text-red-400" />;
  };

  const getStatusColor = () => {
    if (bleStatus.available && bleStatus.enabled) return 'bg-green-500/20 text-green-400 border-green-500/50';
    if (bleStatus.available && !bleStatus.enabled) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    return 'bg-red-500/20 text-red-400 border-red-500/50';
  };

  const getStatusText = () => {
    if (checking) return 'Checking...';
    if (bleStatus.available && bleStatus.enabled) return 'Ready';
    if (bleStatus.available && !bleStatus.enabled) return 'Permission Required';
    return 'Not Available';
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Bluetooth className="w-5 h-5 text-blue-400" />
          Bluetooth Hardware Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <p className="font-semibold text-white">Bluetooth Status</p>
              <p className="text-xs text-slate-400">
                {bleStatus.available === null && 'Checking hardware...'}
                {bleStatus.available === false && 'Bluetooth not available'}
                {bleStatus.available === true && bleStatus.enabled && 'Hardware detected and ready'}
                {bleStatus.available === true && !bleStatus.enabled && 'Hardware detected, permission needed'}
              </p>
            </div>
          </div>
          <Badge className={getStatusColor()}>
            {getStatusText()}
          </Badge>
        </div>

        {bleStatus.error && (
          <Alert className="bg-red-500/10 border-red-500/50">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <AlertDescription className="text-red-200">
              {bleStatus.error}
            </AlertDescription>
          </Alert>
        )}

        {bleStatus.available === false && (
          <Alert className="bg-orange-500/10 border-orange-500/50">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <AlertDescription className="text-orange-200">
              <p className="font-semibold mb-2">Bluetooth not detected</p>
              <p className="text-sm">Possible solutions:</p>
              <ul className="list-disc list-inside text-xs mt-2 space-y-1">
                <li>Ensure your device has Bluetooth hardware</li>
                <li>Check if Bluetooth is enabled in system settings</li>
                <li>Use Chrome, Edge, or Opera browser (Firefox doesn't support Web Bluetooth)</li>
                <li>Try restarting your browser</li>
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {bleStatus.available === true && !bleStatus.enabled && (
          <Alert className="bg-yellow-500/10 border-yellow-500/50">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <AlertDescription className="text-yellow-200">
              <p className="font-semibold mb-2">Permission Required</p>
              <p className="text-sm">Click the button below to grant Bluetooth access</p>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            onClick={checkBLECapability}
            disabled={checking}
            variant="outline"
            className="flex-1 border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
            Recheck
          </Button>
          
          {bleStatus.available && !bleStatus.enabled && (
            <Button
              onClick={requestBluetoothAccess}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <Settings className="w-4 h-4 mr-2" />
              Grant Access
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700">
          <div>
            <p className="text-xs text-slate-500">Browser Support</p>
            <p className="text-sm text-white">{navigator.bluetooth ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Hardware Detected</p>
            <p className="text-sm text-white">{bleStatus.available === true ? 'Yes' : bleStatus.available === false ? 'No' : 'Checking...'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}