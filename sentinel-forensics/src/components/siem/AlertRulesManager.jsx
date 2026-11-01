import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Shield, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AlertRulesManager({ rules }) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    rule_name: '',
    description: '',
    severity: 'medium',
    rule_type: 'pattern_match',
    conditions: {
      source_types: [],
      event_types: [],
      field_matches: []
    },
    actions: [
      {
        action_type: 'create_alert',
        action_config: {}
      }
    ]
  });

  const queryClient = useQueryClient();

  const createRuleMutation = useMutation({
    mutationFn: async () => {
      const ruleId = `RULE-${Date.now()}`;
      
      return await base44.entities.SIEMAlertRule.create({
        rule_id: ruleId,
        ...newRule,
        enabled: true,
        match_count: 0,
        alert_count: 0
      });
    },
    onSuccess: () => {
      toast.success('Alert rule created');
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setCreateDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Failed to create rule', { description: error.message });
    }
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ ruleId, enabled }) => {
      return await base44.entities.SIEMAlertRule.update(ruleId, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
    }
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId) => {
      return await base44.entities.SIEMAlertRule.delete(ruleId);
    },
    onSuccess: () => {
      toast.success('Alert rule deleted');
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
    }
  });

  const addFieldMatch = () => {
    setNewRule({
      ...newRule,
      conditions: {
        ...newRule.conditions,
        field_matches: [
          ...(newRule.conditions.field_matches || []),
          { field: 'source_ip', operator: 'equals', value: '' }
        ]
      }
    });
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="w-5 h-5 text-yellow-400" />
            Alert Rules
          </CardTitle>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                <Plus className="w-4 h-4 mr-2" />
                New Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Alert Rule</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Rule Name</Label>
                  <Input
                    value={newRule.rule_name}
                    onChange={(e) => setNewRule({ ...newRule, rule_name: e.target.value })}
                    placeholder="e.g., Failed Login Attempts"
                    className="bg-slate-800 border-slate-700 text-white"
                    style={{ fontSize: '16px' }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={newRule.description}
                    onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                    placeholder="Describe what this rule detects..."
                    className="bg-slate-800 border-slate-700 text-white"
                    style={{ fontSize: '16px' }}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Severity</Label>
                    <Select 
                      value={newRule.severity} 
                      onValueChange={(value) => setNewRule({ ...newRule, severity: value })}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Rule Type</Label>
                    <Select 
                      value={newRule.rule_type} 
                      onValueChange={(value) => setNewRule({ ...newRule, rule_type: value })}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="pattern_match">Pattern Match</SelectItem>
                        <SelectItem value="threshold">Threshold</SelectItem>
                        <SelectItem value="anomaly">Anomaly Detection</SelectItem>
                        <SelectItem value="correlation">Correlation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Field Conditions</Label>
                    <Button
                      type="button"
                      size="sm"
                      onClick={addFieldMatch}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Condition
                    </Button>
                  </div>

                  {newRule.conditions.field_matches?.map((match, idx) => (
                    <div key={idx} className="grid grid-cols-3 gap-2">
                      <Input
                        value={match.field}
                        onChange={(e) => {
                          const updated = [...newRule.conditions.field_matches];
                          updated[idx].field = e.target.value;
                          setNewRule({
                            ...newRule,
                            conditions: { ...newRule.conditions, field_matches: updated }
                          });
                        }}
                        placeholder="Field name"
                        className="bg-slate-800 border-slate-700 text-white"
                        style={{ fontSize: '16px' }}
                      />
                      <Select
                        value={match.operator}
                        onValueChange={(value) => {
                          const updated = [...newRule.conditions.field_matches];
                          updated[idx].operator = value;
                          setNewRule({
                            ...newRule,
                            conditions: { ...newRule.conditions, field_matches: updated }
                          });
                        }}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="equals">Equals</SelectItem>
                          <SelectItem value="contains">Contains</SelectItem>
                          <SelectItem value="regex">Regex</SelectItem>
                          <SelectItem value="gt">Greater Than</SelectItem>
                          <SelectItem value="lt">Less Than</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={match.value}
                        onChange={(e) => {
                          const updated = [...newRule.conditions.field_matches];
                          updated[idx].value = e.target.value;
                          setNewRule({
                            ...newRule,
                            conditions: { ...newRule.conditions, field_matches: updated }
                          });
                        }}
                        placeholder="Value"
                        className="bg-slate-800 border-slate-700 text-white"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  ))}
                </div>

                <Button
                  onClick={() => createRuleMutation.mutate()}
                  disabled={!newRule.rule_name || createRuleMutation.isPending}
                  className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Create Alert Rule
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No alert rules configured</p>
            <p className="text-xs text-slate-500 mt-2">Create rules to detect security incidents</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="p-4 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-white">{rule.rule_name}</h3>
                      <Badge variant="outline" className={
                        rule.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                        rule.severity === 'high' ? 'bg-orange-500/20 text-orange-300' :
                        rule.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-blue-500/20 text-blue-300'
                      }>
                        {rule.severity.toUpperCase()}
                      </Badge>
                      <Badge className="bg-purple-500/20 text-purple-300">
                        {rule.rule_type}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-slate-400 mb-3">{rule.description}</p>
                    
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>Matched: {rule.match_count || 0}</span>
                      <span>Alerts: {rule.alert_count || 0}</span>
                      {rule.last_matched && (
                        <span>Last: {formatTimeAgo(rule.last_matched)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(enabled) => 
                        toggleRuleMutation.mutate({ ruleId: rule.id, enabled })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRuleMutation.mutate(rule.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}