import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock,
  HardDrive,
  Wifi,
  Download,
  Sparkles,
  Loader2,
  Target,
  Zap,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { aiSecurityPostureAnalysis } from '../../functions/aiSecurityPostureAnalysis';

export default function DevicePostureAssessment({ device }) {
  const [analysis, setAnalysis] = useState(device.posture_analysis_data || null);
  const securityProfile = device.security_profile || {};
  const deviceInfo = device.device_info || {};

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await aiSecurityPostureAnalysis({ device_id: device.device_id });
      return response.data;
    },
    onSuccess: (data) => {
      setAnalysis(data.analysis);
      toast.success('Security posture analysis complete');
    },
    onError: (error) => {
      toast.error('Analysis failed', { description: error.message });
    }
  });
  
  const postureChecks = [
    {
      name: 'Disk Encryption',
      status: securityProfile.disk_encrypted,
      icon: Lock,
      severity: 'critical'
    },
    {
      name: 'Firewall Enabled',
      status: securityProfile.firewall_enabled,
      icon: Shield,
      severity: 'high'
    },
    {
      name: 'OS Up-to-date',
      status: securityProfile.os_patched,
      icon: Download,
      severity: 'high'
    },
    {
      name: 'Anti-malware Active',
      status: securityProfile.antimalware_running,
      icon: Shield,
      severity: 'critical'
    },
    {
      name: 'Secure Boot',
      status: securityProfile.secure_boot_enabled,
      icon: HardDrive,
      severity: 'medium'
    },
    {
      name: 'VPN Connection',
      status: securityProfile.vpn_connected,
      icon: Wifi,
      severity: 'low'
    }
  ];

  const passedChecks = postureChecks.filter(c => c.status).length;
  const totalChecks = postureChecks.length;
  const complianceScore = Math.round((passedChecks / totalChecks) * 100);

  const getComplianceLevel = (score) => {
    if (score >= 90) return { level: 'Compliant', color: 'text-green-400', bg: 'bg-green-500/20' };
    if (score >= 70) return { level: 'Mostly Compliant', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
    return { level: 'Non-Compliant', color: 'text-red-400', bg: 'bg-red-500/20' };
  };

  const compliance = getComplianceLevel(complianceScore);

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Security Posture Assessment
          </CardTitle>
          <Button
            size="sm"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {analyzeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1" />
                AI Analysis
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Compliance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Compliance Score</span>
            <Badge className={`${compliance.bg} ${compliance.color}`}>
              {compliance.level}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={complianceScore} className="flex-1" />
            <span className={`text-2xl font-bold ${compliance.color}`}>{complianceScore}%</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {passedChecks} of {totalChecks} security checks passed
          </p>
        </div>

        {/* Security Checks */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-white">Security Controls</h4>
          {postureChecks.map((check, idx) => {
            const Icon = check.icon;
            const StatusIcon = check.status ? CheckCircle : XCircle;
            const statusColor = check.status ? 'text-green-400' : 'text-red-400';
            
            return (
              <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/50 rounded">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-300">{check.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {!check.status && check.severity === 'critical' && (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                      Critical
                    </Badge>
                  )}
                  <StatusIcon className={`w-4 h-4 ${statusColor}`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Vulnerabilities */}
        {securityProfile.known_vulnerabilities && securityProfile.known_vulnerabilities.length > 0 && (
          <div className="p-3 bg-red-950/20 border border-red-500/30 rounded">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-semibold text-sm">Known Vulnerabilities</span>
            </div>
            <div className="space-y-1">
              {securityProfile.known_vulnerabilities.slice(0, 3).map((vuln, idx) => (
                <div key={idx} className="text-xs text-slate-400">
                  • {vuln.cve_id || vuln.name} - {vuln.severity}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Analysis Section */}
        {!analysis ? (
          <Alert className="bg-purple-500/10 border-purple-500/30">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <AlertDescription className="text-purple-300 text-xs">
              Run AI analysis to detect baseline deviations, analyze misconfiguration impact, and get prioritized remediation steps.
            </AlertDescription>
          </Alert>
        ) : (
          <Tabs defaultValue="deviations" className="w-full">
            <TabsList className="grid grid-cols-3 bg-slate-800">
              <TabsTrigger value="deviations">Deviations</TabsTrigger>
              <TabsTrigger value="impact">Impact</TabsTrigger>
              <TabsTrigger value="remediation">Fix</TabsTrigger>
            </TabsList>

            {/* Baseline Deviations */}
            <TabsContent value="deviations" className="space-y-3 mt-4">
              {analysis.risk_score !== undefined && (
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">Security Risk Score</span>
                    <Badge className={getSeverityColor(analysis.risk_score > 70 ? 'critical' : analysis.risk_score > 40 ? 'high' : 'medium')}>
                      {analysis.risk_score > 70 ? 'Critical' : analysis.risk_score > 40 ? 'High' : 'Medium'} Risk
                    </Badge>
                  </div>
                  <Progress value={analysis.risk_score} className="h-2" />
                  <p className="text-xl font-bold text-red-400 mt-2">{analysis.risk_score}/100</p>
                </div>
              )}

              {analysis.baseline_deviations && analysis.baseline_deviations.length > 0 ? (
                analysis.baseline_deviations.map((dev, idx) => (
                  <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-semibold text-white">{dev.control}</span>
                      <Badge className={getSeverityColor(dev.deviation_severity)}>
                        {dev.deviation_severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-300 mb-2">{dev.description}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">Baseline:</p>
                        <p className="text-green-400 font-mono">{dev.baseline_value}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Current:</p>
                        <p className="text-red-400 font-mono">{dev.current_value}</p>
                      </div>
                    </div>
                    {dev.cis_reference && (
                      <p className="text-xs text-blue-400 mt-2">CIS: {dev.cis_reference}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No baseline deviations detected.</p>
              )}
            </TabsContent>

            {/* Misconfiguration Impact */}
            <TabsContent value="impact" className="space-y-3 mt-4">
              {analysis.misconfiguration_impact && analysis.misconfiguration_impact.length > 0 ? (
                analysis.misconfiguration_impact.map((impact, idx) => (
                  <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-semibold text-white">{impact.misconfiguration}</span>
                      <Badge className={getSeverityColor(impact.exploitability)}>
                        {impact.exploitability}
                      </Badge>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="text-orange-400 font-semibold">Forensic Integrity:</p>
                        <p className="text-slate-300">{impact.forensic_integrity_impact}</p>
                      </div>
                      <div>
                        <p className="text-red-400 font-semibold">Attack Surface:</p>
                        <p className="text-slate-300">{impact.attack_surface_impact}</p>
                      </div>
                      <div>
                        <p className="text-yellow-400 font-semibold">Compliance:</p>
                        <p className="text-slate-300">{impact.compliance_impact}</p>
                      </div>
                      {impact.business_impact && (
                        <div>
                          <p className="text-purple-400 font-semibold">Business Impact:</p>
                          <p className="text-slate-300">{impact.business_impact}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No impact analysis available.</p>
              )}

              {analysis.attack_scenarios && analysis.attack_scenarios.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4 text-red-400" />
                    Attack Scenarios
                  </h4>
                  {analysis.attack_scenarios.map((scenario, idx) => (
                    <div key={idx} className="p-2 bg-red-950/20 border border-red-500/30 rounded text-xs mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-red-300 font-semibold">{scenario.scenario}</span>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[10px]">{scenario.likelihood}</Badge>
                          <Badge className={getSeverityColor(scenario.impact)}>{scenario.impact}</Badge>
                        </div>
                      </div>
                      <p className="text-slate-400 mb-1">{scenario.mitigation}</p>
                      {scenario.enabled_by && scenario.enabled_by.length > 0 && (
                        <p className="text-slate-500">Enabled by: {scenario.enabled_by.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Prioritized Remediation */}
            <TabsContent value="remediation" className="space-y-3 mt-4">
              {analysis.prioritized_remediation && analysis.prioritized_remediation.length > 0 ? (
                analysis.prioritized_remediation.map((step, idx) => (
                  <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-500/20 text-blue-400">#{step.priority}</Badge>
                        <span className="text-sm font-semibold text-white">{step.step}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{step.implementation_difficulty}</Badge>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Risk Reduction: {step.risk_reduction}</span>
                        <span>Time: {step.estimated_time}</span>
                      </div>
                      {step.commands && step.commands.length > 0 && (
                        <div>
                          <p className="text-slate-400 font-semibold mb-1">Commands:</p>
                          <div className="bg-slate-900 p-2 rounded border border-slate-700">
                            {step.commands.map((cmd, i) => (
                              <code key={i} className="block text-green-400 font-mono text-xs">{cmd}</code>
                            ))}
                          </div>
                        </div>
                      )}
                      {step.validation && (
                        <p className="text-blue-400"><strong>Validation:</strong> {step.validation}</p>
                      )}
                      {step.rollback_plan && (
                        <p className="text-yellow-400"><strong>Rollback:</strong> {step.rollback_plan}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No remediation steps available.</p>
              )}

              {analysis.forensic_integrity_risk && (
                <Alert className="bg-orange-500/10 border-orange-500/30">
                  <AlertTriangle className="h-4 w-4 text-orange-400" />
                  <AlertDescription>
                    <p className="text-orange-400 font-semibold text-xs mb-1">
                      Forensic Integrity Risk: {analysis.forensic_integrity_risk.risk_level}
                    </p>
                    <p className="text-xs text-orange-300 mb-2">{analysis.forensic_integrity_risk.chain_of_custody_impact}</p>
                    {analysis.forensic_integrity_risk.specific_risks && (
                      <ul className="list-disc list-inside text-xs text-orange-200">
                        {analysis.forensic_integrity_risk.specific_risks.map((risk, i) => (
                          <li key={i}>{risk}</li>
                        ))}
                      </ul>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}