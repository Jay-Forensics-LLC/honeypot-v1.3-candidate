import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus,
  Trash2,
  Bell,
  Mail,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function AlertRulesManager() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    rule_name: '',
    severity: 'high',
    event_types: [],
    require_ioc: false,
    send_email: true,
    send_ui: true,
    threshold_count: 1,
    threshold_window: 5
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => base44.entities.SIEMAlertRule.list('-created_date', 100),
    staleTime: 30000
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.SIEMAlertRule.create({
        rule_id: `RULE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        rule_name: data.rule_name,
        rule_type: 'threshold',
        severity: data.severity,
        enabled: true,
        conditions: {
          source_types: ['endpoint_agent', 'network_device'],
          event_types: data.event_types.length > 0 ? data.event_types : undefined,
          field_matches: data.require_ioc ? [
            { field: 'threat_indicators', operator: 'gte', value: '1' }
          ] : [],
          threshold: {
            count: data.threshold_count,
            time_window_minutes: data.threshold_window
          }
        },
        actions: [
          data.send_email && {
            action_type: 'send_email',
            action_config: { recipient: data.email_recipient }
          },
          data.send_ui && {
            action_type: 'create_alert',
            action_config: {}
          }
        ].filter(Boolean),
        suppression: {
          enabled: true,
          time_window_minutes: 60,
          max_alerts_per_window: 5
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setCreateOpen(false);
      setEditingRule(null);
      resetForm();
      toast.success('Alert rule created');
    },
    onError: (error) => {
      toast.error('Failed to create rule', { description: error.message });
    }
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, enabled }) => {
      return await base44.entities.SIEMAlertRule.update(id, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Rule updated');
    }
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.SIEMAlertRule.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Rule deleted');
    }
  });

  const resetForm = () => {
    setFormData({
      rule_name: '',
      severity: 'high',
      event_types: [],
      require_ioc: false,
      send_email: true,
      send_ui: true,
      threshold_count: 1,
      threshold_window: 5
    });
  };

  const handleSubmit = () => {
    if (!formData.rule_name) {
      toast.error('Rule name is required');
      return;
    }

    createRuleMutation.mutate(formData);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Alert Rules</h3>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400" />
        </div>
      ) : rules.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-8 text-center">
            <Bell className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No alert rules configured</p>
            <Button onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Create First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-white">{rule.rule_name}</h4>
                      <Badge className={
                        rule.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        rule.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }>
                        {rule.severity}
                      </Badge>
                      {rule.enabled ? (
                        <Badge className="bg-green-500/20 text-green-400">Active</Badge>
                      ) : (
                        <Badge className="bg-slate-500/20 text-slate-400">Disabled</Badge>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 space-y-1">
                      <p>Type: {rule.rule_type}</p>
                      <p>Matches: {rule.match_count || 0} | Alerts: {rule.alert_count || 0}</p>
                      {rule.conditions?.event_types && (
                        <p>Event Types: {rule.conditions.event_types.join(', ')}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(enabled) => 
                        toggleRuleMutation.mutate({ id: rule.id, enabled })
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteRuleMutation.mutate(rule.id)}
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Alert Rule</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-white">Rule Name</Label>
              <Input
                value={formData.rule_name}
                onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
                placeholder="e.g., Critical Events with IOC Match"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <Label className="text-white">Minimum Severity</Label>
              <Select
                value={formData.severity}
                onValueChange={(value) => setFormData({ ...formData, severity: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">Require IOC Match</p>
                <p className="text-xs text-slate-400">Only alert if event has threat indicator matches</p>
              </div>
              <Switch
                checked={formData.require_ioc}
                onCheckedChange={(checked) => setFormData({ ...formData, require_ioc: checked })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white">Threshold Count</Label>
                <Input
                  type="number"
                  value={formData.threshold_count}
                  onChange={(e) => setFormData({ ...formData, threshold_count: parseInt(e.target.value) })}
                  className="bg-slate-800 border-slate-700 text-white"
                  min="1"
                />
              </div>
              <div>
                <Label className="text-white">Time Window (minutes)</Label>
                <Input
                  type="number"
                  value={formData.threshold_window}
                  onChange={(e) => setFormData({ ...formData, threshold_window: parseInt(e.target.value) })}
                  className="bg-slate-800 border-slate-700 text-white"
                  min="1"
                />
              </div>
            </div>

            <div className="space-y-3 p-4 bg-slate-800/50 rounded-lg">
              <p className="text-sm font-medium text-white">Notification Channels</p>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-white">UI Toast Notifications</span>
                </div>
                <Switch
                  checked={formData.send_ui}
                  onCheckedChange={(checked) => setFormData({ ...formData, send_ui: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-white">Email Alerts (Simulated)</span>
                </div>
                <Switch
                  checked={formData.send_email}
                  onCheckedChange={(checked) => setFormData({ ...formData, send_email: checked })}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setCreateOpen(false)}
                variant="outline"
                className="flex-1 border-slate-700 text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createRuleMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {createRuleMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Rule'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}