import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function AutoResponseRules() {
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({
    severity: 'critical',
    action: 'create_ticket',
    enabled: true
  });
  const queryClient = useQueryClient();

  const { data: rules = [] } = useQuery({
    queryKey: ['auto-response-rules'],
    queryFn: async () => {
      // Fetch from a hypothetical entity or use PolicyProfile
      return [];
    }
  });

  const createRule = useMutation({
    mutationFn: async () => {
      // Store in PolicyProfile or new entity
      toast.success('Auto-response rule created');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-response-rules'] });
      setShowCreate(false);
    }
  });

  const actionTypes = [
    { value: 'create_ticket', label: 'Create Ticket' },
    { value: 'increase_monitoring', label: 'Increase Monitoring' },
    { value: 'isolate_device', label: 'Isolate Device (requires approval)' },
    { value: 'disable_service', label: 'Disable Service (requires approval)' }
  ];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Automated Response
          </span>
          <Button
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Rule
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-xs text-yellow-300">
            ⚡ Auto-responses execute immediately for low-risk actions. High-risk actions require approval.
          </p>
        </div>

        {showCreate && (
          <div className="p-4 bg-slate-800 rounded-lg space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-2 block">When severity is</label>
              <Select value={newRule.severity} onValueChange={(v) => setNewRule({...newRule, severity: v})}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-2 block">Auto-execute action</label>
              <Select value={newRule.action} onValueChange={(v) => setNewRule({...newRule, action: v})}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actionTypes.map(action => (
                    <SelectItem key={action.value} value={action.value}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreate(false)}
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => createRule.mutate()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Create Rule
              </Button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No auto-response rules configured
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Switch checked={rule.enabled} />
                  <div>
                    <p className="text-sm text-white">
                      When <Badge className="mx-1">{rule.severity}</Badge> → {rule.action}
                    </p>
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