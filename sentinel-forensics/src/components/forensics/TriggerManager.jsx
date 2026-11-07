import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  Zap, 
  Edit, 
  Trash2, 
  Plus, 
  AlertTriangle,
  Shield,
  User,
  Cpu,
  Lock,
  Database,
  CheckCircle
} from 'lucide-react';

const TRIGGER_TYPES = [
  { value: 'threat_detection', label: 'Threat Detection', icon: Shield },
  { value: 'anomaly_threshold', label: 'Anomaly Threshold', icon: AlertTriangle },
  { value: 'user_behavior', label: 'User Behavior', icon: User },
  { value: 'device_compromise', label: 'Device Compromise', icon: Cpu },
  { value: 'vulnerability_exploit', label: 'Vulnerability Exploit', icon: Lock },
  { value: 'data_exfiltration', label: 'Data Exfiltration', icon: Database },
  { value: 'custom', label: 'Custom', icon: Zap }
];

export default function TriggerManager({ triggers }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState(null);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    trigger_name: '',
    trigger_type: 'threat_detection',
    severity_threshold: 'medium',
    is_active: true,
    collection_scope: {
      collect_logs: true,
      collect_network_state: true,
      collect_process_list: true,
      collect_memory_snapshot: false,
      collect_disk_artifacts: false,
      collect_user_activity: true,
      lookback_hours: 24
    },
    ai_analysis_enabled: true,
    storage_locations: ['primary', 'encrypted_vault'],
    auto_create_case: false,
    trigger_conditions: {
      threat_score_min: 70,
      anomaly_score_min: 60
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.ForensicTrigger.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-query', 'ForensicTrigger'] });
      toast.success('Trigger created successfully');
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create trigger', { description: error.message });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }) => {
      return await base44.entities.ForensicTrigger.update(id, { is_active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-query', 'ForensicTrigger'] });
      toast.success('Trigger updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.ForensicTrigger.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-query', 'ForensicTrigger'] });
      toast.success('Trigger deleted');
    }
  });

  const resetForm = () => {
    setFormData({
      trigger_name: '',
      trigger_type: 'threat_detection',
      severity_threshold: 'medium',
      is_active: true,
      collection_scope: {
        collect_logs: true,
        collect_network_state: true,
        collect_process_list: true,
        collect_memory_snapshot: false,
        collect_disk_artifacts: false,
        collect_user_activity: true,
        lookback_hours: 24
      },
      ai_analysis_enabled: true,
      storage_locations: ['primary', 'encrypted_vault'],
      auto_create_case: false,
      trigger_conditions: {
        threat_score_min: 70,
        anomaly_score_min: 60
      }
    });
    setEditingTrigger(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <div className="space-y-4">
      {/* Create Trigger Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Create Trigger
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Forensic Trigger</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Trigger Name</Label>
              <Input
                value={formData.trigger_name}
                onChange={(e) => setFormData({...formData, trigger_name: e.target.value})}
                placeholder="e.g., High Severity Threat"
                className="bg-slate-800 border-slate-700"
                required
              />
            </div>

            <div>
              <Label>Trigger Type</Label>
              <Select value={formData.trigger_type} onValueChange={(v) => setFormData({...formData, trigger_type: v})}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {TRIGGER_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Severity Threshold</Label>
              <Select value={formData.severity_threshold} onValueChange={(v) => setFormData({...formData, severity_threshold: v})}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block">Collection Scope</Label>
              <div className="space-y-2 bg-slate-800 p-4 rounded-lg">
                {Object.entries(formData.collection_scope).map(([key, value]) => (
                  key !== 'lookback_hours' && (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300 capitalize">{key.replace(/_/g, ' ')}</span>
                      <Switch
                        checked={value}
                        onCheckedChange={(checked) => setFormData({
                          ...formData,
                          collection_scope: {...formData.collection_scope, [key]: checked}
                        })}
                      />
                    </div>
                  )
                ))}
                <div className="pt-2">
                  <Label className="text-sm">Lookback Hours</Label>
                  <Input
                    type="number"
                    value={formData.collection_scope.lookback_hours}
                    onChange={(e) => setFormData({
                      ...formData,
                      collection_scope: {...formData.collection_scope, lookback_hours: parseInt(e.target.value)}
                    })}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>AI Analysis</Label>
              <Switch
                checked={formData.ai_analysis_enabled}
                onCheckedChange={(checked) => setFormData({...formData, ai_analysis_enabled: checked})}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Auto-Create Case</Label>
              <Switch
                checked={formData.auto_create_case}
                onCheckedChange={(checked) => setFormData({...formData, auto_create_case: checked})}
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Trigger'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Triggers List */}
      <div className="grid gap-4">
        {triggers && triggers.length > 0 ? (
          triggers.map((trigger) => {
            const TriggerIcon = TRIGGER_TYPES.find(t => t.value === trigger.trigger_type)?.icon || Zap;
            return (
              <Card key={trigger.id} className="bg-slate-900 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        trigger.is_active ? 'bg-blue-500/20' : 'bg-slate-700'
                      }`}>
                        <TriggerIcon className={`w-6 h-6 ${trigger.is_active ? 'text-blue-400' : 'text-slate-500'}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-white">{trigger.trigger_name}</h3>
                          {trigger.is_active ? (
                            <Badge className="bg-green-500/20 text-green-400">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="border-slate-600">Inactive</Badge>
                          )}
                          <Badge variant="outline" className="capitalize border-slate-600">
                            {trigger.severity_threshold}+
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400 mb-3 capitalize">
                          {trigger.trigger_type.replace(/_/g, ' ')}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {trigger.ai_analysis_enabled && (
                            <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-400">
                              AI Analysis
                            </Badge>
                          )}
                          {trigger.auto_create_case && (
                            <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-400">
                              Auto Case
                            </Badge>
                          )}
                          <Badge variant="outline" className="border-slate-600">
                            {trigger.execution_count || 0} executions
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleMutation.mutate({
                          id: trigger.id,
                          is_active: !trigger.is_active
                        })}
                      >
                        {trigger.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(trigger.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-12 text-center">
              <Zap className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">No triggers configured yet</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                Create Your First Trigger
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}