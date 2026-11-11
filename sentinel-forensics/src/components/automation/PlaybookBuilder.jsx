import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Play,
  Save,
  AlertTriangle
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

const ACTION_TYPES = [
  { value: 'create_alert', label: 'Create Alert', icon: AlertTriangle },
  { value: 'isolate_device', label: 'Isolate Device', icon: AlertTriangle },
  { value: 'collect_evidence', label: 'Collect Evidence', icon: AlertTriangle },
  { value: 'send_notification', label: 'Send Notification', icon: AlertTriangle },
  { value: 'execute_containment', label: 'Execute Containment', icon: AlertTriangle },
  { value: 'create_report', label: 'Generate Report', icon: AlertTriangle },
  { value: 'run_scan', label: 'Run Security Scan', icon: AlertTriangle },
  { value: 'update_entity', label: 'Update Entity', icon: AlertTriangle }
];

export default function PlaybookBuilder({ playbook, onSave, onCancel }) {
  const [name, setName] = useState(playbook?.playbook_name || '');
  const [description, setDescription] = useState(playbook?.description || '');
  const [type, setType] = useState(playbook?.playbook_type || 'incident_response');
  const [steps, setSteps] = useState(playbook?.steps || []);

  const addStep = () => {
    setSteps([
      ...steps,
      {
        step_order: steps.length + 1,
        step_name: `Step ${steps.length + 1}`,
        action_type: 'create_alert',
        action_config: {},
        timeout_seconds: 300,
        continue_on_failure: false
      }
    ]);
  };

  const removeStep = (index) => {
    const newSteps = steps.filter((_, i) => i !== index);
    // Reorder
    newSteps.forEach((step, i) => {
      step.step_order = i + 1;
    });
    setSteps(newSteps);
  };

  const moveStep = (index, direction) => {
    const newSteps = [...steps];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= steps.length) return;
    
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    
    // Reorder
    newSteps.forEach((step, i) => {
      step.step_order = i + 1;
    });
    
    setSteps(newSteps);
  };

  const updateStep = (index, field, value) => {
    const newSteps = [...steps];
    newSteps[index] = {
      ...newSteps[index],
      [field]: value
    };
    setSteps(newSteps);
  };

  const handleSave = () => {
    const playbookData = {
      playbook_name: name,
      description,
      playbook_type: type,
      enabled: true,
      trigger_conditions: playbook?.trigger_conditions || {
        event_types: [],
        severity_threshold: 'medium',
        manual_trigger_enabled: true,
        auto_trigger_enabled: false
      },
      steps,
      rollback_steps: playbook?.rollback_steps || []
    };
    
    onSave(playbookData);
  };

  return (
    <div className="space-y-6">
      {/* Playbook Details */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Playbook Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">Playbook Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Ransomware Response"
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this playbook does..."
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Playbook Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                <SelectItem value="incident_response">Incident Response</SelectItem>
                <SelectItem value="threat_containment">Threat Containment</SelectItem>
                <SelectItem value="surveillance_response">Surveillance Response</SelectItem>
                <SelectItem value="compliance_check">Compliance Check</SelectItem>
                <SelectItem value="data_collection">Data Collection</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Steps Builder */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Automation Steps</CardTitle>
            <Button onClick={addStep} size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Step
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Play className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="mb-4">No steps added yet</p>
              <Button onClick={addStep} className="bg-blue-600 hover:bg-blue-700">
                Add First Step
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {steps.map((step, index) => (
                <Card key={index} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col gap-2">
                        <Badge className="bg-blue-500/20 text-blue-400">
                          {step.step_order}
                        </Badge>
                        <div className="flex flex-col gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => moveStep(index, 'up')}
                            disabled={index === 0}
                            className="h-6 w-6"
                          >
                            <MoveUp className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => moveStep(index, 'down')}
                            disabled={index === steps.length - 1}
                            className="h-6 w-6"
                          >
                            <MoveDown className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex-1 space-y-3">
                        <div className="grid md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-white text-xs">Step Name</Label>
                            <Input
                              value={step.step_name}
                              onChange={(e) => updateStep(index, 'step_name', e.target.value)}
                              className="bg-slate-900 border-slate-700 text-white"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-white text-xs">Action Type</Label>
                            <Select 
                              value={step.action_type} 
                              onValueChange={(value) => updateStep(index, 'action_type', value)}
                            >
                              <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                                {ACTION_TYPES.map(action => (
                                  <SelectItem key={action.value} value={action.value}>
                                    {action.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={step.continue_on_failure}
                              onChange={(e) => updateStep(index, 'continue_on_failure', e.target.checked)}
                              className="rounded border-slate-700"
                            />
                            <Label className="text-white text-xs">Continue on failure</Label>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-white text-xs">Timeout (seconds)</Label>
                            <Input
                              type="number"
                              value={step.timeout_seconds}
                              onChange={(e) => updateStep(index, 'timeout_seconds', parseInt(e.target.value))}
                              className="bg-slate-900 border-slate-700 text-white"
                            />
                          </div>
                        </div>
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeStep(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} className="border-slate-700">
          Cancel
        </Button>
        <Button 
          onClick={handleSave}
          disabled={!name || steps.length === 0}
          className="bg-green-600 hover:bg-green-700"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Playbook
        </Button>
      </div>
    </div>
  );
}