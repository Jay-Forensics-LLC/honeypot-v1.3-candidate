
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  Zap,
  Target,
  CheckCircle,
  Clock,
  Shield,
  Lightbulb,
  Database,
  Loader2,
  RefreshCw,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '../components/utils/formatters';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import { enrichIncidentThreatIntel } from '../functions/enrichIncidentThreatIntel';
import { generateAIResponseSuggestions } from '../functions/generateAIResponseSuggestions';
import { assignIncidentResponder } from '../functions/assignIncidentResponder';
import { groupAlertsIntoIncident } from '../functions/groupAlertsIntoIncident';
import IncidentResponsePlaybook from '../components/automation/IncidentResponsePlaybook';

export default function IncidentResponse() {
  const [searchTerm, setSearchTerm] = useState('');
  const [autoTriageEnabled, setAutoTriageEnabled] = useState(true);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('IncidentResponse', '-detected_at', 50, 15000);
      } catch (error) {
        console.warn('Failed to load incidents:', error);
        return [];
      }
    },
    initialData: [],
    retry: 0,
    staleTime: 60000
  });

  const { data: pendingAlerts = [] } = useQuery({
    queryKey: ['pending-alerts'],
    queryFn: async () => {
      try {
        return await resilientAPI.filterEntity(
          'Alert',
          { status: 'new', severity: { $in: ['high', 'critical'] } },
          '-detection_timestamp',
          20,
          0,
          10000
        );
      } catch (error) {
        return [];
      }
    },
    initialData: [],
    enabled: autoTriageEnabled
  });

  const enrichMutation = useMutation({
    mutationFn: async (incidentId) => {
      const { data } = await enrichIncidentThreatIntel({ incidentId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Threat intel enrichment completed!');
    },
    onError: (error) => {
      toast.error('Enrichment failed: ' + error.message);
    }
  });

  const generateSuggestionsMutation = useMutation({
    mutationFn: async (incidentId) => {
      const { data } = await generateAIResponseSuggestions({ incidentId });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success(`Generated ${data.count} AI response suggestions!`);
    },
    onError: (error) => {
      toast.error('AI suggestions failed: ' + error.message);
    }
  });

  const autoAssignMutation = useMutation({
    mutationFn: async (incidentId) => {
      const { data } = await assignIncidentResponder({ incidentId });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success(`Auto-assigned to ${data.assigned_name}`, {
        description: data.assignment_reason
      });
    },
    onError: (error) => {
      toast.error('Auto-assignment failed: ' + error.message);
    }
  });

  const autoTriageMutation = useMutation({
    mutationFn: async () => {
      const { data } = await groupAlertsIntoIncident({
        severity_threshold: 'high',
        time_window_hours: 24,
        auto_enrich: true,
        auto_assign: true
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['pending-alerts'] });
      toast.success('Auto-triage completed!', {
        description: `Created ${data.incidents_created} incident(s) from ${data.alerts_grouped} alerts`
      });
    },
    onError: (error) => {
      toast.error('Auto-triage failed: ' + error.message);
    }
  });

  const executeActionMutation = useMutation({
    mutationFn: async ({ incidentId, actionIndex }) => {
      const incident = incidents.find(i => i.incident_id === incidentId);
      const action = incident.ai_suggested_actions[actionIndex];
      
      const updatedActions = [...incident.ai_suggested_actions];
      updatedActions[actionIndex] = {
        ...action,
        executed: true,
        executed_at: new Date().toISOString()
      };
      
      await base44.entities.IncidentResponse.update(incident.id, {
        ai_suggested_actions: updatedActions,
        timeline: [
          ...(incident.timeline || []),
          {
            timestamp: new Date().toISOString(),
            event: `AI action executed: ${action.description}`,
            actor: user.email,
            details: action.action_type,
            automated: false
          }
        ]
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Action executed!');
    }
  });

  const filteredIncidents = incidents.filter(inc =>
    inc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inc.incident_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const severityColors = {
    low: 'bg-green-500/20 text-green-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    high: 'bg-orange-500/20 text-orange-400',
    critical: 'bg-red-500/20 text-red-400'
  };

  const statusColors = {
    detected: 'bg-blue-500/20 text-blue-400',
    investigating: 'bg-yellow-500/20 text-yellow-400',
    contained: 'bg-purple-500/20 text-purple-400',
    eradicated: 'bg-green-500/20 text-green-400',
    recovered: 'bg-green-500/20 text-green-400',
    closed: 'bg-slate-500/20 text-slate-400'
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Incident Response</h1>
          <p className="text-slate-400">AI-powered automated incident management</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingAlerts.length > 0 && (
            <Button
              onClick={() => autoTriageMutation.mutate()}
              disabled={autoTriageMutation.isPending}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {autoTriageMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Auto-Triage {pendingAlerts.length} Alert(s)
            </Button>
          )}
        </div>
      </div>

      {/* AI Triage Banner */}
      {pendingAlerts.length > 0 && (
        <Card className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-purple-500/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Lightbulb className="w-8 h-8 text-purple-400" />
              <div className="flex-1">
                <p className="font-semibold text-white mb-1">
                  {pendingAlerts.length} High-Severity Alert(s) Pending Triage
                </p>
                <p className="text-sm text-slate-300">
                  AI can automatically group related alerts, enrich with threat intelligence, 
                  and assign to available responders based on severity and workload.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {incidents.filter(i => i.status !== 'closed').length}
                </p>
                <p className="text-xs text-slate-400">Active Incidents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Zap className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {incidents.filter(i => i.playbook_execution?.auto_executed).length}
                </p>
                <p className="text-xs text-slate-400">Auto-Responded</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Target className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {incidents.filter(i => i.threat_intel_enrichment?.apt_groups?.length > 0).length}
                </p>
                <p className="text-xs text-slate-400">APT Attribution</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {incidents.filter(i => i.status === 'closed').length}
                </p>
                <p className="text-xs text-slate-400">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <Input
            placeholder="Search incidents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-800 border-slate-700"
          />
        </CardContent>
      </Card>

      {/* Incidents List */}
      <div className="space-y-4">
        {filteredIncidents.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-green-400" />
              <p className="text-white mb-2">No incidents found</p>
              <p className="text-sm text-slate-400">All systems nominal</p>
            </CardContent>
          </Card>
        ) : (
          filteredIncidents.map((incident) => (
            <Card key={incident.id} className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-white">{incident.title}</h3>
                      <Badge className={
                        incident.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        incident.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        incident.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      }>
                        {incident.severity}
                      </Badge>
                      <Badge className={statusColors[incident.status]}>
                        {incident.status?.replace(/_/g, ' ')}
                      </Badge>
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {incident.incident_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-400 mb-2">
                      {incident.incident_number} • Detected {formatRelativeTime(incident.detected_at)}
                    </p>
                    {!incident.assigned_to && (
                      <Button
                        size="sm"
                        onClick={() => autoAssignMutation.mutate(incident.incident_id)}
                        disabled={autoAssignMutation.isPending}
                        className="bg-purple-600 hover:bg-purple-700 mb-2"
                      >
                        {autoAssignMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Users className="w-4 h-4 mr-2" />
                        )}
                        Auto-Assign Responder
                      </Button>
                    )}
                    {incident.assigned_to && (
                      <p className="text-sm text-slate-400 mb-2">
                        Assigned to: <span className="text-white">{incident.assigned_to}</span>
                      </p>
                    )}
                    <p className="text-slate-300 mb-3">{incident.description}</p>
                  </div>
                </div>

                {/* Automated Response Playbook */}
                {incident.status !== 'closed' && (
                  <IncidentResponsePlaybook incident={incident} />
                )}

                {/* Threat Intel Enrichment */}
                {incident.threat_intel_enrichment && (
                  <div className="mb-4 p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-5 h-5 text-purple-400" />
                      <h4 className="font-semibold text-purple-300">Threat Intelligence</h4>
                    </div>
                    <div className="grid md:grid-cols-3 gap-3 text-sm">
                      {incident.threat_intel_enrichment.apt_groups?.length > 0 && (
                        <div>
                          <p className="text-slate-400 mb-1">APT Groups:</p>
                          {incident.threat_intel_enrichment.apt_groups.slice(0, 2).map((apt, i) => (
                            <Badge key={i} className="bg-red-500/20 text-red-400 mr-1 mb-1">
                              {apt.group_name} ({apt.confidence}%)
                            </Badge>
                          ))}
                        </div>
                      )}
                      {incident.threat_intel_enrichment.malware_families?.length > 0 && (
                        <div>
                          <p className="text-slate-400 mb-1">Malware:</p>
                          {incident.threat_intel_enrichment.malware_families.slice(0, 2).map((mw, i) => (
                            <Badge key={i} className="bg-orange-500/20 text-orange-400 mr-1">
                              {mw}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {incident.threat_intel_enrichment.matched_iocs?.length > 0 && (
                        <div>
                          <p className="text-slate-400 mb-1">IOC Matches:</p>
                          <Badge className="bg-yellow-500/20 text-yellow-400">
                            {incident.threat_intel_enrichment.matched_iocs.length} indicators
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* AI Suggestions */}
                {incident.ai_suggested_actions && incident.ai_suggested_actions.length > 0 && (
                  <div className="mb-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-5 h-5 text-blue-400" />
                      <h4 className="font-semibold text-blue-300">AI Response Suggestions</h4>
                    </div>
                    <div className="space-y-2">
                      {incident.ai_suggested_actions.slice(0, 5).map((suggestion, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <Badge className={
                            suggestion.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                            suggestion.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-blue-500/20 text-blue-400'
                          }>
                            {suggestion.priority}
                          </Badge>
                          <div className="flex-1">
                            <p className="text-white font-medium">{suggestion.description}</p>
                            <p className="text-xs text-slate-400 mt-1">{suggestion.reasoning}</p>
                          </div>
                          {!suggestion.executed && (
                            <Button 
                              size="sm" 
                              onClick={() => executeActionMutation.mutate({ 
                                incidentId: incident.incident_id, 
                                actionIndex: i 
                              })}
                              disabled={executeActionMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              Execute
                            </Button>
                          )}
                          {suggestion.executed && (
                            <Badge className="bg-green-500/20 text-green-400">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Executed
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Playbook Status (Existing - kept for context but replaced by dedicated component) */}
                {incident.playbook_execution && (
                  <div className="mb-4 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-green-400" />
                        <span className="font-semibold text-green-300">
                          Playbook: {incident.playbook_execution.playbook_name}
                        </span>
                        {incident.playbook_execution.auto_executed && (
                          <Badge className="bg-purple-500/20 text-purple-400">AUTO</Badge>
                        )}
                      </div>
                      <Badge className={
                        incident.playbook_execution.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        incident.playbook_execution.status === 'running' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                        'bg-yellow-500/20 text-yellow-400'
                      }>
                        {incident.playbook_execution.status}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {!incident.threat_intel_enrichment && (
                    <Button
                      size="sm"
                      onClick={() => enrichMutation.mutate(incident.incident_id)}
                      disabled={enrichMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {enrichMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Target className="w-4 h-4 mr-2" />
                      )}
                      Enrich Threat Intel
                    </Button>
                  )}
                  
                  {!incident.ai_suggested_actions || incident.ai_suggested_actions.length === 0 ? (
                    <Button
                      size="sm"
                      onClick={() => generateSuggestionsMutation.mutate(incident.incident_id)}
                      disabled={generateSuggestionsMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {generateSuggestionsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Lightbulb className="w-4 h-4 mr-2" />
                      )}
                      Generate AI Suggestions
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => generateSuggestionsMutation.mutate(incident.incident_id)}
                      disabled={generateSuggestionsMutation.isPending}
                      variant="outline"
                      className="border-blue-500/50 text-blue-400"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh Suggestions
                    </Button>
                  )}

                  <Badge className="flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    {incident.related_alert_ids?.length || 0} alerts grouped
                  </Badge>
                  
                  <Badge className="flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {incident.related_evidence_ids?.length || 0} evidence items
                  </Badge>
                </div>

                {/* Timeline Preview */}
                {incident.timeline && incident.timeline.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <p className="text-xs text-slate-400 mb-2">Recent Activity:</p>
                    <div className="space-y-1">
                      {incident.timeline.slice(-3).reverse().map((entry, i) => (
                        <div key={i} className="text-xs text-slate-300 flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          <span className="text-slate-500">{formatRelativeTime(entry.timestamp)}</span>
                          <span>•</span>
                          <span>{entry.event}</span>
                          {entry.automated && (
                            <Badge className="bg-purple-500/20 text-purple-400 text-[10px] px-1">
                              AUTO
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
