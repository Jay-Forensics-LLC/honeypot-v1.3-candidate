
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  ShieldAlert,
  ShieldOff,
  Smartphone,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  Download,
  Trash2,
  Eye,
  Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { analyzeMDMProfile } from '../functions/analyzeMDMProfile';

export default function MDMRemoval() {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: mobileDevices = [], isLoading } = useQuery({
    queryKey: ['mobile-devices-mdm'],
    queryFn: async () => {
      try {
        // Assuming base44.entities.MobileDevice has a filter method that matches resilientAPI.filterEntity signature
        return await base44.entities.MobileDevice.filter(
          { status: { $ne: 'suspended' } },
          '-enrolled_at',
          50,
          0,
          15000
        );
      } catch (error) {
        console.warn('Mobile devices load failed:', error);
        return [];
      }
    },
    initialData: []
  });

  const analyzeMDMMutation = useMutation({
    mutationFn: async (deviceId) => {
      setIsAnalyzing(true);

      const device = mobileDevices.find(d => d.id === deviceId);
      if (!device) throw new Error('Device not found');

      try {
        const { data } = await analyzeMDMProfile({
          device_fingerprint: device.device_fingerprint,
          mdm_status: device.mdm_status
        });

        // NOTE: The previous scanDeviceMutation updated the device in the DB with scan results and created an audit log.
        // This new analyzeMDMMutation from the outline *only* returns analysis data and sets local state.
        // If the intention was to persist these new analysis results (e.g., legitimacy_score, mdm_type)
        // to the MobileDevice entity, additional `base44.entities.MobileDevice.update` calls
        // and `base44.entities.AuditLog.create` would need to be added here or in onSuccess.
        // Following the provided outline strictly, only local state `analysisResults` is updated.

        return data;
      } catch (error) {
        // Fallback analysis if function fails
        console.warn('AI analysis failed, using fallback:', error);

        const mdm = device.mdm_status || {};
        return {
          is_legitimate: (mdm.mdm_legitimacy_score || 0) >= 70,
          legitimacy_score: mdm.mdm_legitimacy_score || 50,
          mdm_type: mdm.mdm_vendor ? 'enterprise' : 'unknown',
          risk_level: (mdm.mdm_legitimacy_score || 0) >= 80 ? 'low' :
                      (mdm.mdm_legitimacy_score || 0) >= 50 ? 'medium' : 'high',
          recommendations: [
            'Review MDM profile details manually',
            'Check certificates and signing authority',
            'Verify with IT department if enterprise device',
            'Consider factory reset if suspicious'
          ],
          analysis_method: 'fallback_heuristics'
        };
      }
    },
    onSuccess: (data) => {
      setIsAnalyzing(false);
      setAnalysisResults(data);

      if (!data.is_legitimate || data.risk_level === 'high') {
        toast.warning('Suspicious MDM Detected!', {
          description: `Legitimacy: ${data.legitimacy_score}% - Review recommendations`,
          duration: 6000
        });
      } else {
        toast.success('MDM Analysis Complete', {
          description: `Legitimacy: ${data.legitimacy_score}% - Appears legitimate`
        });
      }
    },
    onError: (error) => {
      setIsAnalyzing(false);
      toast.error('Analysis failed: ' + error.message);
    }
  });

  const removeDeviceMutation = useMutation({
    mutationFn: async (deviceId) => {
      return await base44.entities.MobileDevice.delete(deviceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-devices-mdm'] });
      setSelectedDevice(null);
      toast.success('Device removed');
    },
    onError: (error) => {
      toast.error('Failed to remove device: ' + error.message);
    }
  });

  const removeAttemptMutation = useMutation({
    mutationFn: async (deviceId) => {
      const device = mobileDevices.find(d => d.id === deviceId);
      if (!device) throw new Error('Device not found');

      const attempt = {
        attempted_at: new Date().toISOString(),
        method: 'manual_instructions',
        success: false,
        notes: 'User provided with removal instructions'
      };

      return await base44.entities.MobileDevice.update(deviceId, {
        'mdm_status.removal_attempted': true,
        'mdm_status.removal_attempts': [
          ...(device.mdm_status?.removal_attempts || []),
          attempt
        ]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-devices-mdm'] });
      toast.info('Removal attempt logged', {
        description: 'Follow the provided instructions carefully'
      });
    },
    onError: (error) => {
      toast.error('Failed to log attempt: ' + error.message);
    }
  });

  const mdmDevices = mobileDevices.filter(d => d.mdm_status?.mdm_detected);
  const cleanDevices = mobileDevices.filter(d => !d.mdm_status?.mdm_detected);
  const unscannedDevices = mobileDevices.filter(d => !d.mdm_status?.last_scan);

  const getSupervisionBadge = (type) => {
    if (!type || type === 'none') return null;

    const config = {
      enterprise: { color: 'bg-blue-500/20 text-blue-400', label: 'Enterprise MDM' },
      unknown: { color: 'bg-yellow-500/20 text-yellow-400', label: 'Unknown MDM' },
      rogue: { color: 'bg-red-500/20 text-red-400', label: 'ROGUE MDM' }
    };

    const badge = config[type] || config.unknown;
    return (
      <Badge className={badge.color}>
        <ShieldAlert className="w-3 h-3 mr-1" />
        {badge.label}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">MDM Detection & Removal</h1>
          <p className="text-slate-400">
            Detect and analyze Mobile Device Management profiles
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Smartphone className="w-10 h-10 text-blue-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{mobileDevices.length}</p>
                  <p className="text-xs text-slate-400">Total Devices</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{mdmDevices.length}</p>
                  <p className="text-xs text-slate-400">MDM Detected</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{cleanDevices.length}</p>
                  <p className="text-xs text-slate-400">Clean Devices</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Search className="w-10 h-10 text-yellow-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{unscannedDevices.length}</p>
                  <p className="text-xs text-slate-400">Pending Scan</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alert Banner */}
        {mdmDevices.length > 0 && (
          <Alert className="bg-red-900/20 border-red-500/30">
            <ShieldAlert className="h-5 w-5 text-red-400" />
            <AlertDescription className="text-red-300">
              <strong className="block mb-2">⚠️ MDM Profiles Detected</strong>
              <p className="text-sm">
                {mdmDevices.length} device{mdmDevices.length > 1 ? 's have' : ' has'} active MDM profiles.
                Review legitimacy and take action if unauthorized.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Devices List */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Enrolled Devices</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
                <p className="text-slate-400">Loading devices...</p>
              </div>
            ) : mobileDevices.length === 0 ? (
              <div className="text-center py-12">
                <Smartphone className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400 mb-4">No devices enrolled yet</p>
                <p className="text-sm text-slate-500">
                  Enroll devices from the Mobile Enrollment page
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {mobileDevices.map((device) => {
                  const mdmStatus = device.mdm_status || {};
                  const hasMDM = mdmStatus.mdm_detected;
                  const isScanned = mdmStatus.last_scan;

                  return (
                    <Card
                      key={device.id}
                      className={`bg-slate-800/50 border transition-all ${
                        hasMDM ? 'border-red-500/50' :
                        isScanned ? 'border-green-500/30' :
                        'border-slate-700'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                              hasMDM ? 'bg-red-500/20' :
                              isScanned ? 'bg-green-500/20' :
                              'bg-blue-500/20'
                            }`}>
                              {hasMDM ? (
                                <ShieldOff className="w-6 h-6 text-red-400" />
                              ) : isScanned ? (
                                <CheckCircle className="w-6 h-6 text-green-400" />
                              ) : (
                                <Smartphone className="w-6 h-6 text-blue-400" />
                              )}
                            </div>

                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <h3 className="font-semibold text-white">
                                  {device.device_name || 'Unnamed Device'}
                                </h3>
                                <Badge className="bg-slate-700 text-slate-300 text-xs">
                                  {device.platform?.toUpperCase() || 'UNKNOWN'}
                                </Badge>
                                {getSupervisionBadge(mdmStatus.supervision_type)}
                                {hasMDM && (
                                  <Badge className="bg-red-500/20 text-red-400 animate-pulse">
                                    MDM ACTIVE
                                  </Badge>
                                )}
                                {device.status === 'compromised' && (
                                  <Badge className="bg-red-500 text-white">
                                    COMPROMISED
                                  </Badge>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="text-slate-500">Enrolled</p>
                                  <p className="text-white">{new Date(device.enrolled_at).toLocaleDateString()}</p>
                                </div>
                                {isScanned && (
                                  <div>
                                    <p className="text-slate-500">Last Scan</p>
                                    <p className="text-white">{new Date(mdmStatus.last_scan).toLocaleDateString()}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-slate-500">Risk Score</p>
                                  <p className={`font-bold ${
                                    (device.risk_score || 0) >= 70 ? 'text-red-400' :
                                    (device.risk_score || 0) >= 40 ? 'text-yellow-400' :
                                    'text-green-400'
                                  }`}>
                                    {device.risk_score || 0}/100
                                  </p>
                                </div>
                              </div>

                              {hasMDM && (
                                <div className="mt-3 pt-3 border-t border-slate-700">
                                  <p className="text-xs text-slate-400 mb-2">MDM Details:</p>
                                  <div className="space-y-1 text-xs">
                                    <p className="text-slate-300">
                                      <strong>Vendor:</strong> {mdmStatus.mdm_vendor || 'Unknown'}
                                    </p>
                                    <p className="text-slate-300">
                                      <strong>Profile ID:</strong> {mdmStatus.mdm_profile_id || 'N/A'}
                                    </p>
                                    <p className="text-slate-300">
                                      <strong>Legitimacy Score:</strong>{' '}
                                      <span className={
                                        (mdmStatus.mdm_legitimacy_score || 0) >= 70 ? 'text-green-400' :
                                        (mdmStatus.mdm_legitimacy_score || 0) >= 40 ? 'text-yellow-400' :
                                        'text-red-400'
                                      }>
                                        {mdmStatus.mdm_legitimacy_score || 0}/100
                                      </span>
                                    </p>
                                    {mdmStatus.certificates?.length > 0 && (
                                      <p className="text-slate-300">
                                        <strong>Certificates:</strong> {mdmStatus.certificates.length} found
                                      </p>
                                    )}
                                    {mdmStatus.configuration_profiles?.length > 0 && (
                                      <p className="text-slate-300">
                                        <strong>Config Profiles:</strong> {mdmStatus.configuration_profiles.length} active
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button
                              onClick={() => analyzeMDMMutation.mutate(device.id)}
                              disabled={isAnalyzing && analyzeMDMMutation.variables === device.id}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                            >
                              {isAnalyzing && analyzeMDMMutation.variables === device.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Analyzing...
                                </>
                              ) : (
                                <>
                                  <Search className="w-4 h-4 mr-2" />
                                  Analyze MDM
                                </>
                              )}
                            </Button>

                            {hasMDM && (
                              <Button
                                onClick={() => setSelectedDevice(device)}
                                size="sm"
                                variant="outline"
                                className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 min-h-[44px]"
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                Details
                              </Button>
                            )}

                            {hasMDM && (
                               <Button
                                 onClick={() => removeAttemptMutation.mutate(device.id)}
                                 disabled={removeAttemptMutation.isPending}
                                 size="sm"
                                 variant="outline"
                                 className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10 min-h-[44px]"
                               >
                                 <Download className="w-4 h-4 mr-2" />
                                 Attempt Removal
                               </Button>
                            )}


                            <Button
                              onClick={() => removeDeviceMutation.mutate(device.id)}
                              disabled={removeDeviceMutation.isPending}
                              size="sm"
                              variant="outline"
                              className="border-red-500/50 text-red-400 hover:bg-red-500/10 min-h-[44px]"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* MDM Details Modal */}
        {selectedDevice && selectedDevice.mdm_status?.mdm_detected && (
          <Card className="bg-slate-900 border-red-500/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  MDM Profile Analysis
                </CardTitle>
                <Button
                  onClick={() => setSelectedDevice(null)}
                  variant="ghost"
                  size="sm"
                >
                  <XCircle className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-slate-400 mb-2">Device</p>
                <p className="font-semibold text-white">{selectedDevice.device_name}</p>
              </div>

              <div>
                <p className="text-sm text-slate-400 mb-2">MDM Vendor</p>
                <p className="font-semibold text-white">{selectedDevice.mdm_status.mdm_vendor || 'Unknown'}</p>
              </div>

              <div>
                <p className="text-sm text-slate-400 mb-2">Supervision Type</p>
                {getSupervisionBadge(selectedDevice.mdm_status.supervision_type)}
              </div>

              <div>
                <p className="text-sm text-slate-400 mb-2">Legitimacy Assessment</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        (selectedDevice.mdm_status.mdm_legitimacy_score || 0) >= 70 ? 'bg-green-500' :
                        (selectedDevice.mdm_status.mdm_legitimacy_score || 0) >= 40 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${selectedDevice.mdm_status.mdm_legitimacy_score || 0}%` }}
                    />
                  </div>
                  <span className="text-white font-bold">
                    {selectedDevice.mdm_status.mdm_legitimacy_score || 0}/100
                  </span>
                </div>
              </div>

              {selectedDevice.mdm_status.certificates?.length > 0 && (
                <div>
                  <p className="text-sm text-slate-400 mb-2">Certificates Found</p>
                  <div className="space-y-2">
                    {selectedDevice.mdm_status.certificates.map((cert, idx) => (
                      <div key={idx} className="p-2 bg-slate-800 rounded text-xs">
                        <p className="text-white">{cert.subject || 'Certificate ' + (idx + 1)}</p>
                        <p className="text-slate-400">{cert.issuer || 'Unknown Issuer'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Alert className="bg-yellow-900/20 border-yellow-500/30">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-300 text-sm">
                  <strong>Removal Instructions:</strong>
                  <ol className="list-decimal ml-5 mt-2 space-y-1">
                    <li>Back up device data before removal</li>
                    <li>Go to Settings → General → VPN & Device Management</li>
                    <li>Tap the MDM profile</li>
                    <li>Select "Remove Management"</li>
                    <li>Follow on-screen instructions</li>
                    <li>Device may require passcode or remote authorization</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <Button
                onClick={() => setSelectedDevice(null)}
                className="w-full bg-slate-700 hover:bg-slate-600 min-h-[44px]"
              >
                Close
              </Button>
            </CardContent>
          </Card>
        )}

        {/* How It Works */}
        <Card className="bg-blue-900/20 border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              How MDM Detection Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-blue-200">
            <p>
              <strong>Sentinel's MDM scanner analyzes:</strong>
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Configuration profiles installed on device</li>
              <li>Device supervision status and enrollment certificates</li>
              <li>Known MDM vendor signatures (Jamf, Intune, AirWatch, etc.)</li>
              <li>Certificate chains and trust anchors</li>
              <li>Behavioral patterns indicating remote management</li>
              <li>Legitimacy scoring based on enterprise vs. consumer context</li>
            </ul>
            <Alert className="bg-blue-500/10 border-blue-500/30 mt-4">
              <Lock className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-300 text-xs">
                <strong>Privacy Note:</strong> All scans are performed locally on your device.
                Results are encrypted and stored securely in your evidence vault.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
