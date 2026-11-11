import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  Shield, Play, CheckCircle, XCircle, Clock, AlertTriangle, 
  Download, Filter, Search, Eye, FileText, Settings, Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '../components/utils';
import VerificationPanel from '../components/audit/VerificationPanel';

export default function ScheduledWeeklyAudit() {
  const [selectedRun, setSelectedRun] = useState(null);
  const [findingsFilters, setFindingsFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  // Fetch audit runs
  const { data: runs, isLoading } = useQuery({
    queryKey: ['codebaseAuditRuns'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getCodebaseAuditRuns', { filters: {} });
      return response.data.data;
    }
  });

  // Run audit mutation
  const runAuditMutation = useMutation({
    mutationFn: async ({ profile }) => {
      return await base44.functions.invoke('runCodebaseAudit', {
        trigger: 'MANUAL',
        profile
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['codebaseAuditRuns'] });
      toast.success('Audit started successfully');
    },
    onError: (error) => {
      toast.error(`Audit failed: ${error.message}`);
    }
  });

  // Fetch findings for selected run
  const { data: findingsData } = useQuery({
    queryKey: ['codebaseAuditFindings', selectedRun?.id, findingsFilters, searchQuery],
    queryFn: async () => {
      if (!selectedRun) return null;
      const response = await base44.functions.invoke('getCodebaseAuditFindings', {
        run_id: selectedRun.id,
        filters: { ...findingsFilters, search: searchQuery }
      });
      return response.data;
    },
    enabled: !!selectedRun
  });

  const handleRunAudit = (profile) => {
    if (confirm(`Start ${profile} audit now? This may take several minutes.`)) {
      runAuditMutation.mutate({ profile });
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      SUCCEEDED: 'bg-green-500/20 text-green-400 border-green-500/50',
      RUNNING: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      FAILED: 'bg-red-500/20 text-red-400 border-red-500/50',
      FAILED_STALE: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      QUEUED: 'bg-slate-500/20 text-slate-400 border-slate-500/50'
    };
    return <Badge className={styles[status] || styles.QUEUED}>{status}</Badge>;
  };

  const getSeverityColor = (severity) => {
    const colors = {
      CRITICAL: 'text-red-400',
      HIGH: 'text-orange-400',
      MEDIUM: 'text-yellow-400',
      LOW: 'text-blue-400',
      INFO: 'text-slate-400'
    };
    return colors[severity] || colors.INFO;
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-slate-400">Loading audit runs...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-400" />
            Codebase Security Audit
          </h1>
          <p className="text-slate-400 mt-1">Evidence-grade static analysis and compliance scanning</p>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={() => handleRunAudit('DEFAULT')}
            disabled={runAuditMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Play className="w-4 h-4 mr-2" />
            Run Audit (Default)
          </Button>
          <Button
            onClick={() => handleRunAudit('STRICT')}
            disabled={runAuditMutation.isPending}
            variant="outline"
            className="border-orange-500/50 text-orange-400"
          >
            <Play className="w-4 h-4 mr-2" />
            Run Audit (Strict)
          </Button>
        </div>
      </div>

      {/* Audit Runs */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Audit Run History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {runs?.map(run => (
              <div
                key={run.id}
                onClick={() => setSelectedRun(run)}
                className={`p-4 rounded border cursor-pointer transition-colors ${
                  selectedRun?.id === run.id
                    ? 'bg-slate-800 border-purple-500/50'
                    : 'bg-slate-800/30 border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {getStatusBadge(run.status)}
                    <div>
                      <div className="text-white font-medium">
                        {run.audit_profile} Profile
                        {run.trigger === 'MANUAL' && ' (Manual)'}
                      </div>
                      <div className="text-sm text-slate-400">
                        {formatRelativeTime(run.created_date)} · {run.duration_ms ? `${Math.round(run.duration_ms / 1000)}s` : 'In progress'}
                      </div>
                    </div>
                  </div>
                  
                  {run.stats && (
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-white">{run.stats.total_findings || 0}</div>
                        <div className="text-slate-400">Total</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-red-400">{run.stats.by_severity?.CRITICAL || 0}</div>
                        <div className="text-slate-400">Critical</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-orange-400">{run.stats.by_severity?.HIGH || 0}</div>
                        <div className="text-slate-400">High</div>
                      </div>
                      {run.sealed_at && (
                        <div className="text-center">
                          <CheckCircle className="w-5 h-5 text-green-400 mx-auto" />
                          <div className="text-xs text-slate-400">Sealed</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {!runs?.length && (
              <div className="text-center py-12 text-slate-400">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No audit runs yet. Click "Run Audit" to start.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Run Details */}
      {selectedRun && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">
                Run Details: {selectedRun.id.substring(0, 8)}...
              </CardTitle>
              {selectedRun.artifact_refs && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download Report
                  </Button>
                  <Button size="sm" variant="outline">
                    <FileText className="w-4 h-4 mr-2" />
                    Download Summary
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="findings" className="w-full">
              <TabsList className="bg-slate-800">
                <TabsTrigger value="findings">Findings</TabsTrigger>
                <TabsTrigger value="stats">Statistics</TabsTrigger>
                <TabsTrigger value="config">Configuration</TabsTrigger>
                <TabsTrigger value="verify">Verify Integrity</TabsTrigger>
              </TabsList>

              <TabsContent value="findings" className="space-y-4">
                {/* Filters */}
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search findings..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-slate-800 border-slate-700"
                    />
                  </div>
                  
                  <Select
                    value={findingsFilters.severity || 'all'}
                    onValueChange={(val) => setFindingsFilters(prev => ({ ...prev, severity: val === 'all' ? undefined : val }))}
                  >
                    <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="INFO">Info</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={findingsFilters.category || 'all'}
                    onValueChange={(val) => setFindingsFilters(prev => ({ ...prev, category: val === 'all' ? undefined : val }))}
                  >
                    <SelectTrigger className="w-48 bg-slate-800 border-slate-700">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="DEPENDENCY">Dependencies</SelectItem>
                      <SelectItem value="SECRET">Secrets</SelectItem>
                      <SelectItem value="SAST">SAST</SelectItem>
                      <SelectItem value="QUALITY">Code Quality</SelectItem>
                      <SelectItem value="LICENSE">Licenses</SelectItem>
                      <SelectItem value="AI_INJECTION">AI Injection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Findings List */}
                <div className="space-y-2">
                  {findingsData?.data?.map(finding => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                  
                  {!findingsData?.data?.length && (
                    <div className="text-center py-12 text-slate-400">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No findings match your filters</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="stats" className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-6">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-white mb-2">
                          {selectedRun.stats?.scanned_files_count || 0}
                        </div>
                        <div className="text-slate-400">Files Scanned</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-6">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-white mb-2">
                          {selectedRun.stats?.total_findings || 0}
                        </div>
                        <div className="text-slate-400">Total Findings</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-6">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-white mb-2">
                          {Math.round((selectedRun.duration_ms || 0) / 1000)}s
                        </div>
                        <div className="text-slate-400">Duration</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Findings by Severity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(selectedRun.stats?.by_severity || {}).map(([severity, count]) => (
                        <div key={severity} className="flex items-center justify-between">
                          <span className={`font-medium ${getSeverityColor(severity)}`}>{severity}</span>
                          <span className="text-white font-bold">{count}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="config">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-6">
                    <pre className="text-sm text-slate-300 overflow-auto">
                      {JSON.stringify(selectedRun.config_snapshot, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="verify" className="space-y-4">
                <VerificationPanel runId={selectedRun.id} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Trends Panel */}
      {selectedRun?.trends && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Trend Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-500/10 rounded border border-green-500/30">
                <div className="text-2xl font-bold text-green-400">{selectedRun.trends.resolved_findings}</div>
                <div className="text-sm text-slate-400">Resolved</div>
              </div>
              <div className="text-center p-4 bg-yellow-500/10 rounded border border-yellow-500/30">
                <div className="text-2xl font-bold text-yellow-400">{selectedRun.trends.new_findings}</div>
                <div className="text-sm text-slate-400">New</div>
              </div>
              <div className="text-center p-4 bg-slate-700/30 rounded border border-slate-600">
                <div className="text-2xl font-bold text-white">{selectedRun.trends.unchanged_findings}</div>
                <div className="text-sm text-slate-400">Unchanged</div>
              </div>
            </div>
            <div className="mt-4 text-center">
              <Badge className={
                selectedRun.trends.severity_change === 'IMPROVING' ? 'bg-green-500/20 text-green-400' :
                selectedRun.trends.severity_change === 'WORSENING' ? 'bg-red-500/20 text-red-400' :
                'bg-slate-500/20 text-slate-400'
              }>
                Trend: {selectedRun.trends.severity_change}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FindingCard({ finding }) {
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false);
  const [suppressReason, setSuppressReason] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const queryClient = useQueryClient();

  const suppressMutation = useMutation({
    mutationFn: async ({ finding_id, reason, action }) => {
      return await base44.functions.invoke('suppressFinding', {
        finding_id,
        reason,
        action
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['codebaseAuditFindings'] });
      setSuppressDialogOpen(false);
      setSuppressReason('');
      toast.success('Finding updated');
    }
  });

  const getSeverityColor = (severity) => {
    const colors = {
      CRITICAL: 'text-red-400 border-red-500/50 bg-red-500/10',
      HIGH: 'text-orange-400 border-orange-500/50 bg-orange-500/10',
      MEDIUM: 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10',
      LOW: 'text-blue-400 border-blue-500/50 bg-blue-500/10',
      INFO: 'text-slate-400 border-slate-500/50 bg-slate-500/10'
    };
    return colors[severity] || colors.INFO;
  };

  return (
    <Card className={`bg-slate-800/30 border-slate-700 ${finding.suppressed ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={getSeverityColor(finding.severity)}>{finding.severity}</Badge>
              <Badge className="bg-slate-700 text-slate-300">{finding.category}</Badge>
              {finding.suppressed && <Badge className="bg-yellow-500/20 text-yellow-400">Suppressed</Badge>}
            </div>
            
            <h4 className="text-white font-medium mb-1">
              {finding.title}
              {finding.confidence && (
                <span className="ml-2 text-xs text-slate-500">
                  Confidence: {Math.round(finding.confidence * 100)}%
                </span>
              )}
            </h4>
            <p className="text-sm text-slate-400 mb-2">{finding.description}</p>
            {finding.is_new_in_run && (
              <Badge className="bg-blue-500/20 text-blue-400 text-xs mr-2">NEW</Badge>
            )}
            
            {finding.file_path && (
              <div className="text-xs text-slate-500 font-mono">
                {finding.file_path}
                {finding.line_start && `:${finding.line_start}`}
              </div>
            )}
            
            {finding.code_snippet && (
              <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-300 overflow-x-auto">
                {finding.code_snippet}
              </pre>
            )}
            
            {finding.remediation && (
              <div className="mt-2 text-sm text-blue-400">
                💡 {finding.remediation}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Dialog open={suppressDialogOpen} onOpenChange={setSuppressDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-slate-600">
                  {finding.suppressed ? 'Unsuppress' : 'Suppress'}
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-slate-800">
                <DialogHeader>
                  <DialogTitle className="text-white">
                    {finding.suppressed ? 'Unsuppress Finding' : 'Suppress Finding'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {!finding.suppressed && (
                    <>
                      <Textarea
                        placeholder="Reason for suppression (required)..."
                        value={suppressReason}
                        onChange={(e) => setSuppressReason(e.target.value)}
                        className="bg-slate-800 border-slate-700"
                      />
                      <Input
                        type="number"
                        placeholder="Duration (days, optional)"
                        value={durationDays}
                        onChange={(e) => setDurationDays(e.target.value)}
                        className="bg-slate-800 border-slate-700"
                      />
                      <div className="text-xs text-slate-400">
                        ⚠️ Suppressions are stored separately from findings (chain-of-custody).
                        {finding.audit_profile === 'REGULATED' && ' Requires admin approval in regulated mode.'}
                      </div>
                      <Button
                        onClick={() => suppressMutation.mutate({
                          finding_id: finding.id,
                          reason: suppressReason,
                          duration_days: durationDays ? parseInt(durationDays) : undefined,
                          action: 'suppress'
                        })}
                        disabled={!suppressReason || suppressMutation.isPending}
                        className="w-full"
                      >
                        Confirm Suppression
                      </Button>
                    </>
                  )}
                  
                  {finding.suppressed && (
                    <>
                      <p className="text-slate-300">
                        This finding was suppressed: {finding.suppression_reason}
                      </p>
                      <Button
                        onClick={() => suppressMutation.mutate({
                          finding_id: finding.id,
                          action: 'unsuppress'
                        })}
                        disabled={suppressMutation.isPending}
                        className="w-full"
                      >
                        Confirm Unsuppression
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}