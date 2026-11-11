import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  Activity,
  Target,
  FileCheck,
  TrendingUp,
  Bell,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import AutomatedPenTest from '../components/security/AutomatedPenTest';

const AGENTS = [
  {
    id: 'security_monitor',
    name: 'Security Monitor Agent',
    icon: Shield,
    color: 'bg-red-500/20 text-red-400',
    description: 'Real-time threat detection and response',
    status: 'active'
  },
  {
    id: 'validator_agent',
    name: 'Sentinel Validator Agent',
    icon: FileCheck,
    color: 'bg-blue-500/20 text-blue-400',
    description: 'Data integrity and schema validation',
    status: 'active'
  },
  {
    id: 'redteam_agent',
    name: 'Red Team Agent',
    icon: Target,
    color: 'bg-purple-500/20 text-purple-400',
    description: 'Weekly penetration testing and vulnerability discovery',
    status: 'active'
  },
  {
    id: 'compliance_agent',
    name: 'Compliance Audit Agent',
    icon: FileCheck,
    color: 'bg-green-500/20 text-green-400',
    description: 'OWASP, SOC 2, HIPAA, and GDPR compliance monitoring',
    status: 'active'
  },
  {
    id: 'forensic_chain_agent',
    name: 'Forensic Chain Agent',
    icon: Shield,
    color: 'bg-yellow-500/20 text-yellow-400',
    description: 'Chain-of-custody integrity monitoring',
    status: 'active'
  },
  {
    id: 'performance_agent',
    name: 'Performance Agent',
    icon: TrendingUp,
    color: 'bg-indigo-500/20 text-indigo-400',
    description: 'System performance profiling and optimization',
    status: 'active'
  },
  {
    id: 'alert_router_agent',
    name: 'Alert Router Agent',
    icon: Bell,
    color: 'bg-pink-500/20 text-pink-400',
    description: 'Intelligent alert routing and escalation',
    status: 'active'
  }
];

export default function AgentsDashboard() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: recentLogs = [] } = useQuery({
    queryKey: ['agent-activity'],
    queryFn: async () => {
      try {
        return await resilientAPI.filterEntity(
          'AuditLog',
          {
            event_type: {
              $in: [
                'automated_pentest_completed',
                'audit_chain_verified',
                'compliance_check_passed',
                'data_validation_passed',
                'performance_alert_created',
                'alert_routed'
              ]
            }
          },
          '-timestamp',
          10,
          0,
          15000
        );
      } catch (error) {
        console.error('Failed to load agent activity:', error);
        return [];
      }
    },
    enabled: !!user && user.role === 'admin',
    retry: 1,
    staleTime: 60000
  });

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <Alert className="bg-red-900/20 border-red-500/30 max-w-2xl mx-auto">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-red-200">
            <strong className="block mb-2">Admin Access Required</strong>
            <p>This dashboard is only accessible to administrators.</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Autonomous Agents Dashboard</h1>
          <p className="text-slate-400">AI-powered security, validation, and monitoring agents</p>
        </div>

        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENTS.map((agent) => {
            const Icon = agent.icon;
            
            return (
              <Card key={agent.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${agent.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-1">{agent.name}</h3>
                      <p className="text-xs text-slate-400">{agent.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge className={
                      agent.status === 'active' 
                        ? 'bg-green-500/20 text-green-400 border-green-500/50'
                        : 'bg-slate-500/20 text-slate-400 border-slate-500/50'
                    }>
                      <Activity className="w-3 h-3 mr-1" />
                      {agent.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Automated Penetration Testing */}
        <AutomatedPenTest onComplete={(data) => {
          console.log('PenTest completed:', data);
        }} />

        {/* Recent Agent Activity */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Recent Agent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <p className="text-center text-slate-400 py-6">
                No recent agent activity
              </p>
            ) : (
              <div className="space-y-2">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {log.success ? (
                        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-white">{log.description}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(log.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge className={
                      log.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                      log.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-blue-500/20 text-blue-300'
                    }>
                      {log.event_type}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card className="bg-gradient-to-br from-green-900/30 to-blue-900/30 border-green-500/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-12 h-12 text-green-400" />
              <div>
                <h3 className="text-xl font-bold text-white">All Agents Operational</h3>
                <p className="text-sm text-green-200">
                  {AGENTS.length} autonomous agents actively monitoring and protecting your system
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}