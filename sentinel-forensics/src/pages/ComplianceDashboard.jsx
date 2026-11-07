import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Shield, Sparkles, Loader2, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, Minus, ExternalLink, Zap,
  Users, Database, Trash2, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { useOrgList } from '../components/hooks/useOrgQuery';
import { aiComplianceAnalysis } from '../functions/aiComplianceAnalysis';
import { createPageUrl } from '../components/utils';
import { useNavigate } from 'react-router-dom';
import ProtectedRoute from '../components/security/ProtectedRoute';
import { DateUtils } from '../components/utils/DateUtils';

export default function ComplianceDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [analysis, setAnalysis] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: devices = [] } = useOrgList('Device', '-last_seen_at', 500);
  const { data: assets = [] } = useOrgList('Asset', '-created_date', 500);

  const { data: retentionPolicies = [] } = useQuery({
    queryKey: ['retention-policies'],
    queryFn: () => base44.entities.DataRetentionPolicy.list()
  });

  const { data: deletionRequests = [] } = useQuery({
    queryKey: ['deletion-requests'],
    queryFn: () => base44.entities.DataDeletionRequest.filter({ status: 'pending' }),
    enabled: user?.role === 'admin'
  });

  const requestDeletionMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('rightToForget', {
        action: 'request_deletion',
        deletion_method: 'complete_removal'
      });
      return data;
    },
    onSuccess: () => {
      toast.success('Deletion Request Submitted', {
        description: 'Your request will be reviewed within 30 days per GDPR requirements'
      });
    }
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await aiComplianceAnalysis({});
      return response.data;
    },
    onSuccess: (data) => {
      setAnalysis(data);
      toast.success('Compliance analysis complete');
    },
    onError: (error) => {
      toast.error('Analysis failed', { description: error.message });
    }
  });

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    if (score >= 50) return 'text-orange-400';
    return 'text-red-400';
  };

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getTrendIcon = (direction) => {
    switch (direction) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'degrading': return <TrendingDown className="w-4 h-4 text-red-400" />;
      default: return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Compliance Dashboard</h1>
          <p className="text-slate-400">AI-powered compliance analysis across all standards</p>
        </div>
        <Button
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {analyzeMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Run AI Analysis
            </>
          )}
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400 mb-1">Total Devices</p>
            <p className="text-2xl font-bold text-white">{devices.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400 mb-1">Total Assets</p>
            <p className="text-2xl font-bold text-white">{assets.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400 mb-1">Compliant Devices</p>
            <p className="text-2xl font-bold text-green-400">
              {devices.filter(d => d.compliance_status === 'compliant').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400 mb-1">Compliance Rate</p>
            <p className="text-2xl font-bold text-white">
              {Math.round((devices.filter(d => d.compliance_status === 'compliant').length / Math.max(devices.length, 1)) * 100)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {!analysis ? (
        <Alert className="bg-purple-500/10 border-purple-500/30">
          <Sparkles className="h-5 w-5 text-purple-400" />
          <AlertDescription className="text-purple-300">
            Run AI analysis to get comprehensive compliance assessment across NIST, CIS, ISO 27001, GDPR, and HIPAA standards.
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-5 bg-slate-900">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="gaps">Gaps</TabsTrigger>
            <TabsTrigger value="remediation">Remediation</TabsTrigger>
            <TabsTrigger value="standards">Standards</TabsTrigger>
            <TabsTrigger value="gdpr">GDPR & Retention</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Overall Score */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Overall Compliance Score</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-center">
                    <div className="relative w-32 h-32">
                      <svg className="w-32 h-32 transform -rotate-90">
                        <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="none" className="text-slate-700" />
                        <circle 
                          cx="64" 
                          cy="64" 
                          r="56" 
                          stroke="currentColor" 
                          strokeWidth="8" 
                          fill="none" 
                          strokeDasharray={`${2 * Math.PI * 56}`}
                          strokeDashoffset={`${2 * Math.PI * 56 * (1 - analysis.analysis.overall_compliance_score / 100)}`}
                          className={getScoreColor(analysis.analysis.overall_compliance_score)}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-3xl font-bold ${getScoreColor(analysis.analysis.overall_compliance_score)}`}>
                          {Math.round(analysis.analysis.overall_compliance_score)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  {analysis.analysis.compliance_trends && (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      {getTrendIcon(analysis.analysis.compliance_trends.direction)}
                      <span className="text-slate-300">{analysis.analysis.compliance_trends.details}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Risk Assessment */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Risk Assessment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {analysis.analysis.risk_assessment && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Overall Risk</span>
                        <Badge className={getSeverityColor(analysis.analysis.risk_assessment.overall_risk)}>
                          {analysis.analysis.risk_assessment.overall_risk}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Regulatory Risk:</span>
                          <span className="text-white">{analysis.analysis.risk_assessment.regulatory_risk}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Operational Risk:</span>
                          <span className="text-white">{analysis.analysis.risk_assessment.operational_risk}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Forensic Integrity:</span>
                          <span className="text-white">{analysis.analysis.risk_assessment.forensic_integrity_risk}</span>
                        </div>
                      </div>
                      {analysis.analysis.risk_assessment.specific_risks && (
                        <div className="pt-2 border-t border-slate-700">
                          <p className="text-xs text-slate-400 mb-2">Specific Risks:</p>
                          <ul className="space-y-1">
                            {analysis.analysis.risk_assessment.specific_risks.slice(0, 5).map((risk, i) => (
                              <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                                <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                                {risk}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Compliance by Category */}
            {analysis.analysis.compliance_by_category && (
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Compliance by Category</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(analysis.analysis.compliance_by_category).map(([category, score]) => (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-300 capitalize">{category.replace(/_/g, ' ')}</span>
                        <span className={`text-sm font-semibold ${getScoreColor(score)}`}>{Math.round(score)}%</span>
                      </div>
                      <Progress value={score} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Gaps Tab */}
          <TabsContent value="gaps" className="space-y-4 mt-4">
            {analysis.analysis.non_compliant_areas && analysis.analysis.non_compliant_areas.length > 0 ? (
              analysis.analysis.non_compliant_areas.map((gap, idx) => (
                <Card key={idx} className="bg-slate-900 border-slate-800">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-white">{gap.area}</h3>
                          <Badge className={getSeverityColor(gap.severity)}>{gap.severity}</Badge>
                          <Badge variant="outline" className="text-xs">{gap.standard}</Badge>
                        </div>
                        <p className="text-sm text-slate-400 mb-2">{gap.requirement}</p>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-slate-500 mb-1">Current State:</p>
                        <p className="text-red-400">{gap.current_state}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Required State:</p>
                        <p className="text-green-400">{gap.required_state}</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <p className="text-sm text-slate-300 mb-2"><strong>Impact:</strong> {gap.impact}</p>
                      <p className="text-xs text-slate-400">Affects {gap.affected_count} systems</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Alert className="bg-green-500/10 border-green-500/30">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <AlertDescription className="text-green-300">
                  No compliance gaps detected! Your organization meets all analyzed standards.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Remediation Tab */}
          <TabsContent value="remediation" className="space-y-4 mt-4">
            {analysis.analysis.remediation_priorities && analysis.analysis.remediation_priorities.length > 0 ? (
              analysis.analysis.remediation_priorities.map((item, idx) => (
                <Card key={idx} className="bg-slate-900 border-slate-800 hover:border-blue-500 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1">
                        <Badge className="bg-blue-500/20 text-blue-400">#{item.priority}</Badge>
                        <h3 className="text-white font-semibold">{item.action}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.automation_available && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                            <Zap className="w-3 h-3 mr-1" />
                            Auto-fix
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{item.effort} effort</Badge>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 mb-3"><strong>Impact:</strong> {item.impact}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Standard: {item.standard}</span>
                      <span className="text-slate-400">Timeframe: {item.timeframe}</span>
                    </div>
                    {item.workflow_link && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                        onClick={() => navigate(createPageUrl(item.workflow_link))}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Go to Workflow
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-slate-400 text-center py-8">No remediation actions needed.</p>
            )}

            {analysis.analysis.recommendations && analysis.analysis.recommendations.length > 0 && (
              <Card className="bg-blue-500/10 border-blue-500/30">
                <CardHeader>
                  <CardTitle className="text-blue-400 text-lg">Strategic Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysis.analysis.recommendations.map((rec, i) => (
                      <li key={i} className="text-sm text-blue-300 flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Standards Tab */}
          <TabsContent value="standards" className="space-y-4 mt-4">
            {analysis.analysis.standard_compliance && analysis.analysis.standard_compliance.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {analysis.analysis.standard_compliance.map((standard, idx) => (
                  <Card key={idx} className="bg-slate-900 border-slate-800">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white">{standard.standard}</CardTitle>
                        <Badge className={
                          standard.status === 'compliant' ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                          standard.status === 'partially_compliant' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                          'bg-red-500/20 text-red-400 border-red-500/50'
                        }>
                          {standard.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-slate-400">Compliance Score</span>
                          <span className={`text-lg font-bold ${getScoreColor(standard.score)}`}>
                            {Math.round(standard.score)}%
                          </span>
                        </div>
                        <Progress value={standard.score} className="h-2" />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500">Total Gaps</p>
                          <p className="text-white font-semibold">{standard.gaps_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Critical</p>
                          <p className="text-red-400 font-semibold">{standard.critical_gaps || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">No standard compliance data available.</p>
            )}
          </TabsContent>

          {/* GDPR & Retention Tab */}
          <TabsContent value="gdpr" className="space-y-6">
            <Alert className="bg-blue-500/10 border-blue-500/30">
              <Shield className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-300">
                <strong>GDPR Compliance:</strong> Users have the right to data portability, erasure, and access. 
                All data deletion requests are logged and require admin review within 30 days.
              </AlertDescription>
            </Alert>

            {/* Data Retention Policies */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Active Retention Policies</CardTitle>
              </CardHeader>
              <CardContent>
                {retentionPolicies.length === 0 ? (
                  <div className="text-center py-12">
                    <Database className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <p className="text-slate-400">No retention policies configured</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {retentionPolicies.map(policy => (
                      <div key={policy.id} className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-semibold text-white">{policy.policy_name}</h4>
                            <p className="text-sm text-slate-400">{policy.data_category?.replace('_', ' ')}</p>
                          </div>
                          <Badge className={policy.auto_delete_enabled ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}>
                            {policy.auto_delete_enabled ? 'Auto-Delete' : 'Archive Only'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500">Retention Period</p>
                            <p className="text-white font-semibold">{policy.retention_period_days} days</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Records Archived</p>
                            <p className="text-white font-semibold">{policy.records_archived || 0}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Records Deleted</p>
                            <p className="text-white font-semibold">{policy.records_deleted || 0}</p>
                          </div>
                        </div>
                        {policy.last_enforcement && (
                          <p className="text-xs text-slate-500 mt-2">
                            Last enforced: {DateUtils.safeFormatDateTime(policy.last_enforcement)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* GDPR Deletion Requests */}
            {user?.role !== 'admin' && (
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Request Data Deletion</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-slate-400 text-sm">
                    You have the right to request deletion of your personal data under GDPR. 
                    This will permanently remove all your cases, evidence, and associated records.
                  </p>
                  <Alert className="bg-red-900/20 border-red-500/30">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <AlertDescription className="text-red-300">
                      <strong>Warning:</strong> This action is permanent and cannot be undone. 
                      All your forensic data will be deleted after admin review.
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={() => requestDeletionMutation.mutate()}
                    disabled={requestDeletionMutation.isPending}
                    variant="outline"
                    className="border-red-700 text-red-400 hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Request Account Deletion
                  </Button>
                </CardContent>
              </Card>
            )}

            {user?.role === 'admin' && (
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">
                    Pending Deletion Requests ({deletionRequests.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deletionRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
                      <p className="text-slate-400">No pending deletion requests</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {deletionRequests.map(request => (
                        <div key={request.id} className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold text-white">{request.user_email}</p>
                              <p className="text-sm text-slate-400">
                                Requested: {DateUtils.safeFormatDateTime(request.requested_at)}
                              </p>
                              <p className="text-sm text-slate-400">
                                Method: {request.deletion_method?.replace('_', ' ')}
                              </p>
                            </div>
                            <Badge className="bg-yellow-500/20 text-yellow-400">
                              Pending Review
                            </Badge>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await base44.functions.invoke('rightToForget', {
                                    action: 'execute_deletion',
                                    user_email_to_delete: request.user_email,
                                    deletion_method: request.deletion_method
                                  });
                                  queryClient.invalidateQueries({ queryKey: ['deletion-requests'] });
                                  toast.success('Deletion completed');
                                } catch (error) {
                                  toast.error('Deletion failed', { description: error.message });
                                }
                              }}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              <Trash2 className="w-3 h-3 mr-2" />
                              Execute Deletion
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                await base44.entities.DataDeletionRequest.update(request.id, {
                                  status: 'rejected',
                                  reviewed_by: user.email,
                                  reviewed_at: new Date().toISOString()
                                });
                                queryClient.invalidateQueries({ queryKey: ['deletion-requests'] });
                                toast.success('Request rejected');
                              }}
                              className="border-slate-700"
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}