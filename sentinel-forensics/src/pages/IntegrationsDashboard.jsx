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
  Loader2,
  Play,
  Shield,
  Database,
  Globe,
  Key,
  Zap,
  RefreshCw,
  Clock,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import IntegrationsHub from '../components/integrations/IntegrationsHub';

export default function IntegrationsDashboard() {
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});
  const [testInputs, setTestInputs] = useState({});

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // Integration configurations
  const integrations = {
    core: {
      name: 'Core Integrations',
      icon: Zap,
      color: 'blue',
      services: [
        {
          id: 'invoke_llm',
          name: 'InvokeLLM',
          function: 'Core.InvokeLLM',
          description: 'AI-powered text generation and analysis',
          testPayload: {
            prompt: 'Test prompt: Analyze this IP address for threats',
            add_context_from_internet: false
          },
          expectedFields: ['response', 'success']
        },
        {
          id: 'send_email',
          name: 'SendEmail',
          function: 'Core.SendEmail',
          description: 'Email notification service',
          testPayload: {
            to: user?.email || 'test@example.com',
            subject: 'Test Email from Sentinel',
            body: 'This is a test email'
          },
          expectedFields: ['success']
        },
        {
          id: 'upload_file',
          name: 'UploadFile',
          function: 'Core.UploadFile',
          description: 'File upload service',
          requiresFile: true,
          expectedFields: ['file_url']
        },
        {
          id: 'generate_image',
          name: 'GenerateImage',
          function: 'Core.GenerateImage',
          description: 'AI image generation',
          testPayload: {
            prompt: 'A secure digital forensics laboratory'
          },
          expectedFields: ['url']
        },
        {
          id: 'extract_data',
          name: 'ExtractDataFromUploadedFile',
          function: 'Core.ExtractDataFromUploadedFile',
          description: 'Extract structured data from files',
          requiresFile: true,
          testPayload: {
            json_schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'number' }
              }
            }
          },
          expectedFields: ['status', 'output']
        }
      ]
    },
    threat_intelligence: {
      name: 'Threat Intelligence',
      icon: Shield,
      color: 'red',
      services: [
        {
          id: 'virustotal',
          name: 'VirusTotal',
          function: 'virusTotal',
          description: 'Malware and threat scanning',
          testPayload: {
            hash: '44d88612fea8a8f36de82e1278abb02f',
            type: 'file'
          },
          expectedFields: ['success', 'found', 'threat_level'],
          requiresSecret: 'VIRUSTOTAL_API_KEY'
        },
        {
          id: 'abuseipdb',
          name: 'AbuseIPDB',
          function: 'abuseipdb',
          description: 'IP reputation checking',
          testPayload: {
            ip_address: '8.8.8.8'
          },
          expectedFields: ['success', 'ip_address', 'abuse_confidence_score'],
          requiresSecret: 'ABUSEIPDB_API_KEY'
        },
        {
          id: 'shodan',
          name: 'Shodan',
          function: 'proxyShodan',
          description: 'Internet-connected device search',
          testPayload: {
            query: '8.8.8.8'
          },
          expectedFields: ['data'],
          requiresSecret: 'SHODAN_API_KEY'
        },
        {
          id: 'hibp',
          name: 'Have I Been Pwned',
          function: 'proxyHIBP',
          description: 'Check for compromised credentials',
          testPayload: {
            email: 'test@example.com'
          },
          expectedFields: ['breaches'],
          requiresSecret: 'HIBP_API_KEY'
        },
        {
          id: 'censys',
          name: 'Censys',
          function: 'proxyCensys',
          description: 'Internet asset discovery',
          testPayload: {
            query: '8.8.8.8'
          },
          expectedFields: ['data'],
          requiresSecret: 'CENSYS_API_ID'
        },
        {
          id: 'urlscan',
          name: 'URLScan.io',
          function: 'urlscan',
          description: 'URL analysis and scanning',
          testPayload: {
            url: 'https://example.com',
            action: 'search'
          },
          expectedFields: ['success', 'results_found'],
          requiresSecret: 'URLSCAN_API_KEY'
        }
      ]
    },
    forensics: {
      name: 'Forensic Tools',
      icon: Database,
      color: 'green',
      services: [
        {
          id: 'extract_iocs',
          name: 'Extract IOCs',
          function: 'extractIOCs',
          description: 'Extract indicators of compromise from evidence',
          testPayload: {
            evidence_id: 'test-evidence-id',
            content: 'Sample text with IP 192.168.1.1 and domain evil.com'
          },
          expectedFields: ['indicators', 'extraction_count']
        },
        {
          id: 'correlate',
          name: 'Correlate Indicators',
          function: 'correlateIndicators',
          description: 'Find relationships between IOCs',
          testPayload: {
            case_id: 'test-case-id',
            indicator_ids: ['test-ioc-1', 'test-ioc-2']
          },
          expectedFields: ['graph', 'correlations_found']
        },
        {
          id: 'verify_integrity',
          name: 'Verify Evidence Integrity',
          function: 'verifyEvidenceIntegrity',
          description: 'Verify chain of custody integrity',
          testPayload: {
            evidence_id: 'test-evidence-id'
          },
          expectedFields: ['verified', 'chain_intact']
        },
        {
          id: 'verify_audit',
          name: 'Verify Audit Chain',
          function: 'verifyAuditChain',
          description: 'Verify audit log integrity',
          testPayload: {
            log_count: 10
          },
          expectedFields: ['verified', 'integrity_check']
        }
      ]
    },
    agent_management: {
      name: 'Agent Management',
      icon: Activity,
      color: 'purple',
      services: [
        {
          id: 'enroll_device',
          name: 'Enroll Device',
          function: 'enrollDevice',
          description: 'Enroll new security agent device',
          testPayload: {
            display_name: 'Test Device',
            platform: 'windows',
            public_key_pem: 'test-key'
          },
          expectedFields: ['device_id', 'enrollment_token']
        },
        {
          id: 'dispatch_command',
          name: 'Dispatch Command',
          function: 'dispatchCommand',
          description: 'Send command to agent device',
          testPayload: {
            device_id: 'test-device',
            command_kind: 'health.check',
            params: {}
          },
          expectedFields: ['command_id', 'queued']
        },
        {
          id: 'ingest_result',
          name: 'Ingest Result',
          function: 'ingestResult',
          description: 'Receive agent command results',
          testPayload: {
            device_id: 'test-device',
            command_id: 'test-command',
            outcome: 'success',
            result_data: { status: 'ok' }
          },
          expectedFields: ['result_id', 'processed']
        }
      ]
    },
    automation: {
      name: 'Automation & Workflows',
      icon: Zap,
      color: 'yellow',
      services: [
        {
          id: 'execute_workflow',
          name: 'Execute Workflow',
          function: 'executeWorkflow',
          description: 'Run automated playbook',
          testPayload: {
            workflow_id: 'test-workflow',
            trigger_data: { test: true }
          },
          expectedFields: ['execution_id', 'status']
        },
        {
          id: 'dispatch_alert',
          name: 'Dispatch Alert',
          function: 'dispatchAlert',
          description: 'Send alert notifications',
          testPayload: {
            alert_type: 'network_anomaly',
            severity: 'high',
            title: 'Test Alert',
            description: 'This is a test alert'
          },
          expectedFields: ['alert_id', 'dispatched']
        }
      ]
    },
    payments: {
      name: 'Payment Processing',
      icon: Globe,
      color: 'indigo',
      services: [
        {
          id: 'create_checkout',
          name: 'Create Checkout Session',
          function: 'createCheckoutSession',
          description: 'Initialize Stripe checkout',
          testPayload: {
            tier: 'professional',
            user_email: user?.email || 'test@example.com'
          },
          expectedFields: ['session_id', 'url'],
          requiresSecret: 'STRIPE_SECRET_KEY'
        },
        {
          id: 'verify_subscription',
          name: 'Verify Subscription',
          function: 'verifySubscription',
          description: 'Check subscription status',
          testPayload: {
            user_email: user?.email || 'test@example.com'
          },
          expectedFields: ['subscription_status', 'tier']
        }
      ]
    }
  };

  // Test a single integration
  const testIntegration = async (categoryKey, service) => {
    const testKey = `${categoryKey}-${service.id}`;
    setTesting(prev => ({ ...prev, [testKey]: true }));

    try {
      let result;
      const startTime = Date.now();

      if (service.requiresFile) {
        // For file upload tests, create a test blob
        const testBlob = new Blob(['Test file content'], { type: 'text/plain' });
        const testFile = new File([testBlob], 'test.txt', { type: 'text/plain' });
        
        if (service.function === 'Core.UploadFile') {
          result = await base44.integrations.Core.UploadFile({ file: testFile });
        } else if (service.function === 'Core.ExtractDataFromUploadedFile') {
          const uploadResult = await base44.integrations.Core.UploadFile({ file: testFile });
          result = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url: uploadResult.file_url,
            ...service.testPayload
          });
        }
      } else if (service.function.includes('.')) {
        // Core integrations
        const [integration, method] = service.function.split('.');
        result = await base44.integrations[integration][method](service.testPayload);
      } else {
        // Backend functions
        const response = await base44.functions.invoke(service.function, service.testPayload);
        result = response.data;
      }

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Validate response
      const validation = validateResponse(result, service.expectedFields);

      setTestResults(prev => ({
        ...prev,
        [testKey]: {
          success: validation.valid,
          response: result,
          responseTime,
          validation,
          timestamp: new Date().toISOString()
        }
      }));

      if (validation.valid) {
        toast.success(`${service.name} test passed`, {
          description: `Response time: ${responseTime}ms`
        });
      } else {
        toast.error(`${service.name} test failed`, {
          description: validation.errors.join(', ')
        });
      }
    } catch (error) {
      console.error(`Test failed for ${service.name}:`, error);
      setTestResults(prev => ({
        ...prev,
        [testKey]: {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      }));

      toast.error(`${service.name} test failed`, {
        description: error.message
      });
    } finally {
      setTesting(prev => ({ ...prev, [testKey]: false }));
    }
  };

  // Validate API response
  const validateResponse = (response, expectedFields) => {
    const errors = [];
    let valid = true;

    if (!response) {
      return { valid: false, errors: ['No response received'] };
    }

    expectedFields.forEach(field => {
      if (!(field in response)) {
        errors.push(`Missing field: ${field}`);
        valid = false;
      }
    });

    return { valid, errors };
  };

  // Test all integrations in a category
  const testAllInCategory = async (categoryKey) => {
    const category = integrations[categoryKey];
    toast.info(`Testing all ${category.name}...`);

    for (const service of category.services) {
      await testIntegration(categoryKey, service);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    toast.success(`Completed testing ${category.name}`);
  };

  // Get test result for a service
  const getTestResult = (categoryKey, serviceId) => {
    return testResults[`${categoryKey}-${serviceId}`];
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Integrations Dashboard</h1>
            <p className="text-slate-400">Test integrations, connect to external systems</p>
          </div>
        </div>

        <Tabs defaultValue="testing" className="space-y-6">
          <TabsList className="bg-slate-900">
            <TabsTrigger value="testing">Integration Testing</TabsTrigger>
            <TabsTrigger value="hub">Integration Hub</TabsTrigger>
          </TabsList>

          <TabsContent value="testing" className="space-y-6">
            <div className="flex justify-end">
        <Button
          onClick={() => {
            setTestResults({});
            toast.info('Test results cleared');
          }}
          variant="outline"
          className="border-slate-700"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Clear Results
        </Button>
      </div>

      {/* Integration Categories */}
      {Object.entries(integrations).map(([categoryKey, category]) => {
        const Icon = category.icon;
        const testedServices = category.services.filter(s => 
          getTestResult(categoryKey, s.id)
        ).length;
        const passedServices = category.services.filter(s => {
          const result = getTestResult(categoryKey, s.id);
          return result?.success;
        }).length;

        return (
          <Card key={categoryKey} className="bg-slate-900 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-lg bg-${category.color}-500/20 flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 text-${category.color}-400`} />
                  </div>
                  <div>
                    <CardTitle className="text-white">{category.name}</CardTitle>
                    <p className="text-sm text-slate-400 mt-1">
                      {category.services.length} integrations
                      {testedServices > 0 && ` • ${passedServices}/${testedServices} passed`}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => testAllInCategory(categoryKey)}
                  disabled={Object.values(testing).some(t => t)}
                  className={`bg-${category.color}-600 hover:bg-${category.color}-700`}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Test All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {category.services.map((service) => {
                  const testKey = `${categoryKey}-${service.id}`;
                  const result = getTestResult(categoryKey, service.id);
                  const isTesting = testing[testKey];

                  return (
                    <div key={service.id} className="border border-slate-700 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-white">{service.name}</h4>
                            {service.requiresSecret && (
                              <Badge variant="outline" className="border-yellow-500 text-yellow-400 text-xs">
                                <Key className="w-3 h-3 mr-1" />
                                API Key Required
                              </Badge>
                            )}
                            {result && (
                              result.success ? (
                                <Badge className="bg-green-500/20 text-green-400">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Passed
                                </Badge>
                              ) : (
                                <Badge className="bg-red-500/20 text-red-400">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Failed
                                </Badge>
                              )
                            )}
                          </div>
                          <p className="text-sm text-slate-400 mb-2">{service.description}</p>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span>Function: <code className="text-slate-300">{service.function}</code></span>
                            {result?.responseTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {result.responseTime}ms
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => testIntegration(categoryKey, service)}
                          disabled={isTesting}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {isTesting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Test
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Test Payload */}
                      {service.testPayload && (
                        <details className="mt-3">
                          <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">
                            View Test Payload
                          </summary>
                          <pre className="mt-2 p-2 bg-slate-950 rounded text-xs text-slate-300 overflow-x-auto">
                            {JSON.stringify(service.testPayload, null, 2)}
                          </pre>
                        </details>
                      )}

                      {/* Test Result */}
                      {result && (
                        <div className="mt-3 p-3 bg-slate-950 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-300">Test Result:</span>
                            <span className="text-xs text-slate-500">
                              {new Date(result.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          
                          {result.success ? (
                            <div>
                              <Alert className="bg-green-950/20 border-green-500">
                                <CheckCircle className="w-4 h-4 text-green-400" />
                                <AlertDescription className="text-green-300">
                                  Test passed successfully
                                  {result.validation?.errors?.length === 0 && ' - All expected fields present'}
                                </AlertDescription>
                              </Alert>
                              <details className="mt-2">
                                <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">
                                  View Response
                                </summary>
                                <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-300 overflow-x-auto max-h-40">
                                  {JSON.stringify(result.response, null, 2)}
                                </pre>
                              </details>
                            </div>
                          ) : (
                            <Alert className="bg-red-950/20 border-red-500">
                              <XCircle className="w-4 h-4 text-red-400" />
                              <AlertDescription className="text-red-300">
                                <div className="font-semibold">Test failed</div>
                                {result.error && (
                                  <div className="text-sm mt-1">{result.error}</div>
                                )}
                                {result.validation?.errors && result.validation.errors.length > 0 && (
                                  <ul className="text-sm mt-1 list-disc list-inside">
                                    {result.validation.errors.map((err, idx) => (
                                      <li key={idx}>{err}</li>
                                    ))}
                                  </ul>
                                )}
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Summary */}
      {Object.keys(testResults).length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Test Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-950 rounded-lg">
                <div className="flex items-center gap-3">
                  <Activity className="w-10 h-10 text-blue-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">
                      {Object.keys(testResults).length}
                    </p>
                    <p className="text-xs text-slate-400">Total Tests Run</p>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-950 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-10 h-10 text-green-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">
                      {Object.values(testResults).filter(r => r.success).length}
                    </p>
                    <p className="text-xs text-slate-400">Tests Passed</p>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-950 rounded-lg">
                <div className="flex items-center gap-3">
                  <XCircle className="w-10 h-10 text-red-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">
                      {Object.values(testResults).filter(r => !r.success).length}
                    </p>
                    <p className="text-xs text-slate-400">Tests Failed</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
          </TabsContent>

          <TabsContent value="hub" className="space-y-6">
            <IntegrationsHub />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}