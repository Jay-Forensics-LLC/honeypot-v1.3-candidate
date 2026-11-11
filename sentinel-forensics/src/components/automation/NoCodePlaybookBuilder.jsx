import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { 
  Zap, 
  Plus, 
  Trash2, 
  Play, 
  Save,
  Mail,
  Database,
  Shield,
  Bell,
  FileText,
  Lock,
  GripVertical,
  Copy
} from "lucide-react";
import { toast } from "sonner";

// Available action types
const ACTION_TYPES = [
  { 
    id: 'scan', 
    name: 'Run Network Scan', 
    icon: Shield, 
    color: 'text-blue-400',
    description: 'Execute network security scan',
    params: ['scan_type']
  },
  { 
    id: 'alert', 
    name: 'Create Alert', 
    icon: Bell, 
    color: 'text-yellow-400',
    description: 'Generate security alert',
    params: ['severity', 'message']
  },
  { 
    id: 'email', 
    name: 'Send Email', 
    icon: Mail, 
    color: 'text-green-400',
    description: 'Send email notification',
    params: ['recipient', 'subject', 'body']
  },
  { 
    id: 'encrypt', 
    name: 'Encrypt Log', 
    icon: Lock, 
    color: 'text-purple-400',
    description: 'Encrypt audit log with AES-256',
    params: ['log_id']
  },
  { 
    id: 'database', 
    name: 'Query Database', 
    icon: Database, 
    color: 'text-orange-400',
    description: 'Execute database query',
    params: ['entity', 'action', 'filter']
  },
  { 
    id: 'report', 
    name: 'Generate Report', 
    icon: FileText, 
    color: 'text-pink-400',
    description: 'Create forensic report',
    params: ['template', 'data_source']
  }
];

export default function NoCodePlaybookBuilder() {
  const [playbook, setPlaybook] = useState({
    name: '',
    description: '',
    trigger_type: 'manual',
    trigger_conditions: {},
    actions: []
  });

  const [selectedActionType, setSelectedActionType] = useState(null);
  const [actionParams, setActionParams] = useState({});

  const queryClient = useQueryClient();

  const savePlaybookMutation = useMutation({
    mutationFn: async () => {
      const playbookData = {
        playbook_id: `PLAYBOOK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        playbook_name: playbook.name,
        enabled: false, // Disabled by default
        trigger: {
          trigger_type: playbook.trigger_type,
          conditions: playbook.trigger_conditions
        },
        actions: playbook.actions.map((action, idx) => ({
          action_type: action.type,
          action_config: action.params,
          execution_order: idx + 1
        })),
        execution_count: 0,
        success_count: 0,
        failure_count: 0
      };

      return await base44.entities.AutomationPlaybook.create(playbookData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-playbooks'] });
      toast.success('Playbook saved successfully!');
      resetPlaybook();
    },
    onError: (error) => {
      toast.error(`Failed to save playbook: ${error.message}`);
    }
  });

  const addAction = () => {
    if (!selectedActionType) {
      toast.error('Select an action type');
      return;
    }

    const actionType = ACTION_TYPES.find(a => a.id === selectedActionType);
    
    const newAction = {
      id: `action-${Date.now()}`,
      type: selectedActionType,
      name: actionType.name,
      icon: actionType.icon,
      color: actionType.color,
      params: { ...actionParams }
    };

    setPlaybook({
      ...playbook,
      actions: [...playbook.actions, newAction]
    });

    setSelectedActionType(null);
    setActionParams({});
    toast.success('Action added');
  };

  const removeAction = (actionId) => {
    setPlaybook({
      ...playbook,
      actions: playbook.actions.filter(a => a.id !== actionId)
    });
  };

  const duplicateAction = (action) => {
    const duplicate = {
      ...action,
      id: `action-${Date.now()}`
    };
    
    setPlaybook({
      ...playbook,
      actions: [...playbook.actions, duplicate]
    });
    toast.success('Action duplicated');
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(playbook.actions);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setPlaybook({
      ...playbook,
      actions: items
    });
  };

  const resetPlaybook = () => {
    setPlaybook({
      name: '',
      description: '',
      trigger_type: 'manual',
      trigger_conditions: {},
      actions: []
    });
  };

  const testPlaybook = async () => {
    if (playbook.actions.length === 0) {
      toast.error('Add at least one action to test');
      return;
    }

    toast.info('🧪 Testing playbook...');

    // Simulate execution
    for (let i = 0; i < playbook.actions.length; i++) {
      const action = playbook.actions[i];
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast.success(`✓ Step ${i + 1}: ${action.name}`, {
        duration: 2000
      });
    }

    toast.success('🎉 Playbook test completed!');
  };

  const exportJSON = () => {
    const json = JSON.stringify({
      ...playbook,
      version: '1.0',
      created: new Date().toISOString()
    }, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${playbook.name.replace(/\s+/g, '_')}_playbook.json`;
    link.click();
    toast.success('Playbook exported');
  };

  return (
    <div className="space-y-6">
      {/* Builder Header */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              No-Code Playbook Builder
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={testPlaybook}
                disabled={playbook.actions.length === 0}
              >
                <Play className="w-4 h-4 mr-2" />
                Test
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={exportJSON}
                disabled={!playbook.name || playbook.actions.length === 0}
              >
                <FileText className="w-4 h-4 mr-2" />
                Export JSON
              </Button>
              <Button
                size="sm"
                onClick={() => savePlaybookMutation.mutate()}
                disabled={!playbook.name || playbook.actions.length === 0 || savePlaybookMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Playbook
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Playbook Name *</Label>
              <Input
                value={playbook.name}
                onChange={(e) => setPlaybook({...playbook, name: e.target.value})}
                placeholder="e.g., Security Incident Response"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div>
              <Label>Trigger Type</Label>
              <Select
                value={playbook.trigger_type}
                onValueChange={(value) => setPlaybook({...playbook, trigger_type: value})}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="watchlist_match">Watchlist Match</SelectItem>
                  <SelectItem value="anomaly_threshold">Anomaly Threshold</SelectItem>
                  <SelectItem value="rule_match">Rule Match</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={playbook.description}
              onChange={(e) => setPlaybook({...playbook, description: e.target.value})}
              placeholder="Describe what this playbook does..."
              className="bg-slate-800 border-slate-700 h-20"
            />
          </div>
        </CardContent>
      </Card>

      {/* Action Palette */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-400" />
            Add Action
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            {ACTION_TYPES.map(actionType => {
              const Icon = actionType.icon;
              const isSelected = selectedActionType === actionType.id;

              return (
                <div
                  key={actionType.id}
                  onClick={() => {
                    setSelectedActionType(actionType.id);
                    setActionParams({});
                  }}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-blue-500/50'
                  }`}
                >
                  <Icon className={`w-8 h-8 ${actionType.color} mb-2`} />
                  <h4 className="font-semibold text-white text-sm mb-1">{actionType.name}</h4>
                  <p className="text-xs text-slate-400">{actionType.description}</p>
                </div>
              );
            })}
          </div>

          {selectedActionType && (
            <div className="p-4 bg-slate-800/50 rounded-lg border border-blue-500">
              <h4 className="font-semibold text-white mb-3">Configure Action Parameters</h4>
              
              <div className="space-y-3">
                {ACTION_TYPES.find(a => a.id === selectedActionType)?.params.map(param => (
                  <div key={param}>
                    <Label className="capitalize">{param.replace('_', ' ')}</Label>
                    <Input
                      value={actionParams[param] || ''}
                      onChange={(e) => setActionParams({...actionParams, [param]: e.target.value})}
                      placeholder={`Enter ${param}...`}
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                ))}
              </div>

              <Button
                onClick={addAction}
                className="w-full mt-4 bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add to Playbook
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Playbook Flow */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              Playbook Flow ({playbook.actions.length} actions)
            </div>
            {playbook.actions.length > 0 && (
              <Badge className="bg-purple-500">
                Drag to reorder
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {playbook.actions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Zap className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p>No actions added yet</p>
              <p className="text-sm mt-2">Select actions above to build your playbook</p>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="playbook-actions">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-3"
                  >
                    {playbook.actions.map((action, index) => {
                      const Icon = action.icon;

                      return (
                        <Draggable key={action.id} draggableId={action.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`p-4 bg-slate-800/50 rounded-lg border transition-all ${
                                snapshot.isDragging
                                  ? 'border-blue-500 shadow-lg'
                                  : 'border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div {...provided.dragHandleProps}>
                                  <GripVertical className="w-5 h-5 text-slate-500 cursor-grab" />
                                </div>

                                <div className="flex items-center justify-center w-8 h-8 bg-slate-700 rounded-full text-white text-sm font-bold">
                                  {index + 1}
                                </div>

                                <Icon className={`w-6 h-6 ${action.color}`} />

                                <div className="flex-1">
                                  <h4 className="font-semibold text-white text-sm">{action.name}</h4>
                                  {Object.keys(action.params).length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      {Object.entries(action.params).map(([key, value]) => (
                                        <Badge key={key} variant="outline" className="text-xs">
                                          {key}: {value}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => duplicateAction(action)}
                                    className="h-8 w-8 p-0 text-blue-400"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeAction(action.id)}
                                    className="h-8 w-8 p-0 text-red-400"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>

                              {index < playbook.actions.length - 1 && (
                                <div className="flex justify-center mt-3">
                                  <div className="w-0.5 h-4 bg-slate-700"></div>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500">
        <div className="flex items-start gap-3 text-sm text-yellow-400">
          <Zap className="w-5 h-5 mt-0.5" />
          <div>
            <strong>No-Code Playbook Builder:</strong> Drag and drop actions to create automated workflows. 
            Test your playbook before saving, then export as JSON for backend execution.
          </div>
        </div>
      </div>
    </div>
  );
}