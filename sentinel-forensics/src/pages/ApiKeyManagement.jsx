import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Key, Plus, Copy, Eye, Power, RotateCw, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const AVAILABLE_SCOPES = [
  { value: 'cases:read', label: 'Read Cases' },
  { value: 'cases:write', label: 'Write Cases' },
  { value: 'evidence:read', label: 'Read Evidence' },
  { value: 'evidence:write', label: 'Write Evidence' },
  { value: 'analytics:run', label: 'Run Analytics' },
  { value: 'analytics:read', label: 'Read Analytics' },
  { value: 'enrichment:run', label: 'Run Enrichment' },
  { value: 'enrichment:read', label: 'Read Enrichment' },
  { value: 'reports:read', label: 'Read Reports' },
  { value: 'reports:write', label: 'Write Reports' }
];

export default function ApiKeyManagement() {
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [newKeyData, setNewKeyData] = React.useState(null);
  const [selectedKeyUsage, setSelectedKeyUsage] = React.useState(null);
  const queryClient = useQueryClient();

  const { data: keys = [] } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('listApiKeys');
      return data.keys;
    }
  });

  const { data: usageLogs = [] } = useQuery({
    queryKey: ['api-key-usage', selectedKeyUsage],
    queryFn: async () => {
      if (!selectedKeyUsage) return [];
      const { data } = await base44.functions.invoke('getApiKeyUsage', {
        apiKeyId: selectedKeyUsage
      });
      return data.logs;
    },
    enabled: !!selectedKeyUsage
  });

  const createMutation = useMutation({
    mutationFn: async (keyData) => {
      const { data } = await base44.functions.invoke('createApiKey', keyData);
      return data;
    },
    onSuccess: (data) => {
      setNewKeyData(data);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key created');
    }
  });

  const revokeMutation = useMutation({
    mutationFn: async (apiKeyId) => {
      await base44.functions.invoke('revokeApiKey', { apiKeyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked');
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ apiKeyId, enable }) => {
      await base44.functions.invoke('toggleApiKey', { apiKeyId, enable });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key status updated');
    }
  });

  const rotateMutation = useMutation({
    mutationFn: async (apiKeyId) => {
      const { data } = await base44.functions.invoke('rotateApiKey', { apiKeyId });
      return data;
    },
    onSuccess: (data) => {
      setNewKeyData(data);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key rotated');
    }
  });

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      revoked: 'bg-red-500/20 text-red-400 border-red-500/30',
      expired: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      disabled: 'bg-slate-500/20 text-slate-400 border-slate-500/30'
    };
    return colors[status] || colors.disabled;
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">API Key Management</h1>
            <p className="text-slate-400">Secure programmatic access to Sentinel Forensics</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="bg-[#EF4444] hover:bg-[#DC2626]">
            <Plus className="w-4 h-4 mr-2" />
            Create API Key
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Key className="w-8 h-8 text-[#EF4444]" />
                <div>
                  <p className="text-2xl font-bold text-white">{keys.filter(k => k.status === 'active').length}</p>
                  <p className="text-sm text-slate-400">Active Keys</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Keys Table */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">API Keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {keys.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No API keys yet. Create one to get started.</p>
              ) : (
                keys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Key className="w-4 h-4 text-[#EF4444]" />
                        <span className="text-white font-medium">{key.name}</span>
                        <Badge className={getStatusColor(key.status)}>{key.status}</Badge>
                        <code className="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded">
                          {key.key_prefix}...
                        </code>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span>Scopes: {key.scopes.length}</span>
                        <span>Rate: {key.rate_limit.requests_per_minute}/min</span>
                        {key.last_used_at && (
                          <span>Last used: {format(new Date(key.last_used_at), 'MMM d, HH:mm')}</span>
                        )}
                        {key.expires_at && (
                          <span>Expires: {format(new Date(key.expires_at), 'MMM d, yyyy')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedKeyUsage(key.id)}
                      >
                        <Activity className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMutation.mutate({ apiKeyId: key.id, enable: key.status !== 'active' })}
                        disabled={key.status === 'revoked'}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => rotateMutation.mutate(key.id)}
                        disabled={key.status === 'revoked'}
                      >
                        <RotateCw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeMutation.mutate(key.id)}
                        disabled={key.status === 'revoked'}
                        className="text-red-400"
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Create Modal */}
        <CreateKeyModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={(data) => createMutation.mutate(data)}
        />

        {/* New Key Display Modal */}
        {newKeyData && (
          <NewKeyModal
            keyData={newKeyData}
            onClose={() => setNewKeyData(null)}
          />
        )}

        {/* Usage Drawer */}
        {selectedKeyUsage && (
          <UsageDrawer
            logs={usageLogs}
            onClose={() => setSelectedKeyUsage(null)}
          />
        )}
      </div>
    </div>
  );
}

function CreateKeyModal({ open, onClose, onCreate }) {
  const [formData, setFormData] = React.useState({
    name: '',
    scopes: [],
    requestsPerMinute: 60,
    burst: 100,
    notes: ''
  });

  const handleSubmit = () => {
    onCreate({
      name: formData.name,
      scopes: formData.scopes,
      rateLimit: {
        requests_per_minute: formData.requestsPerMinute,
        burst: formData.burst
      },
      notes: formData.notes
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium text-slate-300">Key Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Production API Key"
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-300">Scopes</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {AVAILABLE_SCOPES.map(scope => (
                <label key={scope.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.scopes.includes(scope.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, scopes: [...formData.scopes, scope.value] });
                      } else {
                        setFormData({ ...formData, scopes: formData.scopes.filter(s => s !== scope.value) });
                      }
                    }}
                  />
                  <span className="text-slate-300">{scope.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-300">Requests/Min</label>
              <Input
                type="number"
                value={formData.requestsPerMinute}
                onChange={(e) => setFormData({ ...formData, requestsPerMinute: parseInt(e.target.value) })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Burst</label>
              <Input
                type="number"
                value={formData.burst}
                onChange={(e) => setFormData({ ...formData, burst: parseInt(e.target.value) })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-300">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes..."
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <Button onClick={handleSubmit} className="w-full bg-[#EF4444] hover:bg-[#DC2626]">
            Create Key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewKeyModal({ keyData, onClose }) {
  const [copied, setCopied] = React.useState(false);

  const copyKey = () => {
    navigator.clipboard.writeText(keyData.secretKey);
    setCopied(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            API Key Created
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <p className="text-sm text-orange-400 font-medium mb-2">⚠️ Save this key now!</p>
            <p className="text-xs text-slate-400">
              This is the only time you'll see this key. Store it securely.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-300">Secret Key</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 p-3 bg-slate-800 rounded border border-slate-700 text-sm font-mono text-white break-all">
                {keyData.secretKey}
              </code>
              <Button onClick={copyKey} size="sm" variant="outline">
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Name</p>
              <p className="text-white">{keyData.name}</p>
            </div>
            <div>
              <p className="text-slate-400">Key Prefix</p>
              <code className="text-white">{keyData.keyPrefix}...</code>
            </div>
          </div>

          <Button onClick={onClose} className="w-full bg-[#EF4444] hover:bg-[#DC2626]">
            I've Saved the Key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UsageDrawer({ logs, onClose }) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API Key Usage Logs</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-4">
          {logs.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No usage logs yet</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={
                      log.status_code < 300 ? 'bg-green-500/20 text-green-400' :
                      log.status_code < 400 ? 'bg-blue-500/20 text-blue-400' :
                      log.status_code < 500 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-red-500/20 text-red-400'
                    }>
                      {log.status_code}
                    </Badge>
                    <Badge className="bg-slate-500/20 text-slate-400">{log.method}</Badge>
                    <code className="text-xs text-white">{log.path}</code>
                  </div>
                  <span className="text-xs text-slate-400">{log.latency_ms}ms</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>Auth: {log.auth_result}</span>
                  <span>Rate Limit: {log.rate_limit_action}</span>
                  {log.scope_checked && <span>Scope: {log.scope_checked}</span>}
                  <span>{format(new Date(log.created_date), 'MMM d, HH:mm:ss')}</span>
                </div>
                {log.error_message && (
                  <p className="text-xs text-red-400 mt-1">{log.error_message}</p>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}