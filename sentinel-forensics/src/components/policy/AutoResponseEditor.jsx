import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Zap } from 'lucide-react';

export default function AutoResponseEditor({ rules, onChange }) {
  const addRule = () => {
    onChange([...rules, {
      enabled: true,
      trigger_event: 'CRITICAL_ALERT',
      conditions: { min_severity: 'critical', min_confidence: 80, cooldown_minutes: 30 },
      actions: { isolate_device: false, notify_admin: true, create_case: false, capture_triage_bundle: true },
      approval_required: true,
      rate_limit: 1
    }]);
  };

  const updateRule = (idx, updates) => {
    const updated = [...rules];
    updated[idx] = { ...updated[idx], ...updates };
    onChange(updated);
  };

  const deleteRule = (idx) => {
    onChange(rules.filter((_, i) => i !== idx));
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Auto-Response Rules
          </CardTitle>
          <Button size="sm" onClick={addRule} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Rule
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            No auto-response rules defined. Click "Add Rule" to create one.
          </p>
        ) : (
          rules.map((rule, idx) => (
            <div key={idx} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) => updateRule(idx, { enabled: checked })}
                  />
                  <Label className="text-white">Rule {idx + 1}</Label>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteRule(idx)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-400">Trigger Event</Label>
                  <Select
                    value={rule.trigger_event}
                    onValueChange={(value) => updateRule(idx, { trigger_event: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CRITICAL_ALERT">Critical Alert</SelectItem>
                      <SelectItem value="MALWARE_CONFIRMED">Malware Confirmed</SelectItem>
                      <SelectItem value="PERSISTENCE_DETECTED">Persistence Detected</SelectItem>
                      <SelectItem value="USB_VIOLATION">USB Violation</SelectItem>
                      <SelectItem value="FIREWALL_TAMPER">Firewall Tamper</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-400">Min Confidence (%)</Label>
                  <Input
                    type="number"
                    value={rule.conditions?.min_confidence || 80}
                    onChange={(e) => updateRule(idx, {
                      conditions: { ...rule.conditions, min_confidence: parseInt(e.target.value) }
                    })}
                    className="bg-slate-800 border-slate-700 text-white mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-400 mb-2 block">Actions</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.actions?.isolate_device}
                      onCheckedChange={(checked) => updateRule(idx, {
                        actions: { ...rule.actions, isolate_device: checked }
                      })}
                    />
                    <Label className="text-white text-sm">Isolate Device</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.actions?.notify_admin}
                      onCheckedChange={(checked) => updateRule(idx, {
                        actions: { ...rule.actions, notify_admin: checked }
                      })}
                    />
                    <Label className="text-white text-sm">Notify Admin</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.actions?.create_case}
                      onCheckedChange={(checked) => updateRule(idx, {
                        actions: { ...rule.actions, create_case: checked }
                      })}
                    />
                    <Label className="text-white text-sm">Create Case</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.actions?.capture_triage_bundle}
                      onCheckedChange={(checked) => updateRule(idx, {
                        actions: { ...rule.actions, capture_triage_bundle: checked }
                      })}
                    />
                    <Label className="text-white text-sm">Capture Triage</Label>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={rule.approval_required}
                  onCheckedChange={(checked) => updateRule(idx, { approval_required: checked })}
                />
                <Label className="text-white text-sm">Require Admin Approval</Label>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}