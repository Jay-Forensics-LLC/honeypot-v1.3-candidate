import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Shield, 
  Eye,
  Lock,
  Globe,
  Network,
  Camera,
  Mic,
  MapPin,
  Zap,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { toast } from "sonner";

const PRIVACY_PROFILES = {
  standard: {
    name: 'Standard',
    icon: Shield,
    color: 'text-blue-400',
    description: 'Balanced security for everyday use',
    settings: {
      vpn_required: false,
      tor_routing: false,
      location_spoofing: false,
      camera_block: false,
      microphone_block: false,
      clipboard_protection: false,
      network_isolation: false,
      encrypted_dns: false
    }
  },
  journalist: {
    name: 'Journalist',
    icon: Eye,
    color: 'text-orange-400',
    description: 'Protection for press and media workers',
    settings: {
      vpn_required: true,
      tor_routing: false,
      location_spoofing: true,
      camera_block: true,
      microphone_block: false,
      clipboard_protection: true,
      network_isolation: true,
      encrypted_dns: true,
      metadata_stripping: true,
      secure_communications_only: true
    }
  },
  activist: {
    name: 'Activist',
    icon: AlertTriangle,
    color: 'text-red-400',
    description: 'Maximum protection for at-risk individuals',
    settings: {
      vpn_required: true,
      tor_routing: true,
      location_spoofing: true,
      camera_block: true,
      microphone_block: true,
      clipboard_protection: true,
      network_isolation: true,
      encrypted_dns: true,
      metadata_stripping: true,
      secure_communications_only: true,
      emergency_wipe_enabled: true,
      covert_mode: true
    }
  },
  paranoid: {
    name: 'Maximum Security',
    icon: Lock,
    color: 'text-purple-400',
    description: 'Extreme hardening for nation-state threats',
    settings: {
      vpn_required: true,
      tor_routing: true,
      location_spoofing: true,
      camera_block: true,
      microphone_block: true,
      clipboard_protection: true,
      network_isolation: true,
      encrypted_dns: true,
      metadata_stripping: true,
      secure_communications_only: true,
      emergency_wipe_enabled: true,
      covert_mode: true,
      anti_forensics: true,
      keystroke_obfuscation: true,
      memory_encryption: true,
      offline_mode: false
    }
  }
};

export default function PrivacyModeProfiles() {
  const [selectedProfile, setSelectedProfile] = useState('standard');
  const [customSettings, setCustomSettings] = useState({});
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: activeProfile } = useQuery({
    queryKey: ['security-profile'],
    queryFn: async () => {
      const profiles = await base44.entities.SecurityProfile.filter({ 
        user_id: user?.email,
        active: true 
      });
      return profiles[0] || null;
    },
    enabled: !!user
  });

  const activateProfileMutation = useMutation({
    mutationFn: async (profileKey) => {
      const profile = PRIVACY_PROFILES[profileKey];
      
      // Deactivate current profile
      if (activeProfile) {
        await base44.entities.SecurityProfile.update(activeProfile.id, { active: false });
      }

      // Create and activate new profile
      const newProfile = await base44.entities.SecurityProfile.create({
        profile_id: `PROF-${Date.now()}`,
        user_id: user?.email,
        profile_name: profile.name,
        risk_level: profileKey === 'standard' ? 'low' : 
                    profileKey === 'journalist' ? 'medium' :
                    profileKey === 'activist' ? 'high' : 'critical',
        active: true,
        encryption_settings: {
          encryption_level: profileKey === 'paranoid' ? 'quantum_resistant' : 
                           profileKey === 'activist' ? 'military' : 'standard',
          vpn_mandatory: profile.settings.vpn_required,
          end_to_end_encryption: true,
          encrypted_dns: profile.settings.encrypted_dns
        },
        network_settings: {
          auto_vpn: profile.settings.vpn_required,
          tor_routing: profile.settings.tor_routing,
          firewall_level: profileKey === 'paranoid' ? 'paranoid' : 'strict',
          block_tracking: true
        },
        device_settings: {
          camera_block: profile.settings.camera_block,
          microphone_block: profile.settings.microphone_block,
          location_spoofing: profile.settings.location_spoofing,
          clipboard_protection: profile.settings.clipboard_protection,
          screen_recording_block: true,
          biometric_required: profileKey !== 'standard'
        },
        monitoring_settings: {
          behavioral_analysis: true,
          api_monitoring: true,
          network_traffic_analysis: true,
          zero_day_scanning: profileKey !== 'standard'
        },
        response_settings: {
          auto_remediation: true,
          device_isolation: profileKey !== 'standard',
          evidence_auto_collect: true,
          emergency_wipe: profile.settings.emergency_wipe_enabled || false
        }
      });

      // Create audit log
      await base44.entities.AuditLog.create({
        event_type: 'security_profile_activated',
        severity: 'info',
        description: `Activated ${profile.name} security profile`,
        user_id: user?.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          profile_id: newProfile.profile_id,
          profile_name: profile.name,
          risk_level: newProfile.risk_level
        }
      });

      return newProfile;
    },
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: ['security-profile'] });
      toast.success(`${profile.profile_name} mode activated! 🛡️`);
    }
  });

  const toggleSetting = (settingKey) => {
    setCustomSettings(prev => ({
      ...prev,
      [settingKey]: !prev[settingKey]
    }));
  };

  const currentProfile = PRIVACY_PROFILES[selectedProfile];
  const activeSettings = {
    ...currentProfile.settings,
    ...customSettings
  };

  return (
    <div className="space-y-6">
      {/* Profile Selection */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(PRIVACY_PROFILES).map(([key, profile]) => {
          const Icon = profile.icon;
          const isActive = activeProfile?.profile_name === profile.name;
          
          return (
            <Card
              key={key}
              onClick={() => setSelectedProfile(key)}
              className={`cursor-pointer transition-all ${
                selectedProfile === key
                  ? 'bg-blue-500/20 border-2 border-blue-500'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <Icon className={`w-10 h-10 ${profile.color}`} />
                  {isActive && (
                    <Badge className="bg-green-500 animate-pulse">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      ACTIVE
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold text-white mb-2">{profile.name}</h3>
                <p className="text-xs text-slate-400">{profile.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Profile Settings */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              {React.createElement(currentProfile.icon, { className: `w-5 h-5 ${currentProfile.color}` })}
              {currentProfile.name} Profile Settings
            </CardTitle>
            <Button
              onClick={() => activateProfileMutation.mutate(selectedProfile)}
              disabled={activateProfileMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Zap className="w-4 h-4 mr-2" />
              Activate Profile
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Network Protection */}
          <div>
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Network className="w-4 h-4 text-blue-400" />
              Network Protection
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-blue-400" />
                  <div>
                    <Label className="text-white font-semibold">VPN Required</Label>
                    <p className="text-xs text-slate-400">Force all traffic through VPN</p>
                  </div>
                </div>
                <Switch
                  checked={activeSettings.vpn_required}
                  onCheckedChange={() => toggleSetting('vpn_required')}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-purple-400" />
                  <div>
                    <Label className="text-white font-semibold">Tor Routing</Label>
                    <p className="text-xs text-slate-400">Route through Tor network</p>
                  </div>
                </div>
                <Switch
                  checked={activeSettings.tor_routing}
                  onCheckedChange={() => toggleSetting('tor_routing')}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-green-400" />
                  <div>
                    <Label className="text-white font-semibold">Encrypted DNS</Label>
                    <p className="text-xs text-slate-400">Use DNS-over-HTTPS</p>
                  </div>
                </div>
                <Switch
                  checked={activeSettings.encrypted_dns}
                  onCheckedChange={() => toggleSetting('encrypted_dns')}
                />
              </div>
            </div>
          </div>

          {/* Device Hardening */}
          <div>
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-orange-400" />
              Device Hardening
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Camera className="w-5 h-5 text-red-400" />
                  <div>
                    <Label className="text-white font-semibold">Camera Block</Label>
                    <p className="text-xs text-slate-400">Disable camera access</p>
                  </div>
                </div>
                <Switch
                  checked={activeSettings.camera_block}
                  onCheckedChange={() => toggleSetting('camera_block')}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Mic className="w-5 h-5 text-red-400" />
                  <div>
                    <Label className="text-white font-semibold">Microphone Block</Label>
                    <p className="text-xs text-slate-400">Disable microphone access</p>
                  </div>
                </div>
                <Switch
                  checked={activeSettings.microphone_block}
                  onCheckedChange={() => toggleSetting('microphone_block')}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-yellow-400" />
                  <div>
                    <Label className="text-white font-semibold">Location Spoofing</Label>
                    <p className="text-xs text-slate-400">Fake GPS coordinates</p>
                  </div>
                </div>
                <Switch
                  checked={activeSettings.location_spoofing}
                  onCheckedChange={() => toggleSetting('location_spoofing')}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-purple-400" />
                  <div>
                    <Label className="text-white font-semibold">Clipboard Protection</Label>
                    <p className="text-xs text-slate-400">Encrypt clipboard data</p>
                  </div>
                </div>
                <Switch
                  checked={activeSettings.clipboard_protection}
                  onCheckedChange={() => toggleSetting('clipboard_protection')}
                />
              </div>
            </div>
          </div>

          {/* Extreme Measures (Activist/Paranoid only) */}
          {(selectedProfile === 'activist' || selectedProfile === 'paranoid') && (
            <div>
              <h4 className="font-semibold text-red-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Extreme Protection Measures
              </h4>
              <div className="space-y-3">
                {activeSettings.emergency_wipe_enabled && (
                  <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <Label className="text-red-400 font-semibold">Emergency Wipe Enabled</Label>
                    </div>
                    <p className="text-xs text-slate-300">
                      Device will auto-wipe after 3 failed authentication attempts or on remote trigger
                    </p>
                  </div>
                )}

                {activeSettings.covert_mode && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="w-4 h-4 text-purple-400" />
                      <Label className="text-purple-400 font-semibold">Covert Mode Active</Label>
                    </div>
                    <p className="text-xs text-slate-300">
                      App runs in background with no visible UI indicators
                    </p>
                  </div>
                )}

                {activeSettings.anti_forensics && (
                  <div className="p-3 bg-orange-500/10 border border-orange-500 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="w-4 h-4 text-orange-400" />
                      <Label className="text-orange-400 font-semibold">Anti-Forensics Enabled</Label>
                    </div>
                    <p className="text-xs text-slate-300">
                      RAM wiping, secure deletion, and metadata scrubbing active
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warning */}
      <Card className="bg-yellow-500/10 border-2 border-yellow-500">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-yellow-400 mb-2">Important Notice</h4>
              <p className="text-sm text-slate-300 mb-2">
                Privacy modes provide strong protection but may impact:
              </p>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• <strong>Performance:</strong> Tor routing and encryption add latency</li>
                <li>• <strong>Functionality:</strong> Camera/mic blocking disables video calls</li>
                <li>• <strong>Usability:</strong> Higher security requires more authentication</li>
                <li>• <strong>Legal:</strong> Some features may be restricted in certain jurisdictions</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}