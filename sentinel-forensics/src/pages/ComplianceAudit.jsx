import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  Lock,
  Eye,
  Activity,
  Info,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import { toast } from 'sonner';
import React from 'react';

const COMPLIANCE_FRAMEWORKS = [
  {
    id: 'gdpr',
    name: 'GDPR',
    description: 'General Data Protection Regulation',
    icon: Shield,
    checks: [
      'Right to deletion implemented',
      'Data retention policies enforced',
      'Consent tracking active',
      'Data encryption at rest (AES-256)',
      'Privacy policy accessible'
    ]
  },
  {
    id: 'hipaa',
    name: 'HIPAA',
    description: 'Health Insurance Portability and Accountability Act',
    icon: Lock,
    checks: [
      'PHI encryption (AES-256-GCM)',
      'Audit logging enabled',
      'Access controls enforced',
      'Breach notification system',
      'Business associate agreements'
    ]
  },
  {
    id: 'soc2',
    name: 'SOC 2',
    description: 'Service Organization Control 2',
    icon: FileCheck,
    checks: [
      'Security controls documented',
      'Change management process',
      'Incident response plan',
      'Vendor risk management',
      'Continuous monitoring active'
    ]
  },
  {
    id: 'owasp',
    name: 'OWASP Top 10',
    description: 'Web Application Security',
    icon: Shield,
    checks: [
      'Input validation on all forms',
      'SQL injection protection',
      'XSS protection enabled',
      'CSRF tokens implemented',
      'Authentication & session management secure'
    ]
  },
  {
    id: 'ccpa',
    name: 'CCPA',
    description: 'California Consumer Privacy Act',
    icon: Eye,
    checks: [
      'Data transparency provided',
      'Opt-out mechanisms',
      'Data deletion on request',
      'Third-party disclosure tracking',
      'Consumer rights notices'
    ]
  },
  {
    id: 'cfaa',
    name: 'CFAA Compliance',
    description: 'Computer Fraud and Abuse Act',
    icon: AlertTriangle,
    checks: [
      'Authorization disclaimers',
      'Explicit consent required',
      'Authorized testing only',
      'Legal use warnings',
      'Audit trail for access'
    ]
  }
];

export default function ComplianceAudit() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: complianceChecks = [], isLoading, refetch } = useQuery({
    queryKey: ['compliance-checks'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('ComplianceCheck', '-last_check_date', 50, 15000);
      } catch (error) {
        console.error('Failed to load compliance checks:', error);
        return [];
      }
    },
    enabled: !!user,
    retry: 1,
    staleTime: 60000
  });

  const [isRunningChecks, setIsRunningChecks] = React.useState(false);

  const runComplianceChecks = async () => {
    setIsRunningChecks(true);
    try {
      await base44.functions.invoke('runComplianceChecks', {});
      await refetch();
      toast.success('Compliance checks completed');
    } catch (error) {
      console.error('Failed to run compliance checks:', error);
      toast.error('Failed to run compliance checks');
    } finally {
      setIsRunningChecks(false);
    }
  };

  const getComplianceScore = (frameworkId) => {
    const checks = complianceChecks.filter(c => c.regulation === frameworkId);
    if (checks.length === 0) return 0;
    
    const compliant = checks.filter(c => c.compliance_status === 'compliant').length;
    return (compliant / checks.length) * 100;
  };

  const overallScore = COMPLIANCE_FRAMEWORKS.reduce((sum, fw) => sum + getComplianceScore(fw.id), 0) / COMPLIANCE_FRAMEWORKS.length;

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <Alert className="bg-red-900/20 border-red-500/30 max-w-2xl mx-auto">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-red-200">
            <strong className="block mb-2">Admin Access Required</strong>
            <p>This page is only accessible to administrators.</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Compliance Audit Dashboard</h1>
            <p className="text-slate-400">Real-time compliance monitoring and validation</p>
          </div>
          <Button 
            onClick={runComplianceChecks}
            disabled={isRunningChecks}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isRunningChecks ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Checks...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Run Compliance Checks
              </>
            )}
          </Button>
        </div>

        {/* Overall Score */}
        <Card className="bg-gradient-to-br from-green-900/30 to-blue-900/30 border-green-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-white mb-1">
                  Overall Compliance Score
                </h3>
                <p className="text-sm text-green-200">
                  Across {COMPLIANCE_FRAMEWORKS.length} frameworks
                </p>
              </div>
              <div className="text-right">
                <p className="text-5xl font-bold text-green-400">
                  {overallScore.toFixed(0)}%
                </p>
              </div>
            </div>
            <Progress value={overallScore} className="h-3" />
          </CardContent>
        </Card>

        {/* Framework Grids */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {COMPLIANCE_FRAMEWORKS.map((framework) => {
            const Icon = framework.icon;
            const score = getComplianceScore(framework.id);
            const isCompliant = score >= 80;

            return (
              <Card key={framework.id} className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isCompliant ? 'bg-green-500/20' : 'bg-yellow-500/20'
                      }`}>
                        <Icon className={`w-5 h-5 ${
                          isCompliant ? 'text-green-400' : 'text-yellow-400'
                        }`} />
                      </div>
                      <div>
                        <CardTitle className="text-white text-lg">
                          {framework.name}
                        </CardTitle>
                        <p className="text-xs text-slate-400">{framework.description}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-400">Compliance</span>
                      <span className="text-lg font-bold text-white">{score.toFixed(0)}%</span>
                    </div>
                    <Progress value={score} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    {framework.checks.map((check, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-300">{check}</p>
                      </div>
                    ))}
                  </div>

                  <Badge className={
                    isCompliant
                      ? 'bg-green-500/20 text-green-300 w-full justify-center'
                      : 'bg-yellow-500/20 text-yellow-300 w-full justify-center'
                  }>
                    {isCompliant ? 'COMPLIANT' : 'NEEDS ATTENTION'}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Compliance Events */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Recent Compliance Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            ) : complianceChecks.length === 0 ? (
              <div className="text-center py-8">
                <Info className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-slate-400">No compliance checks recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {complianceChecks.slice(0, 10).map((check) => (
                  <div
                    key={check.id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {check.compliance_status === 'compliant' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                      )}
                      <div>
                        <p className="font-medium text-white">
                          {check.regulation.toUpperCase()} - {check.check_type}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(check.last_check_date).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge className={
                      check.compliance_status === 'compliant'
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-yellow-500/20 text-yellow-300'
                    }>
                      {check.compliance_status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}