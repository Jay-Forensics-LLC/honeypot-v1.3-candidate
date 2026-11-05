import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Shield } from 'lucide-react';

export default function FirewallEditor({ config, onChange }) {
  const addRule = () => {
    const rules = config?.rules || [];
    onChange({
      ...config,
      rules: [...rules, {
        direction: 'IN',
        protocol: 'TCP',
        ports: '443',
        remote_cidr: '0.0.0.0/0',
        action: 'ALLOW',
        description: ''
      }]
    });
  };

  const updateRule = (idx, updates) => {
    const rules = [...(config?.rules || [])];
    rules[idx] = { ...rules[idx], ...updates };
    onChange({ ...config, rules });
  };

  const deleteRule = (idx) => {
    const rules = (config?.rules || []).filter((_, i) => i !== idx);
    onChange({ ...config, rules });
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Firewall Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label className="text-slate-400">Profile</Label>
            <Select
              value={config?.profile || 'BALANCED'}
              onValueChange={(value) => onChange({ ...config, profile: value })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STRICT">Strict (Deny-by-default)</SelectItem>
                <SelectItem value="BALANCED">Balanced</SelectItem>
                <SelectItem value="CUSTOM">Custom Rules</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-400">Logging Level</Label>
            <Select
              value={config?.logging_level || 'BASIC'}
              onValueChange={(value) => onChange({ ...config, logging_level: value })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OFF">Off</SelectItem>
                <SelectItem value="BASIC">Basic</SelectItem>
                <SelectItem value="VERBOSE">Verbose</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-400">Apply Mode</Label>
            <Select
              value={config?.apply_mode || 'RECOMMEND_ONLY'}
              onValueChange={(value) => onChange({ ...config, apply_mode: value })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RECOMMEND_ONLY">Recommend Only</SelectItem>
                <SelectItem value="ENFORCE">Enforce</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {config?.profile === 'CUSTOM' && (
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <div className="flex items-center justify-between">
              <Label className="text-white">Custom Rules</Label>
              <Button size="sm" onClick={addRule} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Rule
              </Button>
            </div>

            {(config?.rules || []).map((rule, idx) => (
              <div key={idx} className="p-3 bg-slate-900/50 rounded border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-white">Rule {idx + 1}</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteRule(idx)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Select
                    value={rule.direction}
                    onValueChange={(value) => updateRule(idx, { direction: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN">Inbound</SelectItem>
                      <SelectItem value="OUT">Outbound</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={rule.protocol}
                    onValueChange={(value) => updateRule(idx, { protocol: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TCP">TCP</SelectItem>
                      <SelectItem value="UDP">UDP</SelectItem>
                      <SelectItem value="ANY">Any Protocol</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Ports (e.g., 443)"
                    value={rule.ports}
                    onChange={(e) => updateRule(idx, { ports: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />

                  <Input
                    placeholder="Remote CIDR (e.g., 0.0.0.0/0)"
                    value={rule.remote_cidr}
                    onChange={(e) => updateRule(idx, { remote_cidr: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />

                  <Select
                    value={rule.action}
                    onValueChange={(value) => updateRule(idx, { action: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALLOW">Allow</SelectItem>
                      <SelectItem value="DENY">Deny</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Description"
                    value={rule.description}
                    onChange={(e) => updateRule(idx, { description: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}