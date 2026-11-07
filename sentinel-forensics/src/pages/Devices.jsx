import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Monitor,
  Smartphone,
  Laptop,
  Download,
  Shield,
  CheckCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Copy,
  Terminal,
  Key,
  Lock,
  Activity,
  Zap,
  RefreshCw,
  XCircle,
  Eye // Added Eye icon
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import ThreatActorContext from '../components/devices/ThreatActorContext';
import DeviceBehaviorAnalysis from '../components/devices/DeviceBehaviorAnalysis';
import AutomatedResponseActions from '../components/devices/AutomatedResponseActions';
import DevicePostureAssessment from '../components/devices/DevicePostureAssessment';
import DeviceActivityMonitor from '../components/devices/DeviceActivityMonitor';
import VulnerabilityManagement from '../components/devices/VulnerabilityManagement';
import DeviceInventoryPanel from '../components/devices/DeviceInventoryPanel';
import RemoteActionsPanel from '../components/devices/RemoteActionsPanel';
import AIDeviceHealthPanel from '../components/devices/AIDeviceHealthPanel';
import AIAnomalyDetectionPanel from '../components/devices/AIAnomalyDetectionPanel';
import AIHardeningRecommendations from '../components/devices/AIHardeningRecommendations';
import { useOrgList } from '../components/hooks/useOrgQuery';
import { useUser } from '../components/hooks/useUser';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import { getAgentDownloadUrl } from '../components/config/agentDownloads';

export default function Devices() {
  const queryClient = useQueryClient();
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('windows');
  const [generatedToken, setGeneratedToken] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [deviceDetailOpen, setDeviceDetailOpen] = useState(false);

  const { data: user } = useUser();

  // PHASE 6: Limit to 50 devices by default (pagination later if needed)
  const { data: devices = [] } = useOrgList('Device', '-last_seen_at', 50);

  const generateTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('agentEnrollmentToken', {
        device_id: 'NEW_DEVICE',
        platform: selectedPlatform,
        expires_in_hours: 24
      });
      return response.data;
    },
    onSuccess: (data) => {
      setGeneratedToken(data);
      toast.success('Enrollment token generated', {
        description: `Token valid for 24 hours`
      });
    },
    onError: (error) => {
      toast.error('Failed to generate token', {
        description: error.message
      });
    }
  });

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getInstallCommands = (platform, token) => {
    const downloadUrl = getAgentDownloadUrl(platform);
    
    const commands = {
      windows: {
        download: downloadUrl,
        install: `# Download and run installer\nInvoke-WebRequest -Uri "${downloadUrl}" -OutFile "sentinel-agent.exe"\n\n# Install with enrollment token\n.\\sentinel-agent.exe install --token="${token}"`
      },
      macos: {
        download: downloadUrl,
        install: `# Download installer\ncurl -O ${downloadUrl}\n\n# Install agent\nsudo installer -pkg sentinel-agent-macos.pkg -target /\n\n# Enroll device\nsudo sentinel-agent enroll --token="${token}"`
      },
      linux: {
        download: downloadUrl,
        install: `# For Debian/Ubuntu\nwget ${downloadUrl}\nsudo dpkg -i sentinel-agent-linux.deb\nsudo sentinel-agent enroll --token="${token}"\n\n# For RHEL/CentOS (if rpm available)\n# wget https://jayforensics.com/downloads/sentinel-agent-linux.rpm\n# sudo rpm -i sentinel-agent-linux.rpm\n# sudo sentinel-agent enroll --token="${token}"`
      },
      ios: {
        download: 'https://apps.apple.com/app/sentinel-forensics/idXXXXXXXX',
        install: `1. Download from App Store\n2. Open app and tap "Enroll Device"\n3. Scan QR code or enter token:\n   ${token}\n4. Follow on-screen instructions`
      },
      android: {
        download: 'https://play.google.com/store/apps/details?id=com.sentinel.forensics',
        install: `1. Download from Google Play\n2. Open app and tap "Enroll Device"\n3. Enter enrollment token:\n   ${token}\n4. Grant required permissions`
      }
    };
    return commands[platform];
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'windows':
      case 'macos':
      case 'linux':
        return <Laptop className="w-5 h-5" />;
      case 'ios':
      case 'android':
        return <Smartphone className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'enrolled':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'suspended':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'revoked':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const activeDevices = devices.filter(d => d.status === 'enrolled').length;
  const totalDevices = devices.length;
  const criticalThreatDevices = devices.filter(d => (d.anomaly_score || 0) >= 80).length;
  const nonCompliantDevices = devices.filter(d => d.compliance_status === 'non_compliant').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Device Management</h1>
          <p className="text-slate-400">Enterprise Mobile Device Management (MDM) & Endpoint Security</p>
        </div>
        <Button
          onClick={() => setEnrollDialogOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          <Download className="w-4 h-4 mr-2" />
          Enroll New Device
        </Button>
      </div>

      <Alert className="bg-blue-500/10 border-blue-500/30">
        <Info className="h-5 w-5 text-blue-400" />
        <AlertDescription className="text-blue-300">
          <strong className="font-semibold">What is Device Management?</strong>
          <p className="mt-1 text-sm">
            Sentinel Forensics includes enterprise-grade Mobile Device Management (MDM) capabilities. Install the Sentinel Agent on your endpoints (laptops, desktops, smartphones) to:
          </p>
          <ul className="mt-2 space-y-1 text-sm list-disc list-inside">
            <li><strong>Remote Forensics:</strong> Collect evidence from devices without physical access</li>
            <li><strong>Live Defense:</strong> Deploy panic shields, USB lockdown, and network isolation</li>
            <li><strong>Threat Detection:</strong> Real-time malware, rootkit, and zero-day scanning</li>
            <li><strong>Compliance:</strong> Ensure devices meet security baselines (encryption, patches, etc.)</li>
            <li><strong>Covert Operations:</strong> Deploy honeypots and signal cloaking from managed devices</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Stats */}
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Monitor className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-2xl font-bold text-white">{totalDevices}</p>
                <p className="text-xs text-slate-400">Total Devices</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-2xl font-bold text-white">{activeDevices}</p>
                <p className="text-xs text-slate-400">Active/Enrolled</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {devices.filter(d => {
                    const lastSeen = new Date(d.last_seen_at);
                    const now = new Date();
                    return (now - lastSeen) / 1000 / 60 < 5; // online in last 5 min
                  }).length}
                </p>
                <p className="text-xs text-slate-400">Online Now</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-yellow-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {devices.filter(d => d.capabilities && d.capabilities.includes('panic_shield')).length}
                </p>
                <p className="text-xs text-slate-400">Panic Shield Ready</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <div>
                <p className="text-2xl font-bold text-white">{criticalThreatDevices}</p>
                <p className="text-xs text-slate-400">Critical Threats</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-orange-400" />
              <div>
                <p className="text-2xl font-bold text-white">{nonCompliantDevices}</p>
                <p className="text-xs text-slate-400">Non-Compliant</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Devices List */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Enrolled Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center py-12">
              <Monitor className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-2">No devices enrolled yet</p>
              <p className="text-sm text-slate-500 mb-4">
                Install the Sentinel Agent on your endpoints to enable remote forensics and live defense
              </p>
              <Button
                onClick={() => setEnrollDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Enroll Your First Device
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map(device => {
                const lastSeen = new Date(device.last_seen_at);
                const now = new Date();
                const minutesAgo = Math.floor((now - lastSeen) / 1000 / 60);
                const isOnline = minutesAgo < 5;
                const hasThreatActors = device.security_profile?.associated_threat_actors?.length > 0;
                const anomalyScore = device.anomaly_score || 0;
                const isHighRisk = anomalyScore >= 60;
                const isIsolated = device.isolation_status?.is_isolated;

                return (
                  <div key={device.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-900/30 rounded-lg flex items-center justify-center">
                          {getPlatformIcon(device.platform)}
                        </div>
                        <div>
                          <h4 className="font-semibold text-white flex items-center gap-2 flex-wrap">
                            {device.display_name}
                            {hasThreatActors && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-[10px]">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                THREAT
                              </Badge>
                            )}
                            {isHighRisk && (
                              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50 text-[10px]">
                                HIGH RISK
                              </Badge>
                            )}
                            {isIsolated && (
                              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/50 text-[10px]">
                                ISOLATED
                              </Badge>
                            )}
                          </h4>
                          <p className="text-xs text-slate-400">{device.platform} • {device.owner_user_id}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isOnline && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/50 animate-pulse">
                            <Activity className="w-3 h-3 mr-1" />
                            Online
                          </Badge>
                        )}
                        <Badge className={getStatusColor(device.status)}>
                          {device.status}
                        </Badge>
                        <Button // New button for details
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedDevice(device);
                            setDeviceDetailOpen(true);
                          }}
                          className="border-slate-700 text-white hover:bg-slate-800"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Details
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                      <div className="text-slate-400">
                        Enrolled: <span className="text-white">{format(new Date(device.enrolled_at), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="text-slate-400">
                        Last Seen: <span className="text-white">
                          {isOnline ? 'Just now' : `${minutesAgo}m ago`}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        OS: <span className="text-white">{device.device_info?.os_version || 'Unknown'}</span>
                      </div>
                      <div className="text-slate-400">
                        Agent: <span className="text-white">{device.device_info?.agent_version || 'N/A'}</span>
                      </div>
                    </div>

                    {device.capabilities && device.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {device.capabilities.map(cap => (
                          <Badge key={cap} variant="outline" className="text-xs">
                            {cap.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {hasThreatActors && ( // New section for threat actors
                      <div className="mt-3 pt-3 border-t border-slate-700">
                        <div className="flex items-center gap-2 text-xs text-red-400">
                          <AlertTriangle className="w-3 h-3" />
                          <span>
                            Associated with {device.security_profile.associated_threat_actors.length} threat actor(s)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Device Detail Dialog */}
      <Dialog open={deviceDetailOpen} onOpenChange={setDeviceDetailOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {selectedDevice?.display_name}
            </DialogTitle>
          </DialogHeader>

          {selectedDevice && (
            <div className="space-y-4 mt-4">
              {/* Device Inventory */}
              <DeviceInventoryPanel device={selectedDevice} />

              {/* AI-Powered Health Prediction */}
              <AIDeviceHealthPanel device={selectedDevice} />

              {/* AI-Powered Anomaly Detection */}
              <AIAnomalyDetectionPanel device={selectedDevice} />

              {/* AI-Powered Security Hardening */}
              <AIHardeningRecommendations device={selectedDevice} />

              {/* Remote Actions */}
              <RemoteActionsPanel device={selectedDevice} />

              {/* Real-time Monitoring */}
              <DeviceActivityMonitor device={selectedDevice} />

              {/* Vulnerability Management with AI */}
              <VulnerabilityManagement 
                device={selectedDevice}
                onScanComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ['devices'] });
                }}
              />

              {/* Behavioral Analysis */}
              <DeviceBehaviorAnalysis device={selectedDevice} />

              {/* Security Posture */}
              <DevicePostureAssessment device={selectedDevice} />

              {/* Automated Response */}
              <AutomatedResponseActions 
                device={selectedDevice} 
                onActionComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ['devices'] });
                  toast.success('Device updated');
                }}
              />

              {/* Threat Intelligence */}
              <ThreatActorContext device={selectedDevice} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Enrollment Dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={(open) => {
        setEnrollDialogOpen(open);
        if (!open) {
          setGeneratedToken(null);
        }
      }}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Enroll New Device</DialogTitle>
          </DialogHeader>

          <Tabs value={selectedPlatform} onValueChange={setSelectedPlatform} className="mt-4">
            <TabsList className="grid grid-cols-5 bg-slate-800">
              <TabsTrigger value="windows">Windows</TabsTrigger>
              <TabsTrigger value="macos">macOS</TabsTrigger>
              <TabsTrigger value="linux">Linux</TabsTrigger>
              <TabsTrigger value="ios">iOS</TabsTrigger>
              <TabsTrigger value="android">Android</TabsTrigger>
            </TabsList>

            {['windows', 'macos', 'linux', 'ios', 'android'].map(platform => (
              <TabsContent key={platform} value={platform} className="space-y-4 mt-4">
                <Alert className="bg-blue-500/10 border-blue-500/30">
                  <Info className="h-4 w-4 text-blue-400" />
                  <AlertDescription className="text-blue-300 text-sm">
                    <strong>Step 1:</strong> Generate an enrollment token, then download and install the Sentinel Agent on your {platform} device.
                  </AlertDescription>
                </Alert>

                {!generatedToken ? (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardContent className="p-6 text-center">
                      <Key className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                      <p className="text-white mb-4">Generate an enrollment token to begin</p>
                      <Button
                        onClick={() => generateTokenMutation.mutate()}
                        disabled={generateTokenMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                      >
                        {generateTokenMutation.isPending ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Key className="w-4 h-4 mr-2" />
                            Generate Enrollment Token
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card className="bg-green-900/20 border-green-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-green-400 font-semibold mb-1">Enrollment Token Generated</p>
                            <p className="text-xs text-slate-400">
                              Expires: {format(new Date(generatedToken.expires_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                          <CheckCircle className="w-6 h-6 text-green-400" />
                        </div>
                        <div className="mt-3 p-3 bg-slate-800 rounded-lg font-mono text-xs text-slate-300 break-all relative">
                          {generatedToken.token}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-1 right-1 h-8 w-8"
                            onClick={() => copyToClipboard(generatedToken.token)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-800 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          <Download className="w-5 h-5" />
                          Step 2: Download Agent
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => window.open(getInstallCommands(platform, generatedToken.token).download, '_blank')}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download Sentinel Agent for {platform}
                          </Button>
                          <Button
                            onClick={() => copyToClipboard(getInstallCommands(platform, generatedToken.token).download)}
                            variant="outline"
                            className="min-h-[44px] px-3 border-slate-700 text-white hover:bg-slate-800"
                            title="Copy download link"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-slate-400 text-center">
                          Direct link: <a href={getInstallCommands(platform, generatedToken.token).download} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{getInstallCommands(platform, generatedToken.token).download}</a>
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-800 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          <Terminal className="w-5 h-5" />
                          Step 3: Install & Enroll
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-300 whitespace-pre-wrap relative">
                          {getInstallCommands(platform, generatedToken.token).install}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-2 right-2 h-8 w-8"
                            onClick={() => copyToClipboard(getInstallCommands(platform, generatedToken.token).install)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>

                        <Alert className="bg-yellow-500/10 border-yellow-500/30">
                          <AlertTriangle className="h-4 w-4 text-yellow-400" />
                          <AlertDescription className="text-yellow-300 text-xs">
                            <strong>Security Note:</strong> The enrollment token is single-use and expires in 24 hours. Keep it secure.
                          </AlertDescription>
                        </Alert>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-800 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" />
                          Step 4: Verify Enrollment
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-slate-300 mb-3">
                          After installation, your device should appear in the devices list above within 1-2 minutes.
                        </p>
                        <Button
                          onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ['devices'] });
                            toast.success('Refreshed devices list');
                          }}
                          variant="outline"
                          className="w-full min-h-[44px]"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Refresh Devices List
                        </Button>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}