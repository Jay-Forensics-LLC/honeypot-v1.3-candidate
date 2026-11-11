
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings,
  Mail,
  Globe,
  Key,
  Shield,
  CreditCard,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

const ADMIN_TASKS = [
  {
    id: 'smtp_config',
    category: 'Email',
    icon: Mail,
    title: 'Configure SMTP Credentials',
    description: 'Required for sending alert emails and report exports',
    required_env_vars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'],
    priority: 'high',
    test_endpoint: 'testSMTP'
  },
  {
    id: 'domain_ssl',
    category: 'Infrastructure',
    icon: Globe,
    title: 'Verify Domain & SSL Certificate',
    description: 'Ensure jayforensics.com has valid HTTPS certificate',
    check: () => window.location.protocol === 'https:',
    priority: 'critical'
  },
  {
    id: 'error_webhook',
    category: 'Monitoring',
    icon: AlertTriangle,
    title: 'Error Logging Webhook',
    description: 'Send runtime errors to admin inbox or Discord',
    required_env_vars: ['ERROR_WEBHOOK_URL'],
    priority: 'medium'
  },
  {
    id: 'privacy_policy',
    category: 'Legal',
    icon: Shield,
    title: 'Publish Privacy Policy',
    description: 'Required at jayforensics.com/privacy for GDPR/CCPA compliance',
    check: async () => {
      try {
        const response = await fetch('https://jayforensics.com/privacy', { method: 'HEAD' });
        return response.ok;
      } catch {
        return false;
      }
    },
    priority: 'critical'
  },
  {
    id: 'terms_service',
    category: 'Legal',
    icon: Shield,
    title: 'Publish Terms of Service',
    description: 'Required at jayforensics.com/terms',
    check: async () => {
      try {
        const response = await fetch('https://jayforensics.com/terms', { method: 'HEAD' });
        return response.ok;
      } catch {
        return false;
      }
    },
    priority: 'critical'
  },
  {
    id: 'stripe_webhook',
    category: 'Payments',
    icon: CreditCard,
    title: 'Configure Stripe Webhook',
    description: 'Handle subscription events and payment confirmations',
    required_env_vars: ['STRIPE_WEBHOOK_SECRET'],
    test_endpoint: 'testStripeWebhook',
    priority: 'high'
  },
  {
    id: 'api_keys',
    category: 'Integrations',
    icon: Key,
    title: 'Verify API Keys',
    description: 'Test all external API integrations',
    subtasks: [
      { name: 'VirusTotal', env: 'VIRUSTOTAL_API_KEY', test: 'testVirusTotal' },
      { name: 'AbuseIPDB', env: 'ABUSEIPDB_API_KEY', test: 'testAbuseIPDB' },
      { name: 'Shodan', env: 'SHODAN_API_KEY', test: 'testShodan' },
      { name: 'AlienVault OTX', env: 'ALIENVAULT_OTX_API_KEY', test: 'testAlienVault' }
    ],
    priority: 'medium'
  }
];

export default function AdminConfigurationChecklist() {
  const [taskStatuses, setTaskStatuses] = useState({});
  const [testing, setTesting] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const testTask = async (task) => {
    setTesting(task.id);
    
    try {
      let passed = false;

      if (task.check) {
        // Custom check function
        passed = await task.check();
      } else if (task.test_endpoint) {
        // Test via backend function
        try {
          const response = await base44.functions.invoke(task.test_endpoint, {});
          passed = response.data?.success || false;
        } catch (error) {
          passed = false;
        }
      } else if (task.subtasks) {
        // Test multiple subtasks
        const results = [];
        for (const subtask of task.subtasks) {
          try {
            const response = await base44.functions.invoke(subtask.test, {});
            results.push({ name: subtask.name, passed: response.data?.success || false });
          } catch {
            results.push({ name: subtask.name, passed: false });
          }
        }
        passed = results.every(r => r.passed);
        setTaskStatuses(prev => ({ ...prev, [`${task.id}_subtasks`]: results }));
      }

      setTaskStatuses(prev => ({ ...prev, [task.id]: passed }));
      
      toast[passed ? 'success' : 'error'](
        passed ? 'Test passed' : 'Test failed',
        {
          description: task.title,
          style: {
            background: passed ? '#14532D' : '#7F1D1D',
            border: passed ? '1px solid #16A34A' : '1px solid #DC2626',
            color: passed ? '#D1FAE5' : '#FEE2E2'
          }
        }
      );
    } catch (error) {
      setTaskStatuses(prev => ({ ...prev, [task.id]: false }));
      toast.error('Test error', {
        description: error.message,
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
    } finally {
      setTesting(null);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-6">
        <Alert className="bg-red-900/20 border-red-500/30">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-red-200">
            <strong>Access Denied</strong><br />
            This page is only accessible to administrators.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
          <Settings className="w-8 h-8 text-blue-500" />
          Admin Configuration Checklist
        </h1>
        <p className="text-slate-400 mt-1">
          Complete these tasks before production deployment
        </p>
      </div>

      {/* Progress Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {Object.values(taskStatuses).filter(Boolean).length}
                </p>
                <p className="text-xs text-slate-400">Tasks Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-yellow-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {ADMIN_TASKS.length - Object.values(taskStatuses).filter(Boolean).length}
                </p>
                <p className="text-xs text-slate-400">Pending Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {Math.round((Object.values(taskStatuses).filter(Boolean).length / ADMIN_TASKS.length) * 100)}%
                </p>
                <p className="text-xs text-slate-400">Configuration Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tasks */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Configuration Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ADMIN_TASKS.map((task) => {
              const Icon = task.icon;
              const status = taskStatuses[task.id];
              const isTesting = testing === task.id;

              return (
                <div key={task.id} className="border border-slate-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <Icon className="w-6 h-6 text-blue-400 mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white">{task.title}</h3>
                          <Badge className={getPriorityColor(task.priority)}>
                            {task.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400">{task.description}</p>
                        
                        {task.required_env_vars && (
                          <div className="mt-2">
                            <p className="text-xs text-slate-500 mb-1">Required environment variables:</p>
                            <div className="flex flex-wrap gap-1">
                              {task.required_env_vars.map((envVar) => (
                                <code key={envVar} className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300">
                                  {envVar}
                                </code>
                              ))}
                            </div>
                          </div>
                        )}

                        {task.subtasks && taskStatuses[`${task.id}_subtasks`] && (
                          <div className="mt-2 space-y-1">
                            {taskStatuses[`${task.id}_subtasks`].map((subtask, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                {subtask.passed ? (
                                  <CheckCircle className="w-3 h-3 text-green-400" />
                                ) : (
                                  <XCircle className="w-3 h-3 text-red-400" />
                                )}
                                <span className="text-slate-400">{subtask.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {status !== undefined && (
                        status ? (
                          <CheckCircle className="w-6 h-6 text-green-400" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-400" />
                        )
                      )}
                      {(task.check || task.test_endpoint || task.subtasks) && (
                        <Button
                          size="sm"
                          onClick={() => testTask(task)}
                          disabled={isTesting}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {isTesting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Test'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            <a
              href="https://dashboard.stripe.com/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <span className="text-white">Stripe Webhook Setup</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
            <a
              href="/AdminSettings"
              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <span className="text-white">Admin Settings</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
            <a
              href="/SystemAuditReport"
              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <span className="text-white">Run Full System Audit</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
            <a
              href="/IntegrationsHealth"
              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <span className="text-white">Integration Status</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
