import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, MoveUp, MoveDown, Save } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function PlaybookBuilder({ playbook, onSave, onCancel }) {
  const { data: user } = useUser();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    enabled: true,
    trigger: {
      type: 'alert_created',
      conditions: {
        severity: [],
        alert_types: [],
        threat_score_min: 0
      }
    },
    actions: []
  });

  useEffect(() => {
    if (playbook) {
      setFormData({
        name: playbook.name || '',
        description: playbook.description || '',
        enabled: playbook.enabled ?? true,
        trigger: playbook.trigger || { type: 'alert_created', conditions: {} },
        actions: playbook.actions || []
      });
    }
  }, [playbook]);

  const addAction = () => {
    setFormData(prev => ({
      ...prev,
      actions: [
        ...prev.actions,
        {
          type: 'send_notification',
          parameters: {},
          order: prev.actions.length
        }
      ]
    }));
  };

  const removeAction = (index) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index).map((action, i) => ({ ...action, order: i }))
    }));
  };

  const moveAction = (index, direction) => {
    const newActions = [...formData.actions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newActions.length) return;
    [newActions[index], newActions[targetIndex]] = [newActions[targetIndex], newActions[index]];
    newActions.forEach((action, i) => action.order = i);
    setFormData(prev => ({ ...prev, actions: newActions }));
  };

  const updateAction = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.map((action, i) =>
        i === index ? { ...action, [field]: value } : action
      )
    }));
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Please provide a playbook name');
      return;
    }
    if (formData.actions.length === 0) {
      toast.error('Please add at least one action');
      return;
    }

    try {
      const data = {
        ...formData,
        organization_id: user.organization_id
      };

      if (playbook) {
        await base44.entities.AutomatedPlaybook.update(playbook.id, data);
        toast.success('Playbook updated successfully');
      } else {
        await base44.entities.AutomatedPlaybook.create(data);
        toast.success('Playbook created successfully');
      }
      onSave();
    } catch (error) {
      toast.error('Failed to save playbook');
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label className="text-white">Playbook Name</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., High Severity Alert Response"
            className="bg-slate-800 border-slate-700 text-white mt-1"
          />
        </div>

        <div>
          <Label className="text-white">Description</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Describe what this playbook does..."
            className="bg-slate-800 border-slate-700 text-white mt-1"
            rows={3}
          />
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">Trigger Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-white">Trigger Type</Label>
            <Select
              value={formData.trigger.type}
              onValueChange={(value) => setFormData(prev => ({
                ...prev,
                trigger: { ...prev.trigger, type: value }
              }))}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="alert_created" className="text-white">Alert Created</SelectItem>
                <SelectItem value="alert_severity" className="text-white">Alert Severity</SelectItem>
                <SelectItem value="device_compromised" className="text-white">Device Compromised</SelectItem>
                <SelectItem value="threat_detected" className="text-white">Threat Detected</SelectItem>
                <SelectItem value="manual" className="text-white">Manual Trigger</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(formData.trigger.type === 'alert_created' || formData.trigger.type === 'alert_severity') && (
            <div>
              <Label className="text-white mb-2 block">Severity Levels</Label>
              <div className="space-y-2">
                {['critical', 'high', 'medium', 'low', 'info'].map(severity => (
                  <div key={severity} className="flex items-center gap-2">
                    <Checkbox
                      checked={formData.trigger.conditions.severity?.includes(severity)}
                      onCheckedChange={(checked) => {
                        const current = formData.trigger.conditions.severity || [];
                        setFormData(prev => ({
                          ...prev,
                          trigger: {
                            ...prev.trigger,
                            conditions: {
                              ...prev.trigger.conditions,
                              severity: checked
                                ? [...current, severity]
                                : current.filter(s => s !== severity)
                            }
                          }
                        }));
                      }}
                      className="border-slate-600"
                    />
                    <Label className="text-white capitalize">{severity}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {formData.trigger.type === 'threat_detected' && (
            <div>
              <Label className="text-white">Minimum Threat Score</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={formData.trigger.conditions.threat_score_min || 0}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  trigger: {
                    ...prev.trigger,
                    conditions: {
                      ...prev.trigger.conditions,
                      threat_score_min: parseInt(e.target.value) || 0
                    }
                  }
                }))}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white text-lg">Actions</CardTitle>
          <Button onClick={addAction} size="sm" className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-1" />
            Add Action
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.actions.map((action, index) => (
            <Card key={index} className="bg-slate-900/50 border-slate-700">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">Action {index + 1}</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveAction(index, 'up')}
                      disabled={index === 0}
                      className="text-slate-400"
                    >
                      <MoveUp className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveAction(index, 'down')}
                      disabled={index === formData.actions.length - 1}
                      className="text-slate-400"
                    >
                      <MoveDown className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeAction(index)}
                      className="text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-white">Action Type</Label>
                  <Select
                    value={action.type}
                    onValueChange={(value) => updateAction(index, 'type', value)}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="isolate_device" className="text-white">Isolate Device</SelectItem>
                      <SelectItem value="block_ip" className="text-white">Block IP Address</SelectItem>
                      <SelectItem value="create_case" className="text-white">Create Case</SelectItem>
                      <SelectItem value="send_notification" className="text-white">Send Notification</SelectItem>
                      <SelectItem value="quarantine_evidence" className="text-white">Quarantine Evidence</SelectItem>
                      <SelectItem value="run_scan" className="text-white">Run Security Scan</SelectItem>
                      <SelectItem value="update_alert_status" className="text-white">Update Alert Status</SelectItem>
                      <SelectItem value="assign_to_user" className="text-white">Assign to User</SelectItem>
                      <SelectItem value="tag_evidence" className="text-white">Tag Evidence</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {action.type === 'send_notification' && (
                  <div>
                    <Label className="text-white">Message</Label>
                    <Input
                      value={action.parameters?.message || ''}
                      onChange={(e) => updateAction(index, 'parameters', { ...action.parameters, message: e.target.value })}
                      placeholder="Notification message"
                      className="bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                )}

                {action.type === 'create_case' && (
                  <div>
                    <Label className="text-white">Case Title</Label>
                    <Input
                      value={action.parameters?.title || ''}
                      onChange={(e) => updateAction(index, 'parameters', { ...action.parameters, title: e.target.value })}
                      placeholder="Auto-generated case title"
                      className="bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                )}

                {action.type === 'update_alert_status' && (
                  <div>
                    <Label className="text-white">New Status</Label>
                    <Select
                      value={action.parameters?.status || ''}
                      onValueChange={(value) => updateAction(index, 'parameters', { ...action.parameters, status: value })}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="investigating" className="text-white">Investigating</SelectItem>
                        <SelectItem value="confirmed" className="text-white">Confirmed</SelectItem>
                        <SelectItem value="resolved" className="text-white">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {formData.actions.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No actions defined. Click "Add Action" to start building your workflow.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button onClick={onCancel} variant="outline" className="border-slate-700 text-white">
          Cancel
        </Button>
        <Button onClick={handleSave} className="bg-red-600 hover:bg-red-700">
          <Save className="w-4 h-4 mr-2" />
          {playbook ? 'Update' : 'Create'} Playbook
        </Button>
      </div>
    </div>
  );
}