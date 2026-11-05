import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Shield,
  Activity,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { DateUtils } from '../components/utils/DateUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AgentTokenManagement() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTokenData, setNewTokenData] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const queryClient = useQueryClient();

  const [newToken, setNewToken] = useState({
    token_name: '',
    expires_in_days: 365,
    allowed_ips: '',
    allowed_devices: []
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: tokens = [] } = useQuery({
    queryKey: ['agent-tokens'],
    queryFn: async () => {
      const data = await base44.entities.AgentToken.list('-created_date');
      return data || [];
    },
    enabled: user?.role === 'admin',
    initialData: []
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: () => base44.entities.Device.list('-enrolled_at'),
    enabled: !!user,
    initialData: []
  });

  const createTokenMutation = useMutation({
    mutationFn: async () => {
      // Generate cryptographically secure token
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const token = btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      // Hash token for storage
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(newToken.expires_in_days));

      const allowedIPs = newToken.allowed_ips
        .split(',')
        .map(ip => ip.trim())
        .filter(ip => ip.length > 0);

      const tokenRecord = await base44.entities.AgentToken.create({
        token_name: newToken.token_name,
        token_hash: tokenHash,
        token_prefix: token.substring(0, 8),
        created_by: user.email,
        expires_at: expiresAt.toISOString(),
        last_used_at: null,
        usage_count: 0,
        allowed_ips: allowedIPs,
        allowed_devices: newToken.allowed_devices,
        rate_limit: {
          requests_per_minute: 60,
          requests_per_hour: 1000
        },
        permissions: ['ingest_result', 'heartbeat'],
        status: 'active'
      });

      // Audit log
      await base44.entities.AuditLog.create({
        event_type: 'agent_token_created',
        severity: 'info',
        description: `Agent token "${newToken.token_name}" created`,
        user_id: user.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          token_id: tokenRecord.id,
          expires_at: expiresAt.toISOString(),
          allowed_ips: allowedIPs.length,
          allowed_devices: newToken.allowed_devices.length
        }
      });

      return { tokenRecord, plainToken: token };
    },
    onSuccess: ({ tokenRecord, plainToken }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-tokens'] });
      setNewTokenData({ ...tokenRecord, plain_token: plainToken });
      setCreateDialogOpen(false);
      setNewToken({
        token_name: '',
        expires_in_days: 365,
        allowed_ips: '',
        allowed_devices: []
      });
    },
    onError: (error) => {
      toast.error('Failed to create token');
      console.error(error);
    }
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async (tokenId) => {
      await base44.entities.AgentToken.update(tokenId, {
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: user.email
      });

      await base44.entities.AuditLog.create({
        event_type: 'agent_token_revoked',
        severity: 'warning',
        description: 'Agent token revoked',
        user_id: user.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { token_id: tokenId }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tokens'] });
      setRevokeTarget(null);
      toast.success('Token revoked successfully');
    },
    onError: (error) => {
      toast.error('Failed to revoke token');
      console.error(error);
    }
  });

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const activeTokens = tokens.filter(t => t.status === 'active' && new Date(t.expires_at) > new Date());
  const revokedTokens = tokens.filter(t => t.status === 'revoked');

  if (user?.role !== 'admin') {
    return (
      <div className="p-6">
        <Card className="bg-red-900/20 border-red-500/30">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-red-400" />
            <h2 className="text-xl font-bold text-red-300 mb-2">Admin Access Required</h2>
            <p className="text-red-200">Agent token management is restricted to administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Agent Token Management</h1>
          <p className="text-slate-400">Secure authentication tokens for field agents</p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Token
        </Button>
      </div>

      {/* Security Warning */}
      <Card className="bg-yellow-500/10 border-yellow-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <p className="font-semibold mb-1">Security Best Practices</p>
              <ul className="list-disc list-inside space-y-1 text-yellow-300/80">
                <li>Tokens are shown only once during creation</li>
                <li>Use IP whitelisting when possible</li>
                <li>Rotate tokens every 90-365 days</li>
                <li>Revoke unused or compromised tokens immediately</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Key className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{activeTokens.length}</p>
                <p className="text-sm text-slate-400">Active Tokens</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Activity className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {tokens.reduce((sum, t) => sum + (t.usage_count || 0), 0)}
                </p>
                <p className="text-sm text-slate-400">Total API Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Trash2 className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-3xl font-bold text-white">{revokedTokens.length}</p>
                <p className="text-sm text-slate-400">Revoked Tokens</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Tokens */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Active Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          {activeTokens.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Key className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p>No active tokens</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTokens.map((token) => (
                <div
                  key={token.id}
                  className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold text-white">{token.token_name}</h4>
                        <Badge className="bg-green-500/20 text-green-400">
                          <Activity className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-500">Prefix</p>
                          <p className="text-white font-mono">{token.token_prefix}...</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Usage Count</p>
                          <p className="text-white">{token.usage_count || 0} calls</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Last Used</p>
                          <p className="text-white">
                            {DateUtils.safeRelativeTime(token.last_used_at, 'Never')}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Expires</p>
                          <p className="text-white">
                            {DateUtils.safeFormatDate(token.expires_at, 'N/A')}
                          </p>
                        </div>
                      </div>

                      {token.allowed_ips && token.allowed_ips.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-slate-500 mb-1">IP Whitelist:</p>
                          <div className="flex gap-2 flex-wrap">
                            {token.allowed_ips.map((ip, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {ip}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {token.allowed_devices && token.allowed_devices.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-slate-500 mb-1">Device Whitelist:</p>
                          <div className="flex gap-2 flex-wrap">
                            {token.allowed_devices.map((deviceId, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {devices.find(d => d.id === deviceId)?.display_name || deviceId}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRevokeTarget(token)}
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Token Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Create Agent Token</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white">Token Name</Label>
              <Input
                value={newToken.token_name}
                onChange={(e) => setNewToken({...newToken, token_name: e.target.value})}
                placeholder="Production Agent Token"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <Label className="text-white">Expires In (Days)</Label>
              <Select 
                value={newToken.expires_in_days.toString()} 
                onValueChange={(val) => setNewToken({...newToken, expires_in_days: parseInt(val)})}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">365 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white">IP Whitelist (Optional)</Label>
              <Input
                value={newToken.allowed_ips}
                onChange={(e) => setNewToken({...newToken, allowed_ips: e.target.value})}
                placeholder="192.168.1.1, 10.0.0.5 (comma-separated)"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <Label className="text-white">Allowed Devices (Optional)</Label>
              <Select 
                value={newToken.allowed_devices[0] || 'all'}
                onValueChange={(val) => {
                  if (val === 'all') {
                    setNewToken({...newToken, allowed_devices: []});
                  } else {
                    setNewToken({...newToken, allowed_devices: [val]});
                  }
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="All devices" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="all">All devices</SelectItem>
                  {devices.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createTokenMutation.mutate()}
              disabled={!newToken.token_name || createTokenMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createTokenMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Token'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Token Created Dialog */}
      <Dialog open={!!newTokenData} onOpenChange={() => setNewTokenData(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>🔑 Token Created Successfully</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-yellow-200 text-sm font-semibold mb-2">
                ⚠️ Save this token now - it won't be shown again!
              </p>
              <p className="text-yellow-300/80 text-xs">
                Store it securely in your agent configuration or password manager.
              </p>
            </div>

            <div>
              <Label className="text-white mb-2 block">Token</Label>
              <div className="relative">
                <Input
                  value={newTokenData?.plain_token || ''}
                  readOnly
                  type={showToken ? 'text' : 'password'}
                  className="bg-slate-800 border-slate-700 text-white font-mono pr-20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowToken(!showToken)}
                    className="h-8 w-8"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(newTokenData?.plain_token)}
                    className="h-8 w-8"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="text-sm text-slate-400 space-y-1">
              <p><strong className="text-white">Name:</strong> {newTokenData?.token_name}</p>
              <p><strong className="text-white">Expires:</strong> {DateUtils.safeFormatDate(newTokenData?.expires_at)}</p>
              <p><strong className="text-white">Permissions:</strong> ingest_result, heartbeat</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setNewTokenData(null)} className="bg-blue-600 hover:bg-blue-700">
              I've Saved the Token
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Token?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will immediately invalidate token "{revokeTarget?.token_name}". Any agents using this token will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && revokeTokenMutation.mutate(revokeTarget.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Revoke Token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}