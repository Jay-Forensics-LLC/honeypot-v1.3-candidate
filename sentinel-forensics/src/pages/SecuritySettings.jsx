import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  Radio,
  Network,
  Usb,
  Database,
  Activity,
  Save,
  RefreshCw,
  Info,
  CheckCircle,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function SecuritySettings() {
  const queryClient = useQueryClient();

  // Fetch user settings
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const [settings, setSettings] = useState({
    intrusion_feed_enabled: true,
    evidence_locker_enabled: true,
    ble_tracker_enabled: true,
    network_listeners_enabled: false,
    usb_sentinels_enabled: false,
    integrity_monitor_enabled: false,
    auto_bluetooth_control: true,
    gps_permission_auto_request: true,
    offline_mode_enabled: true,
    auto_export_to_locker: true,
    notification_on_threats: true,
    scheduled_scans_enabled: false,
    schedule_interval_hours: 12
  });

  const [hasChanges, setHasChanges] = useState(false);

  // Load settings from user profile
  const { data: userSettings, isLoading } = useQuery({
    queryKey: ['security-settings'],
    queryFn: async () => {
      if (!user) return settings;
      
      const userData = await base44.auth.me();
      return userData.security_settings || settings;
    },
    onSuccess: (data) => {
      if (data) {
        setSettings(data);
      }
    },
    enabled: !!user
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings) => {
      await base44.auth.updateMe({
        security_settings: newSettings
      });

      // Create audit log
      await base44.entities.AuditLog.create({
        event_type: 'security_settings_updated',
        severity: 'info',
        description: 'User updated security module settings',
        user_id: user?.email || 'unknown',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { settings: newSettings }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['security-settings'] });
      setHasChanges(false);
      toast.success('Security settings saved');
    },
    onError: (error) => {
      toast.error('Failed to save settings', {
        description: error.message
      });
    }
  });

  const handleToggle = (key) => {
    const newSettings = {
      ...settings,
      [key]: !settings[key]
    };
    setSettings(newSettings);
    setHasChanges(true);
  };

  const handleSave = () => {
    updateSettingsMutation.mutate(settings);
  };

  const handleReset = () => {
    setSettings(userSettings || settings);
    setHasChanges(false);
    toast.info('Settings reset to saved values');
  };

  const modules = [
    {
      id: 'intrusion_feed_enabled',
      name: 'Real-Time Intrusion Feed',
      icon: Activity,
      description: 'Live WebSocket feed of security events (AUTH, PROCESS, NETWORK, BLE, etc.)',
      status: 'operational',
      tier: 'all',
      dependencies: []
    },
    {
      id: 'evidence_locker_enabled',
      name: 'Encrypted Evidence Locker',
      icon: Database,
      description: 'Client-side AES-256-GCM encryption for all artifacts with optional cloud sync',
      status: 'operational',
      tier: 'all',
      dependencies: []
    },
    {
      id: 'ble_tracker_enabled',
      name: 'BLE Beacon Tracker',
      icon: Radio,
      description: 'Track Bluetooth Low Energy devices with recurrence detection and GPS tagging',
      status: 'operational',
      tier: 'professional',
      dependencies: ['evidence_locker_enabled']
    },
    {
      id: 'network_listeners_enabled',
      name: 'Hidden Network Service Detector',
      icon: Network,
      description: 'Audit local network listeners and detect rogue services (requires desktop helper)',
      status: 'helper_required',
      tier: 'professional',
      dependencies: ['intrusion_feed_enabled', 'evidence_locker_enabled']
    },
    {
      id: 'usb_sentinels_enabled',
      name: 'USB Device Sentinels',
      icon: Usb,
      description: 'Detect and log USB device insertions with VID/PID tracking (requires desktop helper)',
      status: 'helper_required',
      tier: 'professional',
      dependencies: ['intrusion_feed_enabled', 'evidence_locker_enabled']
    },
    {
      id: 'integrity_monitor_enabled',
      name: 'System Integrity Hash Monitor',
      icon: Shield,
      description: 'SHA-256 baseline and diff detection for critical system files (requires desktop helper)',
      status: 'helper_required',
      tier: 'enterprise',
      dependencies: ['evidence_locker_enabled']
    }
  ];

  const advancedSettings = [
    {
      id: 'auto_bluetooth_control',
      name: 'Auto Bluetooth Control',
      description: 'Automatically enable Bluetooth during BLE scans, then disable after completion',
      icon: Radio,
      beta: true
    },
    {
      id: 'gps_permission_auto_request',
      name: 'Auto GPS Permission',
      description: 'Automatically request GPS permission during scans for geolocation tagging',
      icon: Network
    },
    {
      id: 'offline_mode_enabled',
      name: 'Offline Mode',
      description: 'Queue events locally when offline and sync when connection restores',
      icon: Database
    },
    {
      id: 'auto_export_to_locker',
      name: 'Auto Export to Locker',
      description: 'Automatically save all scan results to encrypted Evidence Locker',
      icon: Database
    },
    {
      id: 'notification_on_threats',
      name: 'Threat Notifications',
      description: 'Send real-time notifications for high-severity events',
      icon: AlertTriangle
    },
    {
      id: 'scheduled_scans_enabled',
      name: 'Scheduled Scans',
      description: 'Enable automated periodic scans (requires desktop helper)',
      icon: RefreshCw,
      helper: true
    }
  ];

  const getStatusBadge = (status) => {
    switch (status) {
      case 'operational':
        return <Badge className="bg-green-500/20 text-green-400">Operational</Badge>;
      case 'helper_required':
        return <Badge className="bg-yellow-500/20 text-yellow-400">Desktop Helper Required</Badge>;
      case 'beta':
        return <Badge className="bg-blue-500/20 text-blue-400">Beta</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-400">Unknown</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Security Settings</h1>
          <p className="text-sm md:text-base text-slate-400">Configure defense modules and security preferences</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Button
            onClick={handleReset}
            disabled={!hasChanges || updateSettingsMutation.isPending}
            variant="outline"
            className="border-slate-700 flex-1 md:flex-initial min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateSettingsMutation.isPending}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 flex-1 md:flex-initial min-h-[44px]"
          >
            {updateSettingsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Changes Indicator */}
      {hasChanges && (
        <Alert className="bg-yellow-500/10 border-yellow-500/30">
          <Info className="h-4 w-4 text-yellow-400" />
          <AlertDescription className="text-yellow-300">
            You have unsaved changes. Click "Save Changes" to apply.
          </AlertDescription>
        </Alert>
      )}

      {/* Core Defense Modules */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Core Defense Modules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {modules.map((module) => {
            const Icon = module.icon;
            const isEnabled = settings[module.id];
            
            return (
              <div
                key={module.id}
                className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-blue-500/50 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isEnabled ? 'bg-blue-500/20' : 'bg-slate-700/30'
                    }`}>
                      <Icon className={`w-5 h-5 ${isEnabled ? 'text-blue-400' : 'text-slate-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-white text-sm md:text-base">{module.name}</h3>
                        {getStatusBadge(module.status)}
                        {module.tier !== 'all' && (
                          <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                            {module.tier.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs md:text-sm text-slate-400 mb-2">{module.description}</p>
                      {module.dependencies.length > 0 && (
                        <p className="text-xs text-slate-500">
                          <strong>Requires:</strong> {module.dependencies.map(dep => 
                            modules.find(m => m.id === dep)?.name || dep
                          ).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => handleToggle(module.id)}
                    className="flex-shrink-0"
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            Advanced Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {advancedSettings.map((setting) => {
            const Icon = setting.icon;
            const isEnabled = settings[setting.id];
            
            return (
              <div
                key={setting.id}
                className="flex items-center justify-between p-3 bg-slate-800/30 border border-slate-700 rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isEnabled ? 'text-blue-400' : 'text-slate-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label htmlFor={setting.id} className="text-white font-medium text-sm md:text-base cursor-pointer">
                        {setting.name}
                      </Label>
                      {setting.beta && (
                        <Badge className="bg-blue-500/20 text-blue-400 text-xs">BETA</Badge>
                      )}
                      {setting.helper && (
                        <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Helper</Badge>
                      )}
                    </div>
                    <p className="text-xs md:text-sm text-slate-400 mt-1">{setting.description}</p>
                  </div>
                </div>
                <Switch
                  id={setting.id}
                  checked={isEnabled}
                  onCheckedChange={() => handleToggle(setting.id)}
                  className="flex-shrink-0"
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Helper Status */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-400" />
            Desktop Helper Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="bg-yellow-500/10 border-yellow-500/30">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-300">
              <strong>Helper Not Detected</strong>
              <p className="text-sm mt-2">
                Some features require the Sentinel Desktop Helper for full functionality:
                Network Listeners, USB Sentinels, and System Integrity Monitor.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/20 min-h-[44px]"
                onClick={() => window.open('/downloads', '_blank')}
              >
                Download Desktop Helper
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Feature Availability Matrix */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-sm md:text-base">Platform Feature Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 text-slate-400 font-medium">Feature</th>
                  <th className="text-center py-2 text-slate-400 font-medium">Web/Android</th>
                  <th className="text-center py-2 text-slate-400 font-medium">Desktop</th>
                  <th className="text-center py-2 text-slate-400 font-medium">iOS</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-700/50">
                  <td className="py-2">Intrusion Feed</td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-2">Evidence Locker</td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-2">BLE Tracker</td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                  <td className="text-center"><span className="text-xs text-yellow-400">Manual Import</span></td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-2">Network Listeners</td>
                  <td className="text-center"><span className="text-xs text-slate-500">Helper Only</span></td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                  <td className="text-center"><span className="text-xs text-slate-500">N/A</span></td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-2">USB Sentinels</td>
                  <td className="text-center"><span className="text-xs text-slate-500">Helper Only</span></td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                  <td className="text-center"><span className="text-xs text-slate-500">N/A</span></td>
                </tr>
                <tr>
                  <td className="py-2">Integrity Monitor</td>
                  <td className="text-center"><span className="text-xs text-slate-500">Helper Only</span></td>
                  <td className="text-center"><CheckCircle className="w-4 h-4 text-green-400 mx-auto" /></td>
                  <td className="text-center"><span className="text-xs text-slate-500">N/A</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Info Banner */}
      <Alert className="bg-blue-500/10 border-blue-500/30">
        <Info className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300 text-sm">
          <strong>Platform Notes:</strong> Android landscape mode is fully supported for web-based features. 
          Desktop helper unlocks advanced system monitoring capabilities. iOS users can manually import scan data.
        </AlertDescription>
      </Alert>
    </div>
  );
}