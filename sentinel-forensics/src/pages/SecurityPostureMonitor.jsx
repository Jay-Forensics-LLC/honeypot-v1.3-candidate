import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  FileText,
  Zap,
  Target,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/components/utils';
import { executeSecurityPostureScan } from '@/functions/executeSecurityPostureScan';

/**
 * SECURITY POSTURE MONITOR
 * Continuous scanning, compliance drift detection, automated remediation
 */
export default function SecurityPostureMonitor() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [selectedScan, setSelectedScan] = useState(null);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);

  // Fetch recent scans
  const { data: scans = [], isLoading: scansLoading } = useQuery({
    queryKey: ['security-posture-scans', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.SecurityPostureScan.filter({
        organization_id: user.organization_id
      }, '-started_at', 20);
    },
    enabled: !!user?.organization_id,
    refetchInterval: 10000 // Refresh every 10s for running scans
  });

  // Fetch findings
  const { data: findings = [] } = useQuery({
    queryKey: ['security-findings', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.SecurityFinding.filter({
        organization_id: user.organization_id,
        status: 'open'
      }, '-first_detected', 100);
    },
    enabled: !!user?.organization_id
  });

  // Fetch compliance baselines
  const { data: baselines = [] } = useQuery({
    queryKey: ['compliance-baselines', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.ComplianceBaseline.filter({
        organization_id: user.organization_id,
        is_active: true
      });
    },
    enabled: !!user?.organization_id
  });

  // Fetch remediation policies
  const { data: policies = [] } = useQuery({
    queryKey: ['remediation-policies', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.RemediationPolicy.filter({
        organization_id: user.organization_id
      });
    },
    enabled: !!user?.organization_id
  });

  // Execute scan mutation
  const scanMutation = useMutation({
    mutationFn: async (scanType) => {
      const response = await executeSecurityPostureScan({
        scan_type: scanType,
        trigger_type: 'manual'
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['security-posture-scans']);
      queryClient.invalidateQueries(['security-findings']);
      toast.success('Security scan started');
    }
  });

  // Create policy mutation
  const createPolicyMutation = useMutation({
    mutationFn: async (policyData) => {
      return await base44.entities.RemediationPolicy.create({
        ...policyData,
        organization_id: user.organization_id,
        created_by: user.email,
        version: '1.0'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['remediation-policies']);
      setPolicyDialogOpen(false);
      toast.success('Remediation policy created');
    }
  });

  // Calculate overall risk score
  const riskScore = findings.reduce((score, f) => {
    const weights = { critical: 10, high: 5, medium: 2, low: 1 };
    return score + (weights[f.severity] || 0);
  }, 0);

  const maxRisk = findings.length * 10;
  const riskPercent = maxRisk > 0 ? Math.min((riskScore / maxRisk) * 100, 100) : 0;

  // Group findings by severity
  const findingsBySeverity = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0 });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const handlePolicySubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    createPolicyMutation.mutate({
      name: formData.get('name'),
      description: formData.get('description'),
      approval_mode: formData.get('approval_mode'),
      condition: {
        finding_types: [formData.get('finding_type')],
        severities: [formData.get('severity')]
      },
      action: {
        action_type: formData.get('action_type'),
        action_config: {}
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Security Posture Management</h1>
            <p className="text-gray-400">Continuous monitoring, compliance drift detection, automated remediation</p>
          </div>
          
          <div className="flex gap-2">
            <Dialog open={policyDialogOpen} onOpenChange={setPolicyDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-slate-700 text-gray-400">
                  <Settings className="w-4 h-4 mr-2" />
                  New Policy
                </Button>
              </DialogTrigger>
              
              <DialogContent className="bg-slate-900 border-slate-800 max-w-xl">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Remediation Policy</DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handlePolicySubmit} className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Policy Name</label>
                    <Input
                      name="name"
                      placeholder="e.g., Auto-fix weak authentication"
                      required
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Description</label>
                    <Textarea
                      name="description"
                      placeholder="Describe when and how this policy applies"
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Finding Type</label>
                    <Select name="finding_type" defaultValue="weak_auth">
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="weak_auth">Weak Authentication</SelectItem>
                        <SelectItem value="misconfiguration">Misconfiguration</SelectItem>
                        <SelectItem value="vulnerability">Vulnerability</SelectItem>
                        <SelectItem value="excessive_permissions">Excessive Permissions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Severity</label>
                    <Select name="severity" defaultValue="high">
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Approval Mode</label>
                    <Select name="approval_mode" defaultValue="alert_only">
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="alert_only">Alert Only (No Action)</SelectItem>
                        <SelectItem value="human_approval">Require Approval</SelectItem>
                        <SelectItem value="automatic">Fully Automatic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Action Type</label>
                    <Select name="action_type" defaultValue="config_change">
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="config_change">Configuration Change</SelectItem>
                        <SelectItem value="patch">Apply Patch</SelectItem>
                        <SelectItem value="permission_revoke">Revoke Permission</SelectItem>
                        <SelectItem value="service_restart">Restart Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setPolicyDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-red-600 hover:bg-red-700">
                      Create Policy
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            
            <Button 
              onClick={() => scanMutation.mutate('system_config')}
              disabled={scanMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {scanMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Scan
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Risk Score Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-red-950/50 to-slate-900 border-red-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Overall Risk Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-white mb-2">{riskPercent.toFixed(0)}%</div>
              <Progress value={riskPercent} className="h-2" />
              <p className="text-xs text-gray-500 mt-2">Based on {findings.length} open findings</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Critical Findings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-red-500">{findingsBySeverity.critical}</div>
              <p className="text-xs text-gray-500 mt-2">Immediate action required</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">High Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-orange-500">{findingsBySeverity.high}</div>
              <p className="text-xs text-gray-500 mt-2">Needs attention soon</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Active Policies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-blue-500">{policies.filter(p => p.is_enabled).length}</div>
              <p className="text-xs text-gray-500 mt-2">Automation rules active</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="findings" className="w-full">
          <TabsList className="bg-slate-900 border-slate-800">
            <TabsTrigger value="findings" className="data-[state=active]:bg-red-600">
              <Target className="w-4 h-4 mr-2" />
              Findings ({findings.length})
            </TabsTrigger>
            <TabsTrigger value="scans" className="data-[state=active]:bg-red-600">
              <Activity className="w-4 h-4 mr-2" />
              Scan History
            </TabsTrigger>
            <TabsTrigger value="policies" className="data-[state=active]:bg-red-600">
              <Zap className="w-4 h-4 mr-2" />
              Remediation Policies ({policies.length})
            </TabsTrigger>
            <TabsTrigger value="baselines" className="data-[state=active]:bg-red-600">
              <Shield className="w-4 h-4 mr-2" />
              Compliance Baselines ({baselines.length})
            </TabsTrigger>
          </TabsList>

          {/* Findings Tab */}
          <TabsContent value="findings" className="space-y-4">
            {findings.length === 0 ? (
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="py-12 text-center">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <p className="text-white text-lg mb-2">No Open Findings</p>
                  <p className="text-gray-400">Security posture looks good</p>
                </CardContent>
              </Card>
            ) : (
              findings.map((finding) => (
                <Card key={finding.id} className="bg-slate-900 border-slate-800 hover:border-red-600 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Badge className={
                            finding.severity === 'critical' ? 'bg-red-600' :
                            finding.severity === 'high' ? 'bg-orange-600' :
                            finding.severity === 'medium' ? 'bg-yellow-600' :
                            'bg-blue-600'
                          }>
                            {finding.severity}
                          </Badge>
                          <h3 className="text-white font-semibold">{finding.title}</h3>
                          {finding.auto_remediable && (
                            <Badge variant="outline" className="border-green-700 text-green-400">
                              <Zap className="w-3 h-3 mr-1" />
                              Auto-fix available
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-gray-400 text-sm mb-3">{finding.description}</p>
                        
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-500">Impact:</span>
                            <span className="text-gray-300 ml-2">{finding.impact}</span>
                          </div>
                          
                          {finding.affected_assets && finding.affected_assets.length > 0 && (
                            <div>
                              <span className="text-gray-500">Affected:</span>
                              <div className="ml-2 mt-1 flex flex-wrap gap-2">
                                {finding.affected_assets.map((asset, idx) => (
                                  <Badge key={idx} variant="outline" className="border-slate-700 text-gray-400">
                                    {asset.asset_name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {finding.remediation_steps && finding.remediation_steps.length > 0 && (
                            <div>
                              <span className="text-gray-500">Remediation:</span>
                              <ul className="ml-6 mt-1 list-disc text-gray-400 space-y-1">
                                {finding.remediation_steps.slice(0, 3).map((step, idx) => (
                                  <li key={idx}>{step}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 ml-4">
                        <Button size="sm" className="bg-red-600 hover:bg-red-700">
                          Remediate
                        </Button>
                        <Button size="sm" variant="outline" className="border-slate-700">
                          Suppress
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Scans Tab */}
          <TabsContent value="scans" className="space-y-4">
            {scansLoading ? (
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="py-12 text-center text-gray-400">
                  Loading scans...
                </CardContent>
              </Card>
            ) : scans.length === 0 ? (
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="py-12 text-center">
                  <Activity className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No scans run yet. Click "Run Scan" to start.</p>
                </CardContent>
              </Card>
            ) : (
              scans.map((scan) => (
                <Card key={scan.id} className="bg-slate-900 border-slate-800">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {getStatusIcon(scan.status)}
                          <span className="text-white font-semibold">
                            {scan.scan_type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <Badge variant="outline" className="border-slate-700 text-gray-400">
                            {scan.trigger_type}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-400">
                          <div>
                            <span className="text-gray-500">Started:</span>
                            <div>{formatRelativeTime(scan.started_at)}</div>
                          </div>
                          
                          {scan.completed_at && (
                            <div>
                              <span className="text-gray-500">Duration:</span>
                              <div>{scan.duration_ms ? `${(scan.duration_ms / 1000).toFixed(1)}s` : 'N/A'}</div>
                            </div>
                          )}
                          
                          {scan.findings_count && (
                            <>
                              <div>
                                <span className="text-red-500">Critical:</span>
                                <span className="ml-2 text-white">{scan.findings_count.critical}</span>
                              </div>
                              <div>
                                <span className="text-orange-500">High:</span>
                                <span className="ml-2 text-white">{scan.findings_count.high}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Policies Tab */}
          <TabsContent value="policies" className="space-y-4">
            {policies.length === 0 ? (
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="py-12 text-center">
                  <Zap className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">No remediation policies configured</p>
                  <Button onClick={() => setPolicyDialogOpen(true)} className="bg-red-600 hover:bg-red-700">
                    Create First Policy
                  </Button>
                </CardContent>
              </Card>
            ) : (
              policies.map((policy) => (
                <Card key={policy.id} className="bg-slate-900 border-slate-800">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-semibold">{policy.name}</h3>
                          <Badge className={
                            policy.approval_mode === 'automatic' ? 'bg-green-600' :
                            policy.approval_mode === 'human_approval' ? 'bg-yellow-600' :
                            'bg-blue-600'
                          }>
                            {policy.approval_mode.replace(/_/g, ' ')}
                          </Badge>
                          {policy.is_enabled && (
                            <Badge variant="outline" className="border-green-700 text-green-400">
                              Active
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-gray-400 text-sm mb-3">{policy.description}</p>
                        
                        <div className="flex gap-6 text-sm">
                          <div>
                            <span className="text-gray-500">Executions:</span>
                            <span className="text-white ml-2">{policy.execution_count || 0}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Success:</span>
                            <span className="text-green-400 ml-2">{policy.success_count || 0}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Failed:</span>
                            <span className="text-red-400 ml-2">{policy.failure_count || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Baselines Tab */}
          <TabsContent value="baselines" className="space-y-4">
            {baselines.length === 0 ? (
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="py-12 text-center">
                  <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No compliance baselines configured</p>
                </CardContent>
              </Card>
            ) : (
              baselines.map((baseline) => (
                <Card key={baseline.id} className="bg-slate-900 border-slate-800">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-semibold">{baseline.name}</h3>
                          <Badge className="bg-blue-600">
                            {baseline.profile_type.toUpperCase()}
                          </Badge>
                          {baseline.is_active && (
                            <Badge variant="outline" className="border-green-700 text-green-400">
                              Active
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-gray-400 text-sm">{baseline.description}</p>
                        
                        {baseline.controls && (
                          <div className="mt-2 text-sm text-gray-500">
                            {baseline.controls.length} controls defined
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}