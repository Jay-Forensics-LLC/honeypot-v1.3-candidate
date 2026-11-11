import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";


import { Zap, Settings, Bell, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function AutoResponseEngine() {
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [responseRules, setResponseRules] = useState([]);
  const [throttleMap, setThrottleMap] = useState(new Map());
  
  const queryClient = useQueryClient();

  const { data: detectionRules = [] } = useQuery({
    queryKey: ['detection-rules'],
    queryFn: () => base44.entities.DetectionRule.list(),
    initialData: []
  });

  const { data: observations = [] } = useQuery({
    queryKey: ['observations-live'],
    queryFn: () => base44.entities.Observation.list('-timestamp', 100),
    refetchInterval: engineEnabled ? 3000 : false,
    initialData: []
  });

  // Initialize response rules
  useEffect(() => {
    const defaultRules = detectionRules
      .filter(rule => rule.enabled)
      .map(rule => ({
        rule_id: rule.rule_id,
        rule_name: rule.rule_name,
        trigger_condition: 'rule_match',
        actions: [
          { type: 'create_alert', severity: rule.severity },
          { type: 'log_event', level: 'warning' }
        ],
        cooldown_seconds: 300, // 5 minutes
        max_triggers_per_hour: 10,
        enabled: true,
        last_triggered: null,
        trigger_count: 0
      }));
    
    setResponseRules(defaultRules);
  }, [detectionRules]);

  // Monitor for rule matches
  useEffect(() => {
    if (!engineEnabled) return;

    const checkRuleMatches = async () => {
      for (const obs of observations) {
        // Check if observation matches any rule
        if (obs.rule_matches && obs.rule_matches.length > 0) {
          for (const match of obs.rule_matches) {
            await handleRuleMatch(match.rule_id, obs);
          }
        }

        // Check anomaly threshold
        if (obs.anomaly_score > 70) {
          await handleAnomalyDetection(obs);
        }
      }
    };

    checkRuleMatches();
  }, [observations, engineEnabled]);

  const handleRuleMatch = async (ruleId, observation) => {
    const responseRule = responseRules.find(r => r.rule_id === ruleId);
    if (!responseRule || !responseRule.enabled) return;

    // Check cooldown
    if (isInCooldown(ruleId)) {
      return;
    }

    // Check throttling
    if (isThrottled(ruleId)) {
      toast.warning(`Auto-response throttled for rule: ${responseRule.rule_name}`);
      return;
    }

    // Execute actions
    for (const action of responseRule.actions) {
      await executeAction(action, observation, responseRule);
    }

    // Update throttle map
    updateThrottle(ruleId);
    
    // Set cooldown
    setCooldown(ruleId, responseRule.cooldown_seconds);
  };

  const handleAnomalyDetection = async (observation) => {
    const anomalyRule = {
      rule_id: 'anomaly-auto',
      rule_name: 'Anomaly Auto-Response',
      actions: [
        { type: 'create_alert', severity: 'high' },
        { type: 'send_notification', channel: 'email' }
      ]
    };

    if (!isInCooldown('anomaly-auto')) {
      for (const action of anomalyRule.actions) {
        await executeAction(action, observation, anomalyRule);
      }
      setCooldown('anomaly-auto', 600); // 10 minute cooldown
    }
  };

  const executeAction = async (action, observation, rule) => {
    try {
      switch (action.type) {
        case 'create_alert':
          await base44.entities.Alert.create({
            alert_type: 'automated_response',
            severity: action.severity || 'medium',
            title: `Auto-Response: ${rule.rule_name}`,
            description: `Triggered by observation ${observation.observation_id}`,
            source: rule.rule_name,
            detection_timestamp: new Date().toISOString(),
            status: 'new',
            threat_score: observation.anomaly_score || 50,
            recommended_actions: ['Review detection', 'Verify threat', 'Update rules if false positive']
          });
          break;

        case 'log_event':
          await base44.entities.AuditLog.create({
            event_type: 'auto_response_triggered',
            severity: action.level || 'info',
            description: `Auto-response triggered for rule: ${rule.rule_name}`,
            user_id: 'system',
            success: true,
            metadata: {
              rule_id: rule.rule_id,
              observation_id: observation.observation_id,
              anomaly_score: observation.anomaly_score
            }
          });
          break;

        case 'send_notification':
          // Notification logic here
          toast.info(`🔔 Auto-Response: ${rule.rule_name} triggered`);
          break;

        case 'quarantine':
          // Quarantine logic
          await base44.entities.AuditLog.create({
            event_type: 'device_quarantined',
            severity: 'warning',
            description: `Device quarantined by auto-response: ${rule.rule_name}`,
            user_id: 'system',
            success: true
          });
          break;

        default:
          console.warn(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      console.error(`Failed to execute action ${action.type}:`, error);
      toast.error(`Auto-response action failed: ${action.type}`);
    }
  };

  const isInCooldown = (ruleId) => {
    const cooldown = throttleMap.get(`cooldown-${ruleId}`);
    if (!cooldown) return false;
    return Date.now() < cooldown;
  };

  const setCooldown = (ruleId, seconds) => {
    const cooldownUntil = Date.now() + (seconds * 1000);
    setThrottleMap(new Map(throttleMap.set(`cooldown-${ruleId}`, cooldownUntil)));
  };

  const isThrottled = (ruleId) => {
    const key = `throttle-${ruleId}`;
    const triggers = throttleMap.get(key) || [];
    
    // Clean up old triggers (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentTriggers = triggers.filter(t => t > oneHourAgo);
    
    const responseRule = responseRules.find(r => r.rule_id === ruleId);
    if (!responseRule) return false;

    return recentTriggers.length >= responseRule.max_triggers_per_hour;
  };

  const updateThrottle = (ruleId) => {
    const key = `throttle-${ruleId}`;
    const triggers = throttleMap.get(key) || [];
    triggers.push(Date.now());
    setThrottleMap(new Map(throttleMap.set(key, triggers)));
  };

  const updateResponseRule = (ruleId, updates) => {
    setResponseRules(responseRules.map(rule => 
      rule.rule_id === ruleId ? { ...rule, ...updates } : rule
    ));
  };

  return (
    <div className="space-y-6">
      {/* Engine Control */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Auto-Response Engine
            </div>
            <div className="flex items-center gap-3">
              <Badge className={engineEnabled ? "bg-green-500 animate-pulse" : "bg-slate-700"}>
                {engineEnabled ? 'ACTIVE' : 'PAUSED'}
              </Badge>
              <Switch
                checked={engineEnabled}
                onCheckedChange={setEngineEnabled}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                <span className="text-sm text-slate-400">Active Rules</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {responseRules.filter(r => r.enabled).length}
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="w-5 h-5 text-green-400" />
                <span className="text-sm text-slate-400">Total Triggers</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {responseRules.reduce((sum, r) => sum + r.trigger_count, 0)}
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-purple-400" />
                <span className="text-sm text-slate-400">In Cooldown</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {responseRules.filter(r => isInCooldown(r.rule_id)).length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Response Rules Configuration */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            Response Rules Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {responseRules.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p>No response rules configured</p>
              <p className="text-sm mt-2">Enable detection rules to create auto-responses</p>
            </div>
          ) : (
            responseRules.slice(0, 10).map(rule => (
              <div key={rule.rule_id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold text-white">{rule.rule_name}</h4>
                      <Badge className={rule.enabled ? "bg-green-500" : "bg-slate-700"}>
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      {isInCooldown(rule.rule_id) && (
                        <Badge className="bg-yellow-500/20 text-yellow-400">
                          <Clock className="w-3 h-3 mr-1" />
                          Cooldown
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''} configured
                    </p>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) => updateResponseRule(rule.rule_id, { enabled: checked })}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <Label className="text-slate-500 text-xs">Cooldown Period</Label>
                    <Input
                      type="number"
                      value={rule.cooldown_seconds}
                      onChange={(e) => updateResponseRule(rule.rule_id, { cooldown_seconds: parseInt(e.target.value) })}
                      className="bg-slate-900 border-slate-600 h-8 mt-1"
                      min={0}
                    />
                    <span className="text-slate-500 text-xs">seconds</span>
                  </div>

                  <div>
                    <Label className="text-slate-500 text-xs">Max Triggers/Hour</Label>
                    <Input
                      type="number"
                      value={rule.max_triggers_per_hour}
                      onChange={(e) => updateResponseRule(rule.rule_id, { max_triggers_per_hour: parseInt(e.target.value) })}
                      className="bg-slate-900 border-slate-600 h-8 mt-1"
                      min={1}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>Triggered: {rule.trigger_count} times</span>
                  {rule.last_triggered && (
                    <span>Last: {new Date(rule.last_triggered).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-500/10 border-blue-500">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-400">
              <strong>Auto-Response Engine</strong> automatically executes actions when detection rules are triggered.
              Configure cooldown periods and throttling limits to prevent alert fatigue and system overload.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}