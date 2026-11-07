import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, 
  ChevronDown, ChevronUp, Settings, Shield, Loader2, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../hooks/useUser';
import { format } from 'date-fns';
import ActionsQueue from '../policy/ActionsQueue';

// UI Formatting Helpers (Pure Presentation)
const formatPlaneLabel = (plane) => plane || 'UNKNOWN';

const formatSeverityBadge = (severity) => ({
  CRITICAL: { className: 'bg-red-500/20 text-red-400', label: 'CRITICAL' },
  HIGH: { className: 'bg-orange-500/20 text-orange-400', label: 'HIGH' },
  MEDIUM: { className: 'bg-yellow-500/20 text-yellow-400', label: 'MEDIUM' },
  LOW: { className: 'bg-blue-500/20 text-blue-400', label: 'LOW' },
  INFO: { className: 'bg-slate-500/20 text-slate-400', label: 'INFO' }
}[severity] || { className: 'bg-slate-500/20 text-slate-400', label: 'UNKNOWN' });

const formatStatus = (status) => ({
  OPEN: { className: 'bg-blue-500/20 text-blue-400', label: 'OPEN' },
  QUEUED: { className: 'bg-yellow-500/20 text-yellow-400', label: 'QUEUED' },
  EXECUTED: { className: 'bg-green-500/20 text-green-400', label: 'EXECUTED' },
  DISMISSED: { className: 'bg-slate-500/20 text-slate-400', label: 'DISMISSED' }
}[status] || { className: 'bg-slate-500/20 text-slate-400', label: status });

export default function AutomationTab({ sessionId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [expandedRecs, setExpandedRecs] = useState({});
  const [dryRunResults, setDryRunResults] = useState({});
  const [expandedAudits, setExpandedAudits] = useState({});

  const isAdmin = user?.role === 'admin';

  // Fetch automation settings
  const { data: settings } = useQuery({
    queryKey: ['automation-settings', user?.organization_id],
    queryFn: async () => {
      const results = await base44.entities.ControlPlaneAutomationSettings.filter({
        organization_id: user.organization_id
      });
      return results[0] || null;
    },
    enabled: !!user?.organization_id
  });

  // Fetch recommendations for this session
  const { data: recommendations = [], isLoading: recsLoading } = useQuery({
    queryKey: ['control-plane-recommendations', sessionId],
    queryFn: async () => {
      return await base44.entities.ControlPlaneMitigationRecommendation.filter({
        session_id: sessionId
      }, '-generated_at');
    },
    enabled: !!sessionId
  });

  // Fetch approval queue items (filter by recommendation IDs)
  const { data: approvalQueue = [] } = useQuery({
    queryKey: ['cp-approval-queue', sessionId],
    queryFn: async () => {
      // Fetch all approval items for this org, filter client-side by session
      const items = await base44.entities.ApprovalQueueItem.filter({
        organization_id: user.organization_id,
        category: 'CONTROL_PLANE_ACTION'
      }, '-requested_at', 100);
      
      // Filter by session_id in payload
      return items.filter(item => item.payload?.session_id === sessionId);
    },
    enabled: !!sessionId && !!user?.organization_id
  });

  // Fetch audit logs for recommendations
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['cp-audit-logs', sessionId],
    queryFn: async () => {
      return await base44.entities.AuditLog.filter({
        organization_id: user.organization_id,
        event_type: { $in: ['control_plane_evaluation_run', 'control_plane_dry_run', 
                             'control_plane_execution', 'control_plane_execution_blocked',
                             'control_plane_approval_queued'] }
      }, '-timestamp', 50);
    },
    enabled: !!user?.organization_id
  });

  // Generate recommendations mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('evaluateControlPlaneMitigations', {
        session_id: sessionId
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['control-plane-recommendations', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['cp-approval-queue', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['cp-audit-logs', sessionId] });
      toast.success(`Generated ${data.recommendations?.length || 0} recommendations`, {
        description: data.warnings?.length > 0 ? data.warnings.join('; ') : undefined
      });
    },
    onError: (error) => {
      toast.error('Failed to generate recommendations', { description: error.message });
    }
  });

  // Execute recommendation mutation
  const executeMutation = useMutation({
    mutationFn: async ({ recommendation_id, mode }) => {
      const response = await base44.functions.invoke('executeControlPlaneMitigation', {
        recommendation_id,
        mode
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['control-plane-recommendations', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['cp-approval-queue', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['cp-audit-logs', sessionId] });

      if (data.result === 'BLOCKED') {
        toast.warning('Execution blocked', { description: data.blocked_reason });
      } else if (variables.mode === 'DRY_RUN') {
        setDryRunResults(prev => ({ ...prev, [variables.recommendation_id]: data }));
        toast.success('Dry run complete');
      } else {
        toast.success('Execution complete', { 
          description: `Result: ${data.result}` 
        });
      }
    },
    onError: (error) => {
      toast.error('Execution failed', { description: error.message });
    }
  });



  return (
    <div className="space-y-6">
      {/* Settings Overview */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Automation Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settings ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-xs text-slate-400">Mode</span>
                <p className="text-white font-semibold">{settings.mode || 'SUGGEST_ONLY'}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Min Risk Score</span>
                <p className="text-white font-semibold">{settings.min_overall_risk_score || 70}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Max Actions/Hour</span>
                <p className="text-white font-semibold">{settings.max_actions_per_hour || 3}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Cooldown</span>
                <p className="text-white font-semibold">{settings.cooldown_minutes || 30} min</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-400">No automation settings configured (using defaults)</p>
          )}
        </CardContent>
      </Card>

      {/* Generate Recommendations */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Mitigation Recommendations
            </CardTitle>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Generate Recommendations
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recsLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-4 text-slate-400 animate-spin" />
              <p className="text-slate-400">Loading recommendations...</p>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-8">
              <Shield className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">No recommendations yet</p>
              <p className="text-xs text-slate-500 mt-2">Click "Generate Recommendations" to analyze this session</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => {
                const isExpanded = expandedRecs[rec.id];
                const auditExpanded = expandedAudits[rec.id];
                const dryRunResult = dryRunResults[rec.id];
                const topAction = rec.recommended_actions?.[0];
                const queueItem = approvalQueue.find(q => q.related_entity_id === rec.id);
                const recAuditLogs = auditLogs.filter(log => 
                  log.metadata?.recommendation_id === rec.id || 
                  log.entity_id === rec.id
                );

                // Determine severity from context or default
                const severity = rec.risk_score_context?.indicator_severity || 'MEDIUM';
                const severityBadge = formatSeverityBadge(severity);
                const statusBadge = formatStatus(rec.status);

                // Check if execution is allowed
                const canExecute = isAdmin && 
                                  rec.status === 'QUEUED' && 
                                  queueItem?.status === 'APPROVED';

                return (
                  <div key={rec.id} className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{formatPlaneLabel(rec.plane)}</Badge>
                          <Badge className={severityBadge.className}>
                            Risk: {rec.risk_score_context?.plane_score || 0}
                          </Badge>
                          <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
                          {rec.dismissed_reason && (
                            <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                              {rec.dismissed_reason.includes('Cooldown') ? 'Cooldown Active' : 'Dismissed'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-white text-sm font-semibold">
                          {topAction?.action_title || 'No action defined'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">{rec.rationale}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedRecs(prev => ({ ...prev, [rec.id]: !isExpanded }))}
                        className="text-slate-400"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="space-y-3 mt-4 pt-4 border-t border-slate-700">
                        <div>
                          <span className="text-xs text-slate-400">Selected Actions:</span>
                          <div className="mt-2 space-y-2">
                            {rec.recommended_actions?.slice(0, 3).map((action, idx) => (
                              <div key={idx} className="bg-slate-900/50 rounded p-2">
                                <p className="text-white text-sm">{action.action_title}</p>
                                <p className="text-xs text-slate-500">{action.action_description}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">{action.execution_mode}</Badge>
                                  <span className="text-xs text-slate-400">
                                    Est. risk reduction: {action.estimated_risk_reduction}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Dry Run Result */}
                        {dryRunResult && (
                          <Alert className="bg-blue-500/10 border-blue-500/30">
                            <AlertDescription className="text-blue-300 text-xs">
                              <strong>Dry Run Result:</strong> {dryRunResult.result}
                              {dryRunResult.execution_result && (
                                <pre className="mt-2 text-xs">
                                  {JSON.stringify(dryRunResult.execution_result, null, 2)}
                                </pre>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Queue Item Link */}
                        {queueItem && (
                          <Alert className="bg-yellow-500/10 border-yellow-500/30">
                            <AlertDescription className="text-yellow-300 text-xs">
                              <strong>Approval Status:</strong> {queueItem.status}
                              {queueItem.reviewed_by && (
                                <span> • Reviewed by {queueItem.reviewed_by} on {format(new Date(queueItem.reviewed_at), 'MMM d, HH:mm')}</span>
                              )}
                              {queueItem.review_notes && (
                                <p className="mt-1 text-yellow-200">Notes: {queueItem.review_notes}</p>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Audit Trail */}
                        {recAuditLogs.length > 0 && (
                          <div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpandedAudits(prev => ({ ...prev, [rec.id]: !prev[rec.id] }))}
                              className="text-slate-400 text-xs"
                            >
                              <FileText className="w-3 h-3 mr-2" />
                              {auditExpanded ? 'Hide' : 'Show'} Audit Trail ({recAuditLogs.length})
                            </Button>
                            {auditExpanded && (
                              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                                {recAuditLogs.slice(0, 5).map(log => (
                                  <div key={log.id} className="bg-slate-900/50 rounded p-2 text-xs">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="outline" className="text-xs">{log.event_type}</Badge>
                                      <span className="text-slate-500">{format(new Date(log.timestamp), 'MMM d, HH:mm:ss')}</span>
                                    </div>
                                    <p className="text-slate-300">{log.description}</p>
                                    {log.metadata?.blocked_reason && (
                                      <p className="text-red-400 mt-1">Blocked: {log.metadata.blocked_reason}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => executeMutation.mutate({ recommendation_id: rec.id, mode: 'DRY_RUN' })}
                            disabled={executeMutation.isPending || rec.status === 'DISMISSED'}
                            className="border-blue-500 text-blue-400"
                          >
                            {executeMutation.isPending ? (
                              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3 mr-2" />
                            )}
                            Dry Run
                          </Button>

                          {isAdmin && rec.status === 'OPEN' && !queueItem && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                // Would trigger approval queue creation
                                toast.info('Queue approval workflow not yet implemented');
                              }}
                              className="border-yellow-500 text-yellow-400"
                            >
                              <AlertTriangle className="w-3 h-3 mr-2" />
                              Request Approval
                            </Button>
                          )}

                          {isAdmin && canExecute && (
                            <Button
                              size="sm"
                              onClick={() => executeMutation.mutate({ recommendation_id: rec.id, mode: 'EXECUTE' })}
                              disabled={executeMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {executeMutation.isPending ? (
                                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                              ) : (
                                <CheckCircle className="w-3 h-3 mr-2" />
                              )}
                              Execute
                            </Button>
                          )}

                          {!isAdmin && rec.status === 'QUEUED' && (
                            <div className="text-xs text-slate-500 italic">
                              Admin approval required for execution
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval Queue (reuse existing component) */}
      {approvalQueue.length > 0 && (
        <ActionsQueue actions={approvalQueue.map(q => ({
          id: q.id,
          action_type: q.title,
          status: q.status,
          device_id: q.payload?.session_id || 'N/A',
          requested_by: q.requested_by,
          requires_approval: true,
          payload_json: q.payload,
          created_date: q.requested_at,
          executed_at: q.reviewed_at,
          execution_log: q.review_notes
        }))} />
      )}
    </div>
  );
}