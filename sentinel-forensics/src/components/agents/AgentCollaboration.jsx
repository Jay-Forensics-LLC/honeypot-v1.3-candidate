import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Bot,
  Network,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Loader2,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Agent Collaboration Orchestrator
 * Demonstrates how agents work together to solve complex tasks
 */
export default function AgentCollaboration() {
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [workflowSteps, setWorkflowSteps] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  // Example workflow: Complete threat investigation
  const runThreatInvestigationWorkflow = async (caseId) => {
    setIsRunning(true);
    setActiveWorkflow('threat_investigation');
    const steps = [];

    try {
      // Step 1: Security Monitor analyzes IOCs
      steps.push({
        agent: 'security_monitor',
        action: 'Analyzing IOCs and building correlation graph',
        status: 'running'
      });
      setWorkflowSteps([...steps]);

      const securityConversation = await base44.agents.createConversation({
        agent_name: 'security_monitor',
        metadata: { workflow_id: 'threat_inv_' + Date.now(), case_id: caseId }
      });

      await base44.agents.addMessage(securityConversation, {
        role: 'user',
        content: `Analyze all IOCs for case ${caseId}. Check enrichment results, build correlation graph, and identify the top 3 threats. Format your response as JSON with: {threats: [{name, severity, confidence, indicators: []}], graph_score: number, recommendations: []}`
      });

      // Wait for response (in production, use subscribeToConversation)
      await new Promise(resolve => setTimeout(resolve, 3000));

      steps[0].status = 'completed';
      setWorkflowSteps([...steps]);

      // Step 2: Compliance check
      steps.push({
        agent: 'compliance_guardian',
        action: 'Verifying evidence chain-of-custody and legal compliance',
        status: 'running'
      });
      setWorkflowSteps([...steps]);

      const complianceConversation = await base44.agents.createConversation({
        agent_name: 'compliance_guardian',
        metadata: { workflow_id: 'threat_inv_' + Date.now(), case_id: caseId }
      });

      await base44.agents.addMessage(complianceConversation, {
        role: 'user',
        content: `Verify compliance for case ${caseId}. Check evidence integrity, chain-of-custody, and legal admissibility. Report any compliance gaps.`
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      steps[1].status = 'completed';
      setWorkflowSteps([...steps]);

      // Step 3: Automation workflow creates response plan
      steps.push({
        agent: 'automation_workflow',
        action: 'Creating automated response playbook',
        status: 'running'
      });
      setWorkflowSteps([...steps]);

      const automationConversation = await base44.agents.createConversation({
        agent_name: 'automation_workflow',
        metadata: { workflow_id: 'threat_inv_' + Date.now(), case_id: caseId }
      });

      await base44.agents.addMessage(automationConversation, {
        role: 'user',
        content: `Based on the security analysis, create an incident response playbook for case ${caseId}. Include containment actions, evidence collection steps, and notification requirements.`
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      steps[2].status = 'completed';
      setWorkflowSteps([...steps]);

      toast.success('Workflow completed successfully!', {
        description: 'All agents collaborated to complete the threat investigation'
      });

    } catch (error) {
      console.error('Workflow error:', error);
      toast.error('Workflow failed', {
        description: error.message
      });
      
      steps[steps.length - 1].status = 'failed';
      setWorkflowSteps([...steps]);
    } finally {
      setIsRunning(false);
    }
  };

  // Example workflow: Security audit
  const runSecurityAuditWorkflow = async () => {
    setIsRunning(true);
    setActiveWorkflow('security_audit');
    const steps = [];

    try {
      // Step 1: System health check
      steps.push({
        agent: 'system_health_monitor',
        action: 'Checking system health metrics and API status',
        status: 'running'
      });
      setWorkflowSteps([...steps]);

      const healthConversation = await base44.agents.createConversation({
        agent_name: 'system_health_monitor',
        metadata: { workflow_id: 'sec_audit_' + Date.now() }
      });

      await base44.agents.addMessage(healthConversation, {
        role: 'user',
        content: 'Run comprehensive system health check. Report CPU, memory, disk usage, API statuses, and any performance issues.'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
      steps[0].status = 'completed';
      setWorkflowSteps([...steps]);

      // Step 2: Security analysis
      steps.push({
        agent: 'security_monitor',
        action: 'Analyzing active threats and security posture',
        status: 'running'
      });
      setWorkflowSteps([...steps]);

      const securityConversation = await base44.agents.createConversation({
        agent_name: 'security_monitor',
        metadata: { workflow_id: 'sec_audit_' + Date.now() }
      });

      await base44.agents.addMessage(securityConversation, {
        role: 'user',
        content: 'Analyze current security posture. Check for open alerts, unresolved threats, and security gaps. Provide risk assessment.'
      });

      await new Promise(resolve => setTimeout(resolve, 3000));
      steps[1].status = 'completed';
      setWorkflowSteps([...steps]);

      // Step 3: Compliance validation
      steps.push({
        agent: 'compliance_guardian',
        action: 'Validating regulatory compliance',
        status: 'running'
      });
      setWorkflowSteps([...steps]);

      const complianceConversation = await base44.agents.createConversation({
        agent_name: 'compliance_guardian',
        metadata: { workflow_id: 'sec_audit_' + Date.now() }
      });

      await base44.agents.addMessage(complianceConversation, {
        role: 'user',
        content: 'Run full compliance audit. Check GDPR, SOC2, evidence handling compliance. Report any violations or risks.'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
      steps[2].status = 'completed';
      setWorkflowSteps([...steps]);

      toast.success('Security audit completed!');

    } catch (error) {
      console.error('Audit workflow error:', error);
      toast.error('Audit failed', { description: error.message });
      
      if (steps.length > 0) {
        steps[steps.length - 1].status = 'failed';
        setWorkflowSteps([...steps]);
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-purple-400" />
            Agent Collaboration Workflows
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-300 text-sm">
            Sentinel's AI agents work together to handle complex security tasks. 
            Each agent specializes in different areas and can delegate tasks to other agents.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <Button
              onClick={() => runThreatInvestigationWorkflow('DEMO-CASE-001')}
              disabled={isRunning}
              className="w-full h-auto py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 flex flex-col gap-2"
            >
              {isRunning && activeWorkflow === 'threat_investigation' ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">Running Investigation...</span>
                </>
              ) : (
                <>
                  <Bot className="w-6 h-6" />
                  <span className="font-semibold">Threat Investigation</span>
                  <span className="text-xs opacity-75">3 agents collaborate</span>
                </>
              )}
            </Button>

            <Button
              onClick={runSecurityAuditWorkflow}
              disabled={isRunning}
              className="w-full h-auto py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 flex flex-col gap-2"
            >
              {isRunning && activeWorkflow === 'security_audit' ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">Running Audit...</span>
                </>
              ) : (
                <>
                  <Bot className="w-6 h-6" />
                  <span className="font-semibold">Security Audit</span>
                  <span className="text-xs opacity-75">Full system check</span>
                </>
              )}
            </Button>
          </div>

          {/* Workflow Steps Visualization */}
          {workflowSteps.length > 0 && (
            <div className="mt-6 space-y-3">
              <h4 className="text-white font-semibold mb-3">Workflow Progress</h4>
              {workflowSteps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex-shrink-0">
                    {step.status === 'running' && (
                      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    )}
                    {step.status === 'completed' && (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    )}
                    {step.status === 'failed' && (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {step.agent}
                      </Badge>
                      <span className="text-sm text-slate-400">Step {idx + 1}</span>
                    </div>
                    <p className="text-sm text-white">{step.action}</p>
                  </div>
                  {idx < workflowSteps.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Capabilities Matrix */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            Agent Capabilities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">security_monitor</h4>
                  <Badge className="bg-red-500/20 text-red-400 text-xs">Threat Analysis</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Analyzes threats, correlates IOCs, enriches indicators with threat intel, and generates security recommendations
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">automation_workflow</h4>
                  <Badge className="bg-purple-500/20 text-purple-400 text-xs">Orchestration</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Executes automated playbooks, coordinates incident response, manages job queues, and delegates to specialized agents
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">system_health_monitor</h4>
                  <Badge className="bg-green-500/20 text-green-400 text-xs">Health & Performance</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Monitors system metrics, API health, performance, and triggers automated remediation when thresholds are breached
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">compliance_guardian</h4>
                  <Badge className="bg-blue-500/20 text-blue-400 text-xs">Compliance & Legal</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Ensures GDPR, HIPAA, SOC2 compliance, validates evidence legal admissibility, and enforces retention policies
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-pink-500/20 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">user_engagement</h4>
                  <Badge className="bg-pink-500/20 text-pink-400 text-xs">Support & Training</Badge>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Guides users through onboarding, tracks feature adoption, collects feedback, and provides contextual help
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collaboration Patterns */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-orange-400" />
            Common Collaboration Patterns
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-slate-800/50 rounded-lg">
            <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              Pattern 1: Threat Investigation Pipeline
            </h4>
            <div className="flex items-center gap-2 text-sm text-slate-300 flex-wrap">
              <Badge className="bg-red-500/20 text-red-400">security_monitor</Badge>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-500">analyzes threats</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <Badge className="bg-blue-500/20 text-blue-400">compliance_guardian</Badge>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-500">validates legal</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <Badge className="bg-purple-500/20 text-purple-400">automation_workflow</Badge>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-500">executes response</span>
            </div>
          </div>

          <div className="p-4 bg-slate-800/50 rounded-lg">
            <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-green-400" />
              Pattern 2: Incident Response
            </h4>
            <div className="flex items-center gap-2 text-sm text-slate-300 flex-wrap">
              <Badge className="bg-purple-500/20 text-purple-400">automation_workflow</Badge>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-500">triggers containment</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <Badge className="bg-red-500/20 text-red-400">security_monitor</Badge>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-500">validates success</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <Badge className="bg-green-500/20 text-green-400">system_health_monitor</Badge>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-500">checks impact</span>
            </div>
          </div>

          <div className="p-4 bg-slate-800/50 rounded-lg">
            <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-400" />
              Pattern 3: System Degradation Response
            </h4>
            <div className="flex items-center gap-2 text-sm text-slate-300 flex-wrap">
              <Badge className="bg-green-500/20 text-green-400">system_health_monitor</Badge>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-500">detects issue</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <Badge className="bg-purple-500/20 text-purple-400">automation_workflow</Badge>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-500">runs cleanup</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <Badge className="bg-pink-500/20 text-pink-400">user_engagement</Badge>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-xs text-slate-500">notifies users</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Best Practices */}
      <Alert className="bg-blue-500/10 border-blue-500/30">
        <AlertTriangle className="h-5 w-5 text-blue-400" />
        <AlertDescription className="text-blue-300">
          <strong>Agent Collaboration Best Practices:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li>Always create conversation with workflow_id in metadata for tracking</li>
            <li>Use subscribeToConversation for real-time updates in production</li>
            <li>Handle agent timeouts gracefully with fallback strategies</li>
            <li>Log all cross-agent communications in AuditLog</li>
            <li>Validate agent responses before using in downstream steps</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}