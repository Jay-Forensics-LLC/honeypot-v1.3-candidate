
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  Loader2,
  Play,
  RefreshCw,
  AlertTriangle,
  Zap,
  Database,
  Lock,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Integrations Status & Testing Dashboard
 * Test all external API integrations and monitor health
 */
export default function IntegrationsStatus() {
  const [testResults, setTestResults] = useState({});

  // Fetch API health checks
  const { data: apiHealth = [], refetch } = useQuery({
    queryKey: ['api-health-checks'],
    queryFn: async () => {
      const checks = await base44.entities.APIHealthCheck.list('-checked_at', 50);
      return checks;
    },
    refetchInterval: 60000 // Refresh every minute
  });

  const integrations = [
    {
      name: 'VirusTotal',
      function: 'proxyVirusTotal',
      testPayload: { hash: '44d88612fea8a8f36de82e1278abb02f' },
      severity: 'critical',
      icon: Shield
    },
    {
      name: 'Shodan',
      function: 'proxyShodan',
      testPayload: { ip: '8.8.8.8' },
      severity: 'high',
      icon: Database
    },
    {
      name: 'AbuseIPDB',
      function: 'abuseipdb',
      testPayload: { ip_address: '1.1.1.1' },
      severity: 'high',
      icon: Shield
    },
    {
      name: 'URLScan.io',
      function: 'urlscan',
      testPayload: { url: 'https://google.com', action: 'search' },
      severity: 'medium',
      icon: Eye
    },
    {
      name: 'AlienVault OTX',
      function: 'alienVaultOTX',
      testPayload: { indicator: '8.8.8.8', indicator_type: 'IPv4' },
      severity: 'high',
      icon: Database
    },
    {
      name: 'Have I Been Pwned',
      function: 'proxyHIBP',
      testPayload: { email: 'test@example.com' },
      severity: 'medium',
      icon: Lock
    }
  ];

  const testIntegrationMutation = useMutation({
    mutationFn: async ({ functionName, payload }) => {
      const startTime = Date.now();
      
      try {
        const { data, status } = await base44.functions.invoke(functionName, payload);
        const responseTime = Date.now() - startTime;

        return {
          success: true,
          data,
          status,
          responseTime
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        return {
          success: false,
          error: error.message,
          status: error.response?.status || 500,
          responseTime
        };
      }
    },
    onSuccess: (result, variables) => {
      setTestResults(prev => ({
        ...prev,
        [variables.functionName]: result
      }));

      if (result.success) {
        toast.success(`${variables.functionName} test passed`, {
          description: `Response time: ${result.responseTime}ms`
        });
      } else {
        toast.error(`${variables.functionName} test failed`, {
          description: result.error
        });
      }
    }
  });

  const testAllMutation = useMutation({
    mutationFn: async () => {
      const results = {};
      
      for (const integration of integrations) {
        const startTime = Date.now(); // Moved outside try-catch
        try {
          const { data, status } = await base44.functions.invoke(
            integration.function, 
            integration.testPayload
          );
          const responseTime = Date.now() - startTime;

          results[integration.function] = {
            success: true,
            data,
            status,
            responseTime
          };
        } catch (error) {
          const responseTime = Date.now() - startTime;
          results[integration.function] = {
            success: false,
            error: error.message,
            status: error.response?.status || 500,
            responseTime
          };
        }
      }

      return results;
    },
    onSuccess: (results) => {
      setTestResults(results);
      
      const passed = Object.values(results).filter(r => r.success).length;
      const total = Object.values(results).length;

      if (passed === total) {
        toast.success('All Integration Tests Passed!', {
          description: `${passed}/${total} integrations operational`
        });
      } else {
        toast.warning('Some Integration Tests Failed', {
          description: `${total - passed} integration(s) failed`
        });
      }
    }
  });

  const getStatusBadge = (result) => {
    if (!result) {
      return <Badge className="bg-slate-500/20 text-slate-400">Not Tested</Badge>;
    }
    
    if (result.success) {
      return <Badge className="bg-green-500/20 text-green-400">Operational</Badge>;
    }
    
    if (result.status === 429) {
      return <Badge className="bg-yellow-500/20 text-yellow-400">Rate Limited</Badge>;
    }
    
    return <Badge className="bg-red-500/20 text-red-400">Failed</Badge>;
  };

  const getHealthStatus = (serviceName) => {
    const recentChecks = apiHealth
      .filter(h => h.service_name === serviceName.toLowerCase())
      .slice(0, 5);

    if (recentChecks.length === 0) return null;

    const operational = recentChecks.filter(c => c.status === 'operational').length;
    const uptimePercent = (operational / recentChecks.length) * 100;

    return {
      uptime: uptimePercent.toFixed(1),
      lastCheck: recentChecks[0],
      avgResponseTime: recentChecks.reduce((sum, c) => sum + (c.response_time_ms || 0), 0) / recentChecks.length
    };
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Integration Status</h1>
          <p className="text-slate-400">Monitor and test external API integrations</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => refetch()}
            variant="outline"
            className="border-slate-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => testAllMutation.mutate()}
            disabled={testAllMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {testAllMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing All...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Test All
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Overall Status */}
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{integrations.length}</p>
              <p className="text-sm text-slate-400">Total Integrations</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-400">
                {Object.values(testResults).filter(r => r?.success).length}
              </p>
              <p className="text-sm text-slate-400">Operational</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-400">
                {Object.values(testResults).filter(r => r && !r.success).length}
              </p>
              <p className="text-sm text-slate-400">Failed</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-400">
                {integrations.length - Object.keys(testResults).length}
              </p>
              <p className="text-sm text-slate-400">Untested</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((integration) => {
          const Icon = integration.icon;
          const result = testResults[integration.function];
          const health = getHealthStatus(integration.name);

          return (
            <Card key={integration.name} className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-purple-400" />
                    <span className="text-sm">{integration.name}</span>
                  </div>
                  {getStatusBadge(result)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Test Result */}
                {result && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Response Time:</span>
                      <span className={`font-mono ${
                        result.responseTime < 1000 ? 'text-green-400' :
                        result.responseTime < 3000 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {result.responseTime}ms
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Status Code:</span>
                      <span className={`font-mono ${
                        result.status === 200 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {result.status}
                      </span>
                    </div>
                    {result.error && (
                      <Alert className="bg-red-500/10 border-red-500/30">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <AlertDescription className="text-red-300 text-xs">
                          {result.error}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Historical Health */}
                {health && (
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-400">24h Uptime:</span>
                      <span className={`font-bold ${
                        health.uptime >= 99 ? 'text-green-400' :
                        health.uptime >= 95 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {health.uptime}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Avg Response:</span>
                      <span className="text-white font-mono">
                        {Math.round(health.avgResponseTime)}ms
                      </span>
                    </div>
                  </div>
                )}

                {/* Test Button */}
                <Button
                  onClick={() => testIntegrationMutation.mutate({
                    functionName: integration.function,
                    payload: integration.testPayload
                  })}
                  disabled={testIntegrationMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="sm"
                >
                  {testIntegrationMutation.isPending && 
                   testIntegrationMutation.variables?.functionName === integration.function ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Test Now
                    </>
                  )}
                </Button>

                {/* Severity Badge */}
                <div className="flex justify-center">
                  <Badge className={
                    integration.severity === 'critical' ? 'bg-red-500/20 text-red-400 text-xs' :
                    integration.severity === 'high' ? 'bg-orange-500/20 text-orange-400 text-xs' :
                    'bg-yellow-500/20 text-yellow-400 text-xs'
                  }>
                    {integration.severity} priority
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* System Worker Functions */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            System Worker Functions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert className="bg-yellow-500/10 border-yellow-500/30">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-300 text-sm">
              These functions require SYSTEM_WORKER_TOKEN and should be called from cron jobs.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            {[
              {
                name: 'updateThreatFeeds',
                schedule: '0 2 * * *',
                description: 'Daily threat intelligence updates'
              },
              {
                name: 'enforceDataRetention',
                schedule: '0 3 * * *',
                description: 'Archive/delete old records per policy'
              },
              {
                name: 'createBackup',
                schedule: '0 4 * * *',
                description: 'Daily full encrypted backup'
              },
              {
                name: 'deadmanSwitchWorker',
                schedule: '*/5 * * * *',
                description: 'Check for expired dead-man switches'
              },
              {
                name: 'detectBLEAnomalies',
                schedule: '0 * * * *',
                description: 'Hourly BLE anomaly detection'
              }
            ].map((job) => (
              <div
                key={job.name}
                className="p-4 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="font-semibold text-white font-mono text-sm">{job.name}</p>
                  <Badge variant="outline" className="border-slate-600 text-xs">
                    {job.schedule}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">{job.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
