import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Shield,
  Smartphone,
  Eye,
  EyeOff,
  Mic,
  MicOff,
  MapPin,
  MapPinOff,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Zap,
  Fingerprint,
  Key
} from "lucide-react";
import { toast } from "sonner";

const PROTECTION_FEATURES = [
  {
    id: 'camera_protection',
    name: 'Camera Protection',
    description: 'Block unauthorized camera access',
    icon: Eye,
    iconOff: EyeOff,
    risk: 'Spyware can silently activate your camera',
    action: 'Enable camera blocking for suspicious apps',
    severity: 'high'
  },
  {
    id: 'microphone_protection',
    name: 'Microphone Protection',
    description: 'Block unauthorized microphone access',
    icon: Mic,
    iconOff: MicOff,
    risk: 'Malware can record your conversations',
    action: 'Enable microphone blocking for suspicious apps',
    severity: 'high'
  },
  {
    id: 'location_protection',
    name: 'Location Privacy',
    description: 'Hide your real location',
    icon: MapPin,
    iconOff: MapPinOff,
    risk: 'Stalkerware tracks your movements',
    action: 'Enable location spoofing or disable location services',
    severity: 'critical'
  },
  {
    id: 'network_protection',
    name: 'Network Protection',
    description: 'Encrypt all network traffic',
    icon: Wifi,
    iconOff: WifiOff,
    risk: 'Unencrypted traffic can be intercepted',
    action: 'Enable automatic VPN on all networks',
    severity: 'critical'
  },
  {
    id: 'clipboard_protection',
    name: 'Clipboard Protection',
    description: 'Protect sensitive clipboard data',
    icon: Key,
    iconOff: Key,
    risk: 'Apps can steal passwords from clipboard',
    action: 'Enable clipboard encryption and monitoring',
    severity: 'medium'
  },
  {
    id: 'biometric_security',
    name: 'Biometric Lock',
    description: 'Require fingerprint/face for sensitive actions',
    icon: Fingerprint,
    iconOff: Fingerprint,
    risk: 'Unauthorized access to security features',
    action: 'Enable biometric authentication',
    severity: 'medium'
  }
];

export default function DeviceProtection() {
  const [protectionStatus, setProtectionStatus] = useState({});
  const [applyingProtection, setApplyingProtection] = useState(null);
  const [autoProtectMode, setAutoProtectMode] = useState(false);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: activeProfile } = useQuery({
    queryKey: ['active-security-profile'],
    queryFn: async () => {
      const profiles = await base44.entities.SecurityProfile.filter({ 
        user_id: user?.email,
        active: true 
      });
      return profiles[0];
    },
    enabled: !!user
  });

  useEffect(() => {
    if (activeProfile) {
      setProtectionStatus({
        camera_protection: activeProfile.device_settings?.camera_block || false,
        microphone_protection: activeProfile.device_settings?.microphone_block || false,
        location_protection: activeProfile.device_settings?.location_spoofing || false,
        network_protection: activeProfile.network_settings?.auto_vpn || false,
        clipboard_protection: activeProfile.device_settings?.clipboard_protection || false,
        biometric_security: activeProfile.device_settings?.biometric_required || false
      });
    }
  }, [activeProfile]);

  const toggleProtectionMutation = useMutation({
    mutationFn: async ({ featureId, enabled }) => {
      setApplyingProtection(featureId);
      
      // Simulate applying protection
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update security profile
      if (activeProfile) {
        const updatedSettings = { ...activeProfile };
        
        switch(featureId) {
          case 'camera_protection':
            updatedSettings.device_settings.camera_block = enabled;
            break;
          case 'microphone_protection':
            updatedSettings.device_settings.microphone_block = enabled;
            break;
          case 'location_protection':
            updatedSettings.device_settings.location_spoofing = enabled;
            break;
          case 'network_protection':
            updatedSettings.network_settings.auto_vpn = enabled;
            break;
          case 'clipboard_protection':
            updatedSettings.device_settings.clipboard_protection = enabled;
            break;
          case 'biometric_security':
            updatedSettings.device_settings.biometric_required = enabled;
            break;
        }
        
        await base44.entities.SecurityProfile.update(activeProfile.id, updatedSettings);
      }
      
      // Create audit log
      await base44.entities.AuditLog.create({
        event_type: 'device_protection_changed',
        severity: 'info',
        description: `Device protection ${enabled ? 'enabled' : 'disabled'}: ${featureId}`,
        user_id: user?.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { feature: featureId, enabled }
      });
      
      return { featureId, enabled };
    },
    onSuccess: ({ featureId, enabled }) => {
      setApplyingProtection(null);
      setProtectionStatus(prev => ({ ...prev, [featureId]: enabled }));
      queryClient.invalidateQueries({ queryKey: ['active-security-profile'] });
      
      const feature = PROTECTION_FEATURES.find(f => f.id === featureId);
      toast.success(`${feature?.name} ${enabled ? 'enabled' : 'disabled'}`);
    },
    onError: () => {
      setApplyingProtection(null);
      toast.error('Failed to update protection');
    }
  });

  const enableAllProtectionsMutation = useMutation({
    mutationFn: async () => {
      setAutoProtectMode(true);
      
      // Enable all critical and high severity protections
      for (const feature of PROTECTION_FEATURES) {
        if (feature.severity === 'critical' || feature.severity === 'high') {
          await toggleProtectionMutation.mutateAsync({ 
            featureId: feature.id, 
            enabled: true 
          });
        }
      }
    },
    onSuccess: () => {
      setAutoProtectMode(false);
      toast.success('🛡️ All critical protections enabled!');
    },
    onError: () => {
      setAutoProtectMode(false);
      toast.error('Failed to enable all protections');
    }
  });

  const enabledCount = Object.values(protectionStatus).filter(Boolean).length;
  const totalCount = PROTECTION_FEATURES.length;
  const protectionLevel = (enabledCount / totalCount) * 100;

  return (
    <div className="space-y-6">
      {/* Protection Overview */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Device Guardian - Automated Protection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Protection Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Protection Level</span>
              <span className="text-sm font-semibold text-white">
                {enabledCount} / {totalCount} Active
              </span>
            </div>
            <Progress value={protectionLevel} className="h-3 mb-2" />
            <div className="flex items-center gap-2">
              {protectionLevel >= 80 ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400 font-semibold">
                    Excellent Protection
                  </span>
                </>
              ) : protectionLevel >= 50 ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-yellow-400 font-semibold">
                    Moderate Protection
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-400 font-semibold">
                    Weak Protection - Action Needed
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Quick Action */}
          {protectionLevel < 80 && (
            <Button
              onClick={() => enableAllProtectionsMutation.mutate()}
              disabled={autoProtectMode}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
            >
              {autoProtectMode ? (
                <>
                  <Zap className="w-4 h-4 mr-2 animate-spin" />
                  Enabling Protections...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Enable All Critical Protections
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Protection Features */}
      <div className="grid md:grid-cols-2 gap-4">
        {PROTECTION_FEATURES.map(feature => {
          const isEnabled = protectionStatus[feature.id];
          const isApplying = applyingProtection === feature.id;
          const Icon = isEnabled ? feature.icon : feature.iconOff;
          
          return (
            <Card 
              key={feature.id}
              className={`bg-slate-900/50 border-2 transition-all ${
                isEnabled 
                  ? 'border-green-500/50' 
                  : feature.severity === 'critical'
                  ? 'border-red-500/50'
                  : feature.severity === 'high'
                  ? 'border-orange-500/50'
                  : 'border-slate-800'
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isEnabled 
                        ? 'bg-green-500/20' 
                        : feature.severity === 'critical'
                        ? 'bg-red-500/20'
                        : 'bg-slate-700/50'
                    }`}>
                      <Icon className={`w-5 h-5 ${
                        isEnabled ? 'text-green-400' : 
                        feature.severity === 'critical' ? 'text-red-400' :
                        'text-slate-400'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">{feature.name}</h3>
                      <p className="text-xs text-slate-400">{feature.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleProtectionMutation.mutate({ 
                      featureId: feature.id, 
                      enabled: !isEnabled 
                    })}
                    disabled={isApplying}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      isEnabled ? 'bg-green-500' : 'bg-slate-600'
                    } ${isApplying ? 'opacity-50' : ''}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      isEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {!isEnabled && (
                  <div className={`p-3 rounded-lg ${
                    feature.severity === 'critical' ? 'bg-red-500/10 border border-red-500' :
                    feature.severity === 'high' ? 'bg-orange-500/10 border border-orange-500' :
                    'bg-yellow-500/10 border border-yellow-500'
                  }`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                        feature.severity === 'critical' ? 'text-red-400' :
                        feature.severity === 'high' ? 'text-orange-400' :
                        'text-yellow-400'
                      }`} />
                      <div className="text-xs">
                        <p className={`font-semibold mb-1 ${
                          feature.severity === 'critical' ? 'text-red-200' :
                          feature.severity === 'high' ? 'text-orange-200' :
                          'text-yellow-200'
                        }`}>
                          Risk: {feature.risk}
                        </p>
                        <p className={`${
                          feature.severity === 'critical' ? 'text-red-300/90' :
                          feature.severity === 'high' ? 'text-orange-300/90' :
                          'text-yellow-300/90'
                        }`}>
                          Action: {feature.action}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {isEnabled && (
                  <div className="p-3 bg-green-500/10 border border-green-500 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-green-200 font-semibold">
                        Protection Active
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Security Tips */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-purple-400" />
            Security Best Practices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              'Keep your device updated with latest security patches',
              'Don\'t click suspicious links or download unknown apps',
              'Use strong, unique passwords for all accounts',
              'Enable biometric authentication whenever possible',
              'Review app permissions regularly',
              'Use VPN on public WiFi networks',
              'Back up important data regularly',
              'Be cautious of phishing attempts via SMS/email'
            ].map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}