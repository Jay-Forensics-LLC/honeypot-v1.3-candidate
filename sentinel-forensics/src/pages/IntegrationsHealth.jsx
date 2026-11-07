import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RefreshCw,
  CreditCard,
  BarChart3,
  Database,
  Clock,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function IntegrationsHealth() {
  const [testing, setTesting] = useState({});
  const queryClient = useQueryClient();

  const { data: healthChecks = [], isLoading } = useQuery({
    queryKey: ['integration-health'],
    queryFn: async () => {
      try {
        return await base44.entities.APIHealthCheck.list('-checked_at', 10);
      } catch {
        return [];
      }
    },
    refetchInterval: 60000,
    initialData: []
  });

  const testStripeMutation = useMutation({
    mutationFn: async () => {
      const startTime = Date.now();
      const response = await base44.functions.invoke('testStripePublishableKey');
      const responseTime = Date.now() - startTime;
      return { ...response.data, response_time: responseTime };
    },
    onSuccess: async (data) => {
      await base44.entities.APIHealthCheck.create({
        service_name: 'stripe',
        endpoint: 'Stripe Elements',
        status_code: 200,
        response_time_ms: data.response_time || 0,
        status: 'operational',
        success: true,
        checked_at: new Date().toISOString()
      });
      
      queryClient.invalidateQueries({ queryKey: ['integration-health'] });
      toast.success('Stripe integration working!');
    },
    onError: (error) => {
      toast.error('Stripe test failed: ' + error.message);
    }
  });

  const testMixpanelMutation = useMutation({
    mutationFn: async () => {
      // Check if Mixpanel is loaded
      if (typeof window === 'undefined' || !window.mixpanel) {
        // Mixpanel not loaded - skip test gracefully
        return { 
          success: false, 
          skipped: true, 
          response_time: 0,
          message: 'Mixpanel SDK not loaded - analytics tracking disabled'
        };
      }

      try {
        // Try to track a test event
        window.mixpanel.track('Integration Health Check', {
          source: 'diagnostics_panel',
          timestamp: new Date().toISOString()
        });
        
        return { success: true, response_time: 50 };
      } catch (error) {
        return { 
          success: false, 
          response_time: 0,
          message: error.message 
        };
      }
    },
    onSuccess: async (data) => {
      if (data.skipped) {
        // Log as disabled, not error
        await base44.entities.APIHealthCheck.create({
          service_name: 'threat_enrichment',
          endpoint: 'Mixpanel Track',
          status_code: 204,
          response_time_ms: 0,
          status: 'disabled',
          success: false,
          checked_at: new Date().toISOString(),
          error_message: data.message
        });
        
        queryClient.invalidateQueries({ queryKey: ['integration-health'] });
        toast.info('Mixpanel analytics not enabled', {
          description: 'Analytics tracking is optional and currently disabled'
        });
        return;
      }

      await base44.entities.APIHealthCheck.create({
        service_name: 'threat_enrichment',
        endpoint: 'Mixpanel Track',
        status_code: 200,
        response_time_ms: data.response_time || 0,
        status: 'operational',
        success: true,
        checked_at: new Date().toISOString()
      });
      
      queryClient.invalidateQueries({ queryKey: ['integration-health'] });
      toast.success('Mixpanel integration working!');
    },
    onError: (error) => {
      toast.warning('Mixpanel test skipped', {
        description: 'Analytics SDK not loaded - this is optional'
      });
    }
  });

  const testBase44SocketMutation = useMutation({
    mutationFn: async () => {
      const startTime = Date.now();
      await base44.auth.me();
      const responseTime = Date.now() - startTime;
      return { success: true, response_time: responseTime };
    },
    onSuccess: async (data) => {
      await base44.entities.APIHealthCheck.create({
        service_name: 'threat_enrichment',
        endpoint: 'Base44 API',
        status_code: 200,
        response_time_ms: data.response_time,
        status: 'operational',
        success: true,
        checked_at: new Date().toISOString()
      });
      
      queryClient.invalidateQueries({ queryKey: ['integration-health'] });
      toast.success('Base44 connection healthy!');
    },
    onError: (error) => {
      toast.error('Base44 API test failed: ' + error.message);
    }
  });

  const integrations = [
    {
      name: 'Stripe',
      icon: CreditCard,
      description: 'Payment processing',
      test: testStripeMutation,
      lastCheck: healthChecks.find(h => h.service_name === 'stripe'),
      required: true
    },
    {
      name: 'Mixpanel',
      icon: BarChart3,
      description: 'Analytics tracking (optional)',
      test: testMixpanelMutation,
      lastCheck: healthChecks.find(h => h.endpoint === 'Mixpanel Track'),
      required: false
    },
    {
      name: 'Base44 API',
      icon: Database,
      description: 'Core platform',
      test: testBase44SocketMutation,
      lastCheck: healthChecks.find(h => h.endpoint === 'Base44 API'),
      required: true
    }
  ];

  const runTest = async (integration) => {
    setTesting(prev => ({ ...prev, [integration.name]: true }));
    try {
      await integration.test.mutateAsync();
    } finally {
      setTesting(prev => ({ ...prev, [integration.name]: false }));
    }
  };

  const getStatusBadge = (lastCheck, required) => {
    if (!lastCheck) {
      return (
        <Badge className="bg-slate-500/20 text-slate-400">
          <Clock className="w-3 h-3 mr-1" />
          Not Tested
        </Badge>
      );
    }

    if (lastCheck.status === 'operational') {
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
          <CheckCircle className="w-3 h-3 mr-1" />
          Operational
        </Badge>
      );
    }

    if (lastCheck.status === 'disabled' && !required) {
      return (
        <Badge className="bg-blue-500/20 text-blue-400">
          <AlertCircle className="w-3 h-3 mr-1" />
          Disabled
        </Badge>
      );
    }

    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
        <XCircle className="w-3 h-3 mr-1" />
        Error
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Integrations Health</h1>
        <p className="text-slate-400">Monitor and test critical integrations</p>
      </div>

      <div className="grid gap-4">
        {integrations.map((integration) => {
          const Icon = integration.icon;
          const isHealthy = integration.lastCheck?.status === 'operational';
          const lastCheckTime = integration.lastCheck?.checked_at;

          return (
            <Card key={integration.name} className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      isHealthy ? 'bg-green-500/20' : 'bg-slate-700/50'
                    }`}>
                      <Icon className={`w-6 h-6 ${isHealthy ? 'text-green-400' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <CardTitle className="text-white flex items-center gap-2">
                        {integration.name}
                        {!integration.required && (
                          <Badge variant="outline" className="text-xs">
                            Optional
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-slate-400">{integration.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(integration.lastCheck, integration.required)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {lastCheckTime && (
                  <div className="text-sm text-slate-400">
                    Last checked: {format(new Date(lastCheckTime), 'MMM d, yyyy h:mm a')}
                    {integration.lastCheck?.response_time_ms && (
                      <span className="ml-2">
                        ({integration.lastCheck.response_time_ms}ms)
                      </span>
                    )}
                  </div>
                )}

                {integration.lastCheck?.error_message && (
                  <div className="text-xs text-slate-500 bg-slate-800/50 p-2 rounded">
                    {integration.lastCheck.error_message}
                  </div>
                )}
                
                <Button
                  onClick={() => runTest(integration)}
                  disabled={testing[integration.name]}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {testing[integration.name] ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => {
              integrations.forEach(int => runTest(int));
            }}
            variant="outline"
            className="w-full border-blue-700 text-blue-400 hover:bg-blue-500/10"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Test All Integrations
          </Button>
          
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              <strong>Note:</strong> Mixpanel analytics is optional. If disabled, core forensics functionality remains fully operational.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}