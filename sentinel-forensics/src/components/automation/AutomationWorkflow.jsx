import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Zap, 
  Play,
  Settings,
  AlertTriangle,
  Shield,
  Lock,
  Database,
  Activity
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AutomationWorkflow() {
  const [ruleName, setRuleName] = useState("");
  const [ruleType, setRuleType] = useState("incident_response");
  const [severityThreshold, setSeverityThreshold] = useState("high");
  const queryClient = useQueryClient();

  const { data: rules = [] } = useQuery({
    queryKey: ['automation-rules'],
    queryFn: () => base44.entities.AutomationRule.list('-priority'),
  });

  const createRuleMutation = useMutation({
    mutationFn: (ruleData) => base44.entities.AutomationRule.create(ruleData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AutomationRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
    },
  });

  const handleCreateRule = async () => {
    if (!ruleName) return;

    const ruleTemplates = {
      incident_response: {
        actions: [
          { action_type: 'isolate_device', parameters: {}, execution_order: 1 },
          { action_type: 'collect_evidence', parameters: {}, execution_order: 2 },
          { action_type: 'notify_team', parameters: { channels: ['email', 'sms'] }, execution_order: 3 },
          { action_type: 'create_case', parameters: {}, execution_order: 4 }
        ]
      },
      threat_mitigation: {
        actions: [
          { action_type: 'block_ip', parameters: {}, execution_order: 1 },
          { action_type: 'update_firewall', parameters: {}, execution_order: 2 },
          { action_type: 'scan_network', parameters: {}, execution_order: 3 }
        ]
      },
      device_isolation: {
        actions: [
          { action_type: 'disconnect_network', parameters: {}, execution_order: 1 },
          { action_type: 'disable_services', parameters: {}, execution_order: 2 },
          { action_type: 'quarantine', parameters: {}, execution_order: 3 }
        ]
      },
      compliance_check: {
        actions: [
          { action_type: 'run_audit', parameters: {}, execution_order: 1 },
          { action_type: 'generate_report', parameters: {}, execution_order: 2 },
          { action_type: 'apply_fixes', parameters: { auto_remediate: true }, execution_order: 3 }
        ]
      }
    };

    await createRuleMutation.mutateAsync({
      rule_name: ruleName,
      rule_type: ruleType,
      trigger_conditions: {
        event_type: ['alert', 'threat_detected', 'anomaly'],
        severity_threshold: severityThreshold
      },
      actions: ruleTemplates[ruleType].actions,
      priority: severityThreshold === 'critical' ? 10 : severityThreshold === 'high' ? 7 : 5,
      enabled: true,
      notification_settings: {
        notify_on_trigger: true,
        notification_channels: ['email', 'in_app']
      }
    });

    setRuleName("");
  };

  const toggleRule = async (ruleId, currentStatus) => {
    await updateRuleMutation.mutateAsync({
      id: ruleId,
      data: { enabled: !currentStatus }
    });
  };

  const ruleTypeIcons = {
    incident_response: AlertTriangle,
    threat_mitigation: Shield,
    device_isolation: Lock,
    compliance_check: Database,
    evidence_collection: Activity,
    patch_deployment: Settings,
    policy_enforcement: Shield
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Automation Workflows
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Rule Name</Label>
              <Input
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="Auto-Isolate Infected Devices"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Rule Type</Label>
              <Select value={ruleType} onValueChange={setRuleType}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incident_response">Incident Response</SelectItem>
                  <SelectItem value="threat_mitigation">Threat Mitigation</SelectItem>
                  <SelectItem value="device_isolation">Device Isolation</SelectItem>
                  <SelectItem value="compliance_check">Compliance Check</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Severity Threshold</Label>
              <Select value={severityThreshold} onValueChange={setSeverityThreshold}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleCreateRule}
            disabled={!ruleName}
            className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700"
          >
            <Zap className="w-4 h-4 mr-2" />
            Create Automation Rule
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Active Automation Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Settings className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p>No automation rules configured</p>
              <p className="text-sm mt-2">Create rules to automate security responses</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rules.map((rule) => {
                const RuleIcon = ruleTypeIcons[rule.rule_type];
                return (
                  <Card key={rule.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center">
                            <RuleIcon className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-white">{rule.rule_name}</h4>
                            <p className="text-xs text-slate-400">{rule.rule_type.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-purple-500/20 text-purple-400">
                            Priority: {rule.priority}
                          </Badge>
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => toggleRule(rule.id, rule.enabled)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Triggers on: {rule.trigger_conditions?.severity_threshold} severity or above</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Activity className="w-3 h-3" />
                          <span>{rule.actions?.length || 0} automated actions configured</span>
                        </div>
                        {rule.execution_history && rule.execution_history.length > 0 && (
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Play className="w-3 h-3" />
                            <span>Executed {rule.execution_history.length} times</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}