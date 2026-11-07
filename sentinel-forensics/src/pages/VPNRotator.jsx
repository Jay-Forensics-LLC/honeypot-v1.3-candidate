
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Play,
  Square,
  Zap,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  Lock,
  Activity,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '../components/utils/formatters';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { vpnRotateStart } from '../functions/vpnRotateStart';
import { vpnRotateStop } from '../functions/vpnRotateStop';
import { vpnRotateOnce } from '../functions/vpnRotateOnce';
import { vpnRotateStatus } from '../functions/vpnRotateStatus';
import { vpnManageProfiles } from '../functions/vpnManageProfiles';

export default function VPNRotator() {
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [interval, setInterval] = useState(30);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [newProfile, setNewProfile] = useState({
    profile_name: '',
    profile_type: 'openvpn',
    config_content: '',
    password: '',
    health_probe_url: 'https://icanhazip.com'
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['vpn-profiles'],
    queryFn: async () => {
      const { data } = await vpnManageProfiles({});
      return data.profiles || [];
    },
    refetchInterval: 10000,
    initialData: []
  });

  const { data: status } = useQuery({
    queryKey: ['vpn-rotation-status'],
    queryFn: async () => {
      const { data } = await vpnRotateStatus({});
      return data;
    },
    refetchInterval: 5000,
    initialData: { configured: false }
  });

  const startRotationMutation = useMutation({
    mutationFn: async () => {
      const { data } = await vpnRotateStart({
        interval_seconds: interval,
        profile_ids: selectedProfiles,
        options: {
          risk_accepted: interval < 30 ? riskAccepted : false,
          stop_on_failure: true,
          kill_switch_enabled: true,
          parallel_bringup: true
        }
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vpn-rotation-status'] });
      toast.success('VPN rotation started!', {
        description: `Rotating every ${interval} seconds`
      });
    },
    onError: (error) => {
      toast.error('Failed to start rotation: ' + error.message);
    }
  });

  const stopRotationMutation = useMutation({
    mutationFn: async () => {
      const { data } = await vpnRotateStop({});
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vpn-rotation-status'] });
      toast.success('VPN rotation stopped');
    },
    onError: (error) => {
      toast.error('Failed to stop rotation: ' + error.message);
    }
  });

  const rotateOnceMutation = useMutation({
    mutationFn: async () => {
      const { data } = await vpnRotateOnce({});
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['vpn-rotation-status'] });
      queryClient.invalidateQueries({ queryKey: ['vpn-profiles'] });
      
      if (data.success) {
        toast.success('VPN rotated successfully!', {
          description: `Now using: ${data.new_profile_name}`
        });
      } else {
        toast.error('Rotation failed', {
          description: data.message
        });
      }
    },
    onError: (error) => {
      toast.error('Rotation failed: ' + error.message);
    }
  });

  const addProfileMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('vpnManageProfiles', {
        method: 'POST',
        ...newProfile
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vpn-profiles'] });
      setAddProfileOpen(false);
      setNewProfile({
        profile_name: '',
        profile_type: 'openvpn',
        config_content: '',
        password: '',
        health_probe_url: 'https://icanhazip.com'
      });
      toast.success('VPN profile added!');
    },
    onError: (error) => {
      toast.error('Failed to add profile: ' + error.message);
    }
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (profileId) => {
      await base44.entities.VPNProfile.delete(profileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vpn-profiles'] });
      toast.success('Profile deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete profile: ' + error.message);
    }
  });

  const toggleProfile = (profileId) => {
    if (selectedProfiles.includes(profileId)) {
      setSelectedProfiles(selectedProfiles.filter(id => id !== profileId));
    } else {
      setSelectedProfiles([...selectedProfiles, profileId]);
    }
  };

  const canStartRotation = selectedProfiles.length >= 2 && !status?.enabled;
  const needsRiskAcceptance = interval < 30 && !riskAccepted;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">VPN Profile Rotator</h1>
          <p className="text-slate-400">Automated VPN rotation for enhanced privacy and security</p>
        </div>
        <Button
          onClick={() => setAddProfileOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-purple-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add VPN Profile
        </Button>
      </div>

      {/* Rotation Control */}
      <Card className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-purple-500/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <RefreshCw className={`w-6 h-6 text-purple-400 ${status?.enabled ? 'animate-spin' : ''}`} />
            Rotation Control
            {status?.enabled && (
              <Badge className="bg-green-500/20 text-green-400 ml-2">
                <Activity className="w-3 h-3 mr-1" />
                ACTIVE
              </Badge>
            )}
            {status?.kill_switch_active && (
              <Badge className="bg-red-500/20 text-red-400 ml-2">
                <Lock className="w-3 h-3 mr-1" />
                KILL SWITCH
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Interval Slider */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-slate-300">
                Rotation Interval: <span className="text-white font-bold">{interval}s</span>
              </label>
              <div className="flex gap-2">
                <Badge className={
                  interval < 30 ? 'bg-red-500/20 text-red-400' :
                  interval < 60 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-green-500/20 text-green-400'
                }>
                  {interval < 30 ? 'FAST' : interval < 60 ? 'NORMAL' : 'SAFE'}
                </Badge>
              </div>
            </div>
            
            <Slider
              value={[interval]}
              onValueChange={(value) => setInterval(value[0])}
              min={10}
              max={600}
              step={interval < 60 ? 10 : 30}
              disabled={status?.enabled}
              className="mb-2"
            />
            
            <div className="flex justify-between text-xs text-slate-400">
              <span>10s (Fast)</span>
              <span>60s (Recommended)</span>
              <span>600s (Slow)</span>
            </div>
          </div>

          {/* Risk Warning for Fast Intervals */}
          {interval < 30 && (
            <Alert className="bg-red-900/20 border-red-500/30">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <AlertDescription className="text-red-300">
                <strong className="block mb-2">⚠️ Fast Rotation Warning</strong>
                <p className="text-sm mb-3">
                  Intervals below 30 seconds may:
                </p>
                <ul className="list-disc ml-6 text-sm space-y-1">
                  <li>Trigger VPN provider rate limits or account blocks</li>
                  <li>Violate provider terms of service</li>
                  <li>Cause connection instability and packet loss</li>
                  <li>Increase CPU usage and battery drain on mobile</li>
                </ul>
                
                <div className="flex items-center gap-2 mt-4 bg-red-950/50 p-3 rounded">
                  <input
                    type="checkbox"
                    id="risk-accept"
                    checked={riskAccepted}
                    onChange={(e) => setRiskAccepted(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="risk-accept" className="text-sm cursor-pointer">
                    I understand and accept the risks of fast rotation
                  </label>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Profile Selection */}
          <div>
            <h3 className="text-sm text-slate-300 mb-3">
              Select Profiles for Rotation ({selectedProfiles.length}/6 max)
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              {profiles.map((profile) => (
                <Card
                  key={profile.id}
                  className={`cursor-pointer transition-all ${
                    selectedProfiles.includes(profile.id)
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  }`}
                  onClick={() => toggleProfile(profile.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-white">{profile.profile_name}</h4>
                          <Badge className={
                            profile.profile_type === 'wireguard' 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-blue-500/20 text-blue-400'
                          }>
                            {profile.profile_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>✅ {profile.success_count || 0}</span>
                          <span>❌ {profile.failure_count || 0}</span>
                          {profile.average_rtt_ms && (
                            <span>⚡ {profile.average_rtt_ms}ms</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedProfiles.includes(profile.id) && (
                          <CheckCircle className="w-5 h-5 text-blue-400" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="grid md:grid-cols-3 gap-3 pt-4 border-t border-slate-700">
            <Button
              onClick={() => startRotationMutation.mutate()}
              disabled={!canStartRotation || needsRiskAcceptance || startRotationMutation.isPending || status?.enabled}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              {startRotationMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Start Rotation
            </Button>

            <Button
              onClick={() => stopRotationMutation.mutate()}
              disabled={!status?.enabled || stopRotationMutation.isPending}
              className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
            >
              {stopRotationMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Square className="w-4 h-4 mr-2" />
              )}
              Stop Rotation
            </Button>

            <Button
              onClick={() => rotateOnceMutation.mutate()}
              disabled={rotateOnceMutation.isPending || !status?.configured}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {rotateOnceMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Rotate Now
            </Button>
          </div>

          {/* Validation Messages */}
          {selectedProfiles.length < 2 && (
            <Alert className="bg-yellow-900/20 border-yellow-500/30">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-300 text-sm">
                Select at least 2 profiles to enable rotation
              </AlertDescription>
            </Alert>
          )}

          {needsRiskAcceptance && (
            <Alert className="bg-red-900/20 border-red-500/30">
              <Lock className="h-4 w-4 text-red-400" />
              <AlertDescription className="text-red-300 text-sm">
                Accept risk warning above to enable fast rotation
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Status Dashboard */}
      {status?.configured && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Rotation Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-1">Current Profile:</p>
                <p className="text-lg font-bold text-white">
                  {status.current_profile?.name || 'None'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {status.current_profile?.type}
                </p>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-1">Next Rotation:</p>
                <p className="text-lg font-bold text-white">
                  {status.next_rotate_at ? formatRelativeTime(status.next_rotate_at) : 'Stopped'}
                </p>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-1">Success Rate:</p>
                <p className="text-lg font-bold text-green-400">
                  {status.success_rate}%
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {status.metrics?.rotations_success}/{status.metrics?.rotations_total}
                </p>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-1">Uptime:</p>
                <p className="text-lg font-bold text-white">
                  {Math.floor((status.uptime || 0) / 60)}m
                </p>
              </div>
            </div>

            {/* Recent Rotations Timeline */}
            {status.recent_rotations && status.recent_rotations.length > 0 && (
              <div>
                <h4 className="font-semibold text-white mb-3">Recent Rotations</h4>
                <div className="space-y-2">
                  {status.recent_rotations.slice(0, 10).map((rotation, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-800/30 rounded p-3">
                      <Badge className={
                        rotation.result === 'success' ? 'bg-green-500/20 text-green-400' :
                        'bg-red-500/20 text-red-400'
                      }>
                        {rotation.result}
                      </Badge>
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-xs text-slate-300 flex-1">
                        {rotation.from} → {rotation.to}
                      </span>
                      <span className="text-xs text-slate-400">
                        {rotation.duration_ms}ms
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatRelativeTime(rotation.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Profile Dialog */}
      <Dialog open={addProfileOpen} onOpenChange={setAddProfileOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add VPN Profile</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-300 mb-2 block">Profile Name *</label>
                <Input
                  value={newProfile.profile_name}
                  onChange={(e) => setNewProfile({...newProfile, profile_name: e.target.value})}
                  placeholder="e.g., NordVPN US-East"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div>
                <label className="text-sm text-slate-300 mb-2 block">Type *</label>
                <select
                  value={newProfile.profile_type}
                  onChange={(e) => setNewProfile({...newProfile, profile_type: e.target.value})}
                  className="w-full bg-slate-800 border-slate-700 rounded px-3 py-2 text-sm"
                >
                  <option value="openvpn">OpenVPN</option>
                  <option value="wireguard">WireGuard</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-300 mb-2 block">Configuration File *</label>
              <Textarea
                value={newProfile.config_content}
                onChange={(e) => setNewProfile({...newProfile, config_content: e.target.value})}
                placeholder={newProfile.profile_type === 'openvpn' 
                  ? "Paste .ovpn file contents here..."
                  : "Paste WireGuard config here..."}
                className="bg-slate-800 border-slate-700 font-mono text-xs"
                rows={8}
              />
            </div>

            <div>
              <label className="text-sm text-slate-300 mb-2 block">Encryption Password *</label>
              <Input
                type="password"
                value={newProfile.password}
                onChange={(e) => setNewProfile({...newProfile, password: e.target.value})}
                placeholder="Strong password to encrypt this profile"
                className="bg-slate-800 border-slate-700"
              />
              <p className="text-xs text-slate-500 mt-1">
                Used to encrypt credentials at rest (AES-256-GCM)
              </p>
            </div>

            <div>
              <label className="text-sm text-slate-300 mb-2 block">Health Probe URL</label>
              <Input
                value={newProfile.health_probe_url}
                onChange={(e) => setNewProfile({...newProfile, health_probe_url: e.target.value})}
                placeholder="https://icanhazip.com"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddProfileOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addProfileMutation.mutate()}
                disabled={
                  addProfileMutation.isPending ||
                  !newProfile.profile_name ||
                  !newProfile.config_content ||
                  !newProfile.password
                }
                className="bg-blue-600 hover:bg-blue-700"
              >
                {addProfileMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Profile
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
