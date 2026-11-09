import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Smartphone,
  Shield,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
  Info,
  XCircle,
  Lock,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow, isValid } from 'date-fns';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import { InputSanitizer } from '../components/security/InputSanitizer';
import { CryptoUtils } from '../components/utils/CryptoUtils';
import MDMLegalDisclaimer from '../components/legal/MDMLegalDisclaimer';

// Helper for Date utilities
const DateUtils = {
  safeFormatDate: (dateString, fmt = 'MMM d, yyyy') => {
    const date = new Date(dateString);
    return isValid(date) ? format(date, fmt) : 'N/A';
  },
  safeRelativeTime: (dateString) => {
    const date = new Date(dateString);
    return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : 'Never';
  }
};

export default function MobileEnrollment() {
  const [enrollmentStep, setEnrollmentStep] = useState(0);
  const [deviceName, setDeviceName] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['mobile-devices'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('MobileDevice', '-last_sync', 100, 15000);
      } catch (error) {
        console.error('Failed to load devices:', error);
        return [];
      }
    },
    initialData: [],
    staleTime: 30000,
    retry: 1
  });

  // Generate device fingerprint
  useEffect(() => {
    if (enrollmentStep === 2 && selectedPlatform && !deviceFingerprint) {
      generateFingerprint();
    }
  }, [enrollmentStep, selectedPlatform, deviceFingerprint]);

  const generateFingerprint = async () => {
    try {
      const fingerprint = {
        model: navigator.platform || 'Unknown',
        manufacturer: navigator.vendor || 'Unknown',
        os_version: navigator.userAgent,
        device_id: `DEV-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        browser: navigator.userAgentData?.brands?.[0]?.brand || navigator.appName,
        browser_version: navigator.userAgentData?.brands?.[0]?.version || navigator.appVersion
      };

      setDeviceFingerprint(fingerprint);
    } catch (error) {
      console.error('Fingerprinting failed:', error);
      toast.error('Failed to generate device fingerprint');
    }
  };

  const enrollDeviceMutation = useMutation({
    mutationFn: async () => {
      const sanitizedName = InputSanitizer.sanitizeString(deviceName);
      
      if (!sanitizedName || !selectedPlatform || !deviceFingerprint) {
        throw new Error('Missing required enrollment data. Please complete all steps.');
      }

      const deviceData = {
        device_name: sanitizedName,
        platform: selectedPlatform,
        device_fingerprint: deviceFingerprint,
        enrollment_method: 'web_ui',
        enrolled_at: new Date().toISOString(),
        last_sync: new Date().toISOString(),
        status: 'active',
        security_status: {
          is_rooted: false,
          is_jailbroken: false,
          developer_mode_enabled: false,
          screen_lock_enabled: true,
          encryption_enabled: true,
          biometric_enabled: false
        },
        mdm_status: {
          mdm_detected: false,
          mdm_vendor: null,
          is_supervised: false,
          mdm_legitimacy_score: 0,
          last_scan: new Date().toISOString()
        },
        risk_score: 25,
        quarantined: false
      };

      const device = await resilientAPI.createEntity('MobileDevice', deviceData, 10000);

      await CryptoUtils.createSecureLogEntry({
        event_type: 'mobile_device_enrolled',
        severity: 'info',
        description: `Device "${sanitizedName}" enrolled successfully`,
        user_id: user?.email || 'system',
        success: true,
        metadata: {
          device_id: device.id,
          platform: selectedPlatform,
          device_name: sanitizedName,
          fingerprint: deviceFingerprint
        }
      }).then(log => base44.entities.AuditLog.create(log)).catch(console.warn);

      return device;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-devices'] });
      setEnrollmentStep(0);
      setDeviceName('');
      setSelectedPlatform(null);
      setDeviceFingerprint(null);
      
      toast.success('Device enrolled successfully!', {
        description: 'Your device is now protected and under monitoring.',
        style: {
          background: '#14532D',
          border: '1px solid #16A34A',
          color: '#D1FAE5'
        }
      });
    },
    onError: (error) => {
      console.error('Enrollment error:', error);
      toast.error('Enrollment failed', {
        description: error.message || 'An unexpected error occurred.',
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
    }
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId) => {
      await CryptoUtils.createSecureLogEntry({
        event_type: 'mobile_device_removed',
        severity: 'warning',
        description: `Mobile device (ID: ${deviceId}) removed from enrollment`,
        user_id: user?.email || 'system',
        success: true,
        metadata: { device_id: deviceId }
      }).then(log => base44.entities.AuditLog.create(log)).catch(console.warn);
      
      return await resilientAPI.deleteEntity('MobileDevice', deviceId, 10000);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-devices'] });
      toast.success('Device removed', {
        style: {
          background: '#14532D',
          border: '1px solid #16A34A',
          color: '#D1FAE5'
        }
      });
    },
    onError: (error) => {
      toast.error('Failed to remove device', {
        description: error.message,
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
    }
  });

  const getRiskColor = (score) => {
    if (score == null) return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    if (score >= 75) return 'bg-red-500/20 text-red-400 border-red-500/50';
    if (score >= 50) return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
    if (score >= 25) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    return 'bg-green-500/20 text-green-400 border-green-500/50';
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-500/20 text-green-400',
      suspended: 'bg-yellow-500/20 text-yellow-400',
      compromised: 'bg-red-500/20 text-red-400',
      mdm_locked: 'bg-orange-500/20 text-orange-400',
      removed: 'bg-slate-500/20 text-slate-400'
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Device Inventory & Monitoring</h1>
            <p className="text-slate-400">Track device metadata for forensic investigation (Not full MDM)</p>
          </div>
          <Button
            onClick={() => setEnrollmentStep(enrollmentStep > 0 ? 0 : 1)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {enrollmentStep > 0 ? (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                Cancel Enrollment
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Enroll New Device
              </>
            )}
          </Button>
        </div>

        <MDMLegalDisclaimer compact={true} />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Smartphone className="w-10 h-10 text-blue-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{devices.length}</p>
                  <p className="text-xs text-slate-400">Total Devices</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-3xl font-bold text-white">
                    {devices.filter(d => d.status === 'active').length}
                  </p>
                  <p className="text-xs text-slate-400">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Shield className="w-10 h-10 text-purple-400" />
                <div>
                  <p className="text-3xl font-bold text-white">
                    {devices.filter(d => d.security_status?.is_rooted || d.security_status?.is_jailbroken).length}
                  </p>
                  <p className="text-xs text-slate-400">Rooted/Jailbroken</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-3xl font-bold text-white">
                    {devices.filter(d => d.mdm_status?.mdm_detected).length}
                  </p>
                  <p className="text-xs text-slate-400">MDM Detected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* App Store Links - UPDATED */}
        <Card className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-purple-400" />
              Mobile App Downloads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-blue-900/20 border-blue-500/30">
              <Info className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-200 text-sm">
                <strong>Coming Soon:</strong> Native iOS and Android apps are in development and will be available via App Store and Play Store.
                For now, use web-based enrollment above or manual evidence upload in the Evidence Vault.
              </AlertDescription>
            </Alert>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-lg border border-dashed border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">iOS App</p>
                    <p className="text-xs text-slate-400">iPhone, iPad (iOS 15+)</p>
                  </div>
                </div>
                <Button
                  disabled
                  className="w-full bg-slate-700 text-slate-400 cursor-not-allowed min-h-[44px]"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Coming to App Store
                </Button>
                <p className="text-xs text-center text-slate-500 mt-2">
                  ETA: Q2 2025 • TestFlight Beta Available Soon
                </p>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg border border-dashed border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Android App</p>
                    <p className="text-xs text-slate-400">Android 10+ (All devices)</p>
                  </div>
                </div>
                <Button
                  disabled
                  className="w-full bg-slate-700 text-slate-400 cursor-not-allowed min-h-[44px]"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Coming to Play Store
                </Button>
                <p className="text-xs text-center text-slate-500 mt-2">
                  ETA: Q2 2025 • APK Beta Available Soon
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {enrollmentStep > 0 && (
          <Card className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-blue-500/30">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Device Enrollment - Step {enrollmentStep} of 3
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {enrollmentStep === 1 && (
                <div className="space-y-4">
                  <Label className="text-white text-lg">Select Device Platform</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Card
                      className={`cursor-pointer transition-all ${
                        selectedPlatform === 'ios'
                          ? 'bg-blue-500/20 border-blue-500/50'
                          : 'bg-slate-800/50 border-slate-700 hover:border-blue-500/30'
                      }`}
                      onClick={() => setSelectedPlatform('ios')}
                    >
                      <CardContent className="p-6 text-center">
                        <Smartphone className="w-12 h-12 mx-auto mb-3 text-blue-400" />
                        <p className="font-semibold text-white mb-1">iOS</p>
                        <p className="text-xs text-slate-400">iPhone, iPad</p>
                      </CardContent>
                    </Card>

                    <Card
                      className={`cursor-pointer transition-all ${
                        selectedPlatform === 'android'
                          ? 'bg-green-500/20 border-green-500/50'
                          : 'bg-slate-800/50 border-slate-700 hover:border-green-500/30'
                      }`}
                      onClick={() => setSelectedPlatform('android')}
                    >
                      <CardContent className="p-6 text-center">
                        <Smartphone className="w-12 h-12 mx-auto mb-3 text-green-400" />
                        <p className="font-semibold text-white mb-1">Android</p>
                        <p className="text-xs text-slate-400">Samsung, Google, etc.</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Button
                    onClick={() => setEnrollmentStep(2)}
                    disabled={!selectedPlatform}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Continue
                  </Button>
                </div>
              )}

              {enrollmentStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-white text-lg">Name Your Device</Label>
                    <Input
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder="e.g., John's iPhone, Work Tablet"
                      className="bg-slate-800 border-slate-700 text-white"
                      maxLength={50}
                    />
                    <p className="text-xs text-slate-400">
                      Choose a name to easily identify this device
                    </p>
                  </div>

                  <Alert className="bg-blue-900/20 border-blue-500/30">
                    <Info className="h-4 w-4 text-blue-400" />
                    <AlertDescription className="text-blue-200 text-sm">
                      Device fingerprinting will be performed to uniquely identify your device for security monitoring.
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-3">
                    <Button
                      onClick={() => setEnrollmentStep(1)}
                      variant="outline"
                      className="flex-1 bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setEnrollmentStep(3)}
                      disabled={!deviceName.trim()}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {enrollmentStep === 3 && (
                <div className="space-y-4">
                  <Label className="text-white text-lg">Confirm Enrollment</Label>
                  
                  <div className="space-y-3 p-4 bg-slate-800/50 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Device Name:</span>
                      <span className="text-white font-semibold">{deviceName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Platform:</span>
                      <Badge className={
                        selectedPlatform === 'ios' 
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-green-500/20 text-green-400'
                      }>
                        {selectedPlatform?.toUpperCase()}
                      </Badge>
                    </div>
                    {deviceFingerprint && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Unique ID:</span>
                        <span className="text-white font-mono text-xs break-all">
                          {deviceFingerprint.device_id || 'N/A'}
                        </span>
                      </div>
                    )}
                  </div>

                  <Alert className="bg-green-900/20 border-green-500/30">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <AlertDescription className="text-green-200 text-sm">
                      <strong>What happens next:</strong>
                      <ul className="list-disc ml-6 mt-2 space-y-1">
                        <li>Your device will be registered in your organization.</li>
                        <li>Security monitoring will be activated.</li>
                        <li>MDM profile scanning will begin automatically.</li>
                        <li>You'll receive alerts for any suspicious activity.</li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-3">
                    <Button
                      onClick={() => setEnrollmentStep(2)}
                      variant="outline"
                      className="flex-1 bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => enrollDeviceMutation.mutate()}
                      disabled={enrollDeviceMutation.isPending || !deviceName.trim() || !selectedPlatform || !deviceFingerprint}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      {enrollDeviceMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enrolling...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Complete Enrollment
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <span>Enrolled Devices ({devices.length})</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['mobile-devices'] })}
                className="border-slate-700 text-white hover:bg-slate-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-400" />
                <p className="text-slate-400">Loading devices...</p>
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center py-12">
                <Smartphone className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-white mb-2">No devices enrolled</p>
                <p className="text-sm text-slate-400 mb-4">
                  Enroll your mobile devices to enable security monitoring.
                </p>
                <Button
                  onClick={() => setEnrollmentStep(1)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Enroll First Device
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {devices.map((device) => (
                  <Card key={device.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            device.platform === 'ios' ? 'bg-blue-500/20' : 'bg-green-500/20'
                          }`}>
                            <Smartphone className={`w-5 h-5 ${
                              device.platform === 'ios' ? 'text-blue-400' : 'text-green-400'
                            }`} />
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-white">{device.device_name}</h4>
                              <Badge className={getStatusColor(device.status)}>
                                {device.status || 'unknown'}
                              </Badge>
                              <Badge variant="outline" className={getRiskColor(device.risk_score)}>
                                Risk: {device.risk_score != null ? `${device.risk_score}/100` : 'N/A'}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                              <div>
                                <p className="text-slate-500">Platform</p>
                                <p className="text-white">{device.platform?.toUpperCase() || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Enrolled</p>
                                <p className="text-white">{DateUtils.safeFormatDate(device.enrolled_at)}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Last Sync</p>
                                <p className="text-white">{DateUtils.safeRelativeTime(device.last_sync)}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Model</p>
                                <p className="text-white">
                                  {device.device_fingerprint?.model || 'Unknown'}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {device.security_status?.encryption_enabled && (
                                <Badge className="bg-green-500/20 text-green-400 text-[10px]">
                                  <Lock className="w-2 h-2 mr-1" />
                                  Encrypted
                                </Badge>
                              )}
                              {device.security_status?.screen_lock_enabled && (
                                <Badge className="bg-green-500/20 text-green-400 text-[10px]">
                                  <Shield className="w-2 h-2 mr-1" />
                                  Locked
                                </Badge>
                              )}
                              {device.security_status?.is_rooted && (
                                <Badge className="bg-red-500/20 text-red-400 text-[10px]">
                                  <AlertTriangle className="w-2 h-2 mr-1" />
                                  Rooted
                                </Badge>
                              )}
                              {device.security_status?.is_jailbroken && (
                                <Badge className="bg-red-500/20 text-red-400 text-[10px]">
                                  <AlertTriangle className="w-2 h-2 mr-1" />
                                  Jailbroken
                                </Badge>
                              )}
                              {device.mdm_status?.mdm_detected && (
                                <Badge className="bg-orange-500/20 text-orange-400 text-[10px]">
                                  <Lock className="w-2 h-2 mr-1" />
                                  MDM: {device.mdm_status.mdm_vendor || 'Detected'}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteDeviceMutation.mutate(device.id)}
                          disabled={deleteDeviceMutation.isPending}
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                        >
                          {deleteDeviceMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Alert className="bg-purple-900/20 border-purple-500/30">
          <Info className="h-5 w-5 text-purple-400" />
          <AlertDescription className="text-purple-200">
            <strong>Enterprise MDM Integration</strong>
            <p className="text-sm mt-1">
              For organizations: Contact support to integrate with your existing MDM solution (Jamf, Intune, MobileIron).
            </p>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}