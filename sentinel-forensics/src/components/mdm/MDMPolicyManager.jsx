import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Shield,
  Trash2,
  Lock,
  Wifi,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function MDMPolicyManager() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    policy_name: '',
    platform: 'both',
    passcode_required: true,
    passcode_min_length: 6,
    passcode_alphanumeric: false,
    allow_biometric: true,
    require_encryption: true,
    require_vpn: false,
    block_untrusted_wifi: true,
    enable_remote_wipe: true,
    require_screen_lock: true
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['mdm-policies'],
    queryFn: () => base44.entities.MDMPolicy.list('-created_date', 50),
    staleTime: 60000
  });

  const createPolicyMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.MDMPolicy.create({
        policy_id: `POLICY-${Date.now()}`,
        policy_name: formData.policy_name,
        description: `Custom ${formData.platform} security policy`,
        platform: formData.platform,
        policy_config: {
          passcode: {
            required: formData.passcode_required,
            min_length: formData.passcode_min_length,
            require_alphanumeric: formData.passcode_alphanumeric,
            allow_biometric: formData.allow_biometric,
            max_failed_attempts: 5
          },
          encryption: {
            require_device_encryption: formData.require_encryption
          },
          network: {
            require_vpn: formData.require_vpn,
            block_untrusted_wifi: formData.block_untrusted_wifi
          },
          app_restrictions: {
            blocked_apps: [],
            require_app_signatures: true
          },
          security: {
            enable_remote_wipe: formData.enable_remote_wipe,
            allow_camera: true,
            allow_screenshots: true,
            require_screen_lock: formData.require_screen_lock
          }
        },
        compliance_rules: [],
        assigned_device_ids: [],
        device_count: 0,
        is_default: false,
        is_active: true,
        created_by: 'user'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mdm-policies'] });
      setCreateOpen(false);
      setFormData({
        policy_name: '',
        platform: 'both',
        passcode_required: true,
        passcode_min_length: 6,
        passcode_alphanumeric: false,
        allow_biometric: true,
        require_encryption: true,
        require_vpn: false,
        block_untrusted_wifi: true,
        enable_remote_wipe: true,
        require_screen_lock: true
      });
      toast.success('Policy created successfully');
    },
    onError: (error) => {
      toast.error('Failed to create policy', { description: error.message });
    }
  });

  const deletePolicyMutation = useMutation({
    mutationFn: async (policyId) => {
      const policy = policies.find(p => p.id === policyId);
      if (policy.is_default) {
        throw new Error('Cannot delete default policy');
      }
      return await base44.entities.MDMPolicy.delete(policyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mdm-policies'] });
      toast.success('Policy deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete policy', { description: error.message });
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Security Policies</h3>
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Policy
        </Button>
      </div>

      {policies.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-white mb-2">No policies created</p>
            <p className="text-sm text-slate-400">Create your first security policy</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {policies.map(policy => (
            <Card key={policy.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-white">{policy.policy_name}</h4>
                      <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                        {policy.platform}
                      </Badge>
                      {policy.is_default && (
                        <Badge className="bg-green-500/20 text-green-400 text-xs">Default</Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400">
                      <div>{policy.device_count || 0} devices</div>
                      <div>{policy.policy_config?.passcode?.required ? '🔐 Passcode' : '🔓 Optional'}</div>
                      <div>{policy.policy_config?.encryption?.require_device_encryption ? '🔒 Encrypted' : ''}</div>
                      <div>{policy.policy_config?.network?.require_vpn ? '🛡️ VPN' : ''}</div>
                    </div>
                  </div>

                  {!policy.is_default && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deletePolicyMutation.mutate(policy.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Policy Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Security Policy</DialogTitle>
            <DialogDescription className="text-slate-400">
              Define security requirements for mobile devices
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-white">Policy Name *</Label>
              <Input
                value={formData.policy_name}
                onChange={(e) => setFormData({...formData, policy_name: e.target.value})}
                placeholder="e.g., High Security iOS Policy"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <Label className="text-white">Platform</Label>
              <Select value={formData.platform} onValueChange={(value) => setFormData({...formData, platform: value})}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="both">iOS & Android</SelectItem>
                  <SelectItem value="ios">iOS Only</SelectItem>
                  <SelectItem value="android">Android Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 border-t border-slate-700 pt-4">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Passcode Settings
              </h4>
              
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                <div>
                  <p className="text-sm text-white">Require Passcode</p>
                  <p className="text-xs text-slate-400">Mandatory device passcode</p>
                </div>
                <Switch
                  checked={formData.passcode_required}
                  onCheckedChange={(checked) => setFormData({...formData, passcode_required: checked})}
                />
              </div>

              {formData.passcode_required && (
                <>
                  <div>
                    <Label className="text-white">Minimum Length</Label>
                    <Input
                      type="number"
                      min="4"
                      max="16"
                      value={formData.passcode_min_length}
                      onChange={(e) => setFormData({...formData, passcode_min_length: parseInt(e.target.value)})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                    <div>
                      <p className="text-sm text-white">Allow Biometric</p>
                      <p className="text-xs text-slate-400">Face ID / Touch ID / Fingerprint</p>
                    </div>
                    <Switch
                      checked={formData.allow_biometric}
                      onCheckedChange={(checked) => setFormData({...formData, allow_biometric: checked})}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3 border-t border-slate-700 pt-4">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Security Settings
              </h4>

              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                <div>
                  <p className="text-sm text-white">Require Encryption</p>
                  <p className="text-xs text-slate-400">Full device encryption</p>
                </div>
                <Switch
                  checked={formData.require_encryption}
                  onCheckedChange={(checked) => setFormData({...formData, require_encryption: checked})}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                <div>
                  <p className="text-sm text-white">Enable Remote Wipe</p>
                  <p className="text-xs text-slate-400">Allow emergency data wipe</p>
                </div>
                <Switch
                  checked={formData.enable_remote_wipe}
                  onCheckedChange={(checked) => setFormData({...formData, enable_remote_wipe: checked})}
                />
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-700 pt-4">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <Wifi className="w-4 h-4" />
                Network Settings
              </h4>

              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                <div>
                  <p className="text-sm text-white">Block Untrusted WiFi</p>
                  <p className="text-xs text-slate-400">Prevent connections to open networks</p>
                </div>
                <Switch
                  checked={formData.block_untrusted_wifi}
                  onCheckedChange={(checked) => setFormData({...formData, block_untrusted_wifi: checked})}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                <div>
                  <p className="text-sm text-white">Require VPN</p>
                  <p className="text-xs text-slate-400">Mandatory VPN connection</p>
                </div>
                <Switch
                  checked={formData.require_vpn}
                  onCheckedChange={(checked) => setFormData({...formData, require_vpn: checked})}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                className="border-slate-700 text-white hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={() => createPolicyMutation.mutate()}
                disabled={createPolicyMutation.isPending || !formData.policy_name}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Create Policy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}