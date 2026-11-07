import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Lightbulb, 
  TrendingUp, 
  Zap,
  CheckCircle,
  AlertTriangle,
  X,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";

export default function SmartSuggestionsEngine() {
  const [suggestions, setSuggestions] = useState([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());

  const { data: rules = [] } = useQuery({
    queryKey: ['detection-rules'],
    queryFn: () => base44.entities.DetectionRule.list(),
    initialData: []
  });

  const { data: automations = [] } = useQuery({
    queryKey: ['automation-playbooks'],
    queryFn: () => base44.entities.AutomationPlaybook.list(),
    initialData: []
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['scan-sessions'],
    queryFn: () => base44.entities.ScanSession.list('-start_timestamp', 100),
    initialData: []
  });

  useEffect(() => {
    generateSuggestions();
  }, [rules, automations, sessions]);

  const generateSuggestions = () => {
    const newSuggestions = [];

    // Suggestion 1: Redundant Rules
    const rulesByType = rules.reduce((acc, rule) => {
      const key = `${rule.rule_type}-${rule.severity}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    Object.entries(rulesByType).forEach(([key, count]) => {
      if (count > 3) {
        const [type, severity] = key.split('-');
        newSuggestions.push({
          id: `redundant-${key}`,
          type: 'optimization',
          priority: 'medium',
          title: 'Redundant Detection Rules',
          description: `You have ${count} similar ${severity} ${type} rules. Consider consolidating them for better performance.`,
          impact: 'Performance',
          action: 'Review and merge similar rules',
          icon: TrendingUp,
          color: 'text-yellow-400'
        });
      }
    });

    // Suggestion 2: Disabled Critical Rules
    const disabledCritical = rules.filter(r => !r.enabled && r.severity === 'critical');
    if (disabledCritical.length > 0) {
      newSuggestions.push({
        id: 'disabled-critical',
        type: 'security',
        priority: 'high',
        title: 'Critical Rules Disabled',
        description: `${disabledCritical.length} critical detection rules are disabled. This may leave you vulnerable.`,
        impact: 'Security Risk',
        action: 'Review and enable critical rules',
        icon: AlertTriangle,
        color: 'text-red-400'
      });
    }

    // Suggestion 3: No Recent Scans
    const daysSinceLastScan = sessions.length > 0 
      ? Math.floor((Date.now() - new Date(sessions[0].start_timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceLastScan > 7) {
      newSuggestions.push({
        id: 'no-recent-scans',
        type: 'maintenance',
        priority: 'medium',
        title: 'No Recent Security Scans',
        description: `Last scan was ${daysSinceLastScan} days ago. Regular scanning helps detect new threats.`,
        impact: 'Security Posture',
        action: 'Run a security scan',
        icon: Zap,
        color: 'text-orange-400'
      });
    }

    // Suggestion 4: High False Positive Rate
    const highFPRules = rules.filter(r => {
      const fpRate = r.detection_count > 0 ? (r.false_positive_count / r.detection_count) : 0;
      return fpRate > 0.3 && r.detection_count > 10;
    });

    if (highFPRules.length > 0) {
      newSuggestions.push({
        id: 'high-fp-rate',
        type: 'optimization',
        priority: 'medium',
        title: 'High False Positive Rate',
        description: `${highFPRules.length} rules have >30% false positive rate. This reduces detection accuracy.`,
        impact: 'Detection Quality',
        action: 'Tune rules to reduce false positives',
        icon: TrendingUp,
        color: 'text-yellow-400'
      });
    }

    // Suggestion 5: Unused Automations
    const unusedAutomations = automations.filter(a => a.execution_count === 0);
    if (unusedAutomations.length > 2) {
      newSuggestions.push({
        id: 'unused-automations',
        type: 'cleanup',
        priority: 'low',
        title: 'Unused Automation Playbooks',
        description: `${unusedAutomations.length} playbooks have never been executed. Consider removing unused automations.`,
        impact: 'System Cleanup',
        action: 'Review and delete unused playbooks',
        icon: Lightbulb,
        color: 'text-blue-400'
      });
    }

    // Suggestion 6: Missing Watchlist Entries
    const hasWatchlist = rules.some(r => r.rule_type === 'watchlist');
    if (!hasWatchlist && sessions.length > 5) {
      newSuggestions.push({
        id: 'no-watchlist',
        type: 'enhancement',
        priority: 'medium',
        title: 'No Watchlist Configured',
        description: 'Set up a watchlist to track known threats and suspicious devices automatically.',
        impact: 'Threat Detection',
        action: 'Create watchlist entries',
        icon: Sparkles,
        color: 'text-purple-400'
      });
    }

    // Suggestion 7: Automation Success Rate
    const lowSuccessAutomations = automations.filter(a => {
      const successRate = a.execution_count > 0 ? (a.success_count / a.execution_count) : 1;
      return successRate < 0.7 && a.execution_count > 5;
    });

    if (lowSuccessAutomations.length > 0) {
      newSuggestions.push({
        id: 'low-success-automations',
        type: 'reliability',
        priority: 'high',
        title: 'Failing Automation Playbooks',
        description: `${lowSuccessAutomations.length} playbooks have <70% success rate. This impacts automated response effectiveness.`,
        impact: 'Automation Reliability',
        action: 'Debug and fix failing playbooks',
        icon: AlertTriangle,
        color: 'text-red-400'
      });
    }

    // Suggestion 8: Rule Coverage
    const ruleTypes = new Set(rules.map(r => r.rule_type));
    const missingTypes = ['sigma', 'yara', 'heuristic'].filter(type => !ruleTypes.has(type));
    
    if (missingTypes.length > 0 && rules.length < 10) {
      newSuggestions.push({
        id: 'expand-coverage',
        type: 'enhancement',
        priority: 'low',
        title: 'Expand Detection Coverage',
        description: `Consider adding ${missingTypes.join(', ')} rules to improve threat detection coverage.`,
        impact: 'Detection Coverage',
        action: 'Add diverse rule types',
        icon: Sparkles,
        color: 'text-green-400'
      });
    }

    setSuggestions(newSuggestions.filter(s => !dismissedSuggestions.has(s.id)));
  };

  const dismissSuggestion = (id) => {
    setDismissedSuggestions(prev => new Set([...prev, id]));
    setSuggestions(suggestions.filter(s => s.id !== id));
    toast.info('Suggestion dismissed');
  };

  const applySuggestion = (suggestion) => {
    toast.success(`Applied: ${suggestion.action}`);
    dismissSuggestion(suggestion.id);
  };

  const getPriorityColor = (priority) => {
    return priority === 'high' ? 'bg-red-500' :
           priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-6 h-6 text-yellow-400" />
              Smart Suggestions
            </div>
            <Badge className="bg-purple-500">
              {suggestions.length} Active
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <TrendingUp className="w-8 h-8 text-yellow-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {suggestions.filter(s => s.type === 'optimization').length}
              </p>
              <p className="text-xs text-slate-400">Optimization</p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {suggestions.filter(s => s.priority === 'high').length}
              </p>
              <p className="text-xs text-slate-400">High Priority</p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <Sparkles className="w-8 h-8 text-purple-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {suggestions.filter(s => s.type === 'enhancement').length}
              </p>
              <p className="text-xs text-slate-400">Enhancements</p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {dismissedSuggestions.size}
              </p>
              <p className="text-xs text-slate-400">Completed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suggestions List */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle>Recommended Actions</CardTitle>
        </CardHeader>
        <CardContent>
          {suggestions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
              <p className="text-lg">All caught up!</p>
              <p className="text-sm mt-2">No suggestions at this time. Your system is well optimized.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map(suggestion => {
                const Icon = suggestion.icon;
                
                return (
                  <div
                    key={suggestion.id}
                    className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <Icon className={`w-8 h-8 ${suggestion.color} flex-shrink-0 mt-1`} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-white mb-1">{suggestion.title}</h3>
                            <p className="text-sm text-slate-400">{suggestion.description}</p>
                          </div>
                          <Badge className={getPriorityColor(suggestion.priority)}>
                            {suggestion.priority}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 mt-3">
                          <div className="text-xs text-slate-500">
                            <span className="font-semibold">Impact:</span> {suggestion.impact}
                          </div>
                          <div className="text-xs text-slate-500">
                            <span className="font-semibold">Type:</span> {suggestion.type}
                          </div>
                        </div>

                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={() => applySuggestion(suggestion)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {suggestion.action}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => dismissSuggestion(suggestion.id)}
                            className="border-slate-700"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500">
        <div className="flex items-start gap-3 text-sm text-yellow-400">
          <Lightbulb className="w-5 h-5 mt-0.5" />
          <div>
            <strong>Smart Suggestions:</strong> AI-powered recommendations to optimize your security posture. 
            The system analyzes your rules, automations, and scan history to identify improvements.
          </div>
        </div>
      </div>
    </div>
  );
}