import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Sparkles, 
  Brain, 
  Wand2, 
  MessageSquare,
  CheckCircle,
  Copy
} from "lucide-react";
import { toast } from "sonner";

export default function AIRuleAssistant() {
  const [naturalLanguage, setNaturalLanguage] = useState('');
  const [generatedRule, setGeneratedRule] = useState(null);
  const [existingRule, setExistingRule] = useState('');
  const [debugOutput, setDebugOutput] = useState('');

  const generateRuleMutation = useMutation({
    mutationFn: async (prompt) => {
      // SECURITY: Guard against direct prompt injection
      const { guardUserAIExperience } = await import('@/components/security/AIInjectionGuard');
      
      const guard = guardUserAIExperience({
        userInput: prompt,
        taskPrompt: `You are a cybersecurity expert. Generate a detection rule based on this request. Create a SIGMA-style or YARA-style detection rule in JSON format with: 1. rule_name 2. description 3. severity (critical/high/medium/low) 4. detection_logic (conditions) 5. tags 6. references`,
        profile: "enterprise",
      });

      if (guard.blocked) {
        throw new Error("🛡️ Blocked: input resembles a prompt-injection attempt. Please rephrase your request without instruction-override language.");
      }

      if (guard.challenge) {
        const proceed = window.confirm(
          `⚠️ Security Warning\n\nYour input looks like it might be trying to override AI instructions (score: ${guard.worstReport?.score}/100).\n\nPatterns detected: ${guard.worstReport?.indicators?.map(i => i.category).join(', ')}\n\nDo you want to proceed anyway?`
        );
        
        if (!proceed) {
          throw new Error("Analysis cancelled by user");
        }
      }

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: guard.hardenedPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            rule_name: { type: "string" },
            description: { type: "string" },
            severity: { type: "string" },
            rule_type: { type: "string" },
            detection_logic: { type: "object" },
            tags: { type: "array", items: { type: "string" } },
            references: { type: "array", items: { type: "string" } },
            confidence: { type: "number" }
          }
        }
      });

      return response;
    },
    onSuccess: (data) => {
      setGeneratedRule(data);
      toast.success('Rule generated successfully!');
    },
    onError: () => {
      toast.error('Failed to generate rule');
    }
  });

  const debugRuleMutation = useMutation({
    mutationFn: async (ruleCode) => {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a detection rule debugging expert. Analyze this detection rule and identify any issues:\n\n${ruleCode}\n\nProvide:\n1. Syntax errors (if any)\n2. Logic errors (if any)\n3. Performance concerns\n4. Security gaps\n5. Suggested improvements\n\nBe specific and actionable.`
      });

      return response;
    },
    onSuccess: (data) => {
      setDebugOutput(data);
      toast.success('Rule debugged successfully!');
    },
    onError: () => {
      toast.error('Failed to debug rule');
    }
  });

  const optimizeRuleMutation = useMutation({
    mutationFn: async (ruleCode) => {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a detection rule optimization expert. Optimize this detection rule for better performance and accuracy:\n\n${ruleCode}\n\nProvide the optimized version with explanations of improvements made.`,
        response_json_schema: {
          type: "object",
          properties: {
            optimized_rule: { type: "string" },
            improvements: { type: "array", items: { type: "string" } },
            performance_gain: { type: "string" },
            accuracy_improvement: { type: "string" }
          }
        }
      });

      return response;
    },
    onSuccess: (data) => {
      setGeneratedRule({
        ...data,
        rule_name: 'Optimized Rule',
        description: 'AI-optimized detection rule',
        severity: 'high'
      });
      toast.success('Rule optimized!');
    },
    onError: () => {
      toast.error('Failed to optimize rule');
    }
  });

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(JSON.stringify(text, null, 2));
    toast.success('Copied to clipboard');
  };

  const saveRule = async () => {
    if (!generatedRule) return;

    try {
      await base44.entities.DetectionRule.create({
        rule_id: `RULE-AI-${Date.now()}`,
        rule_name: generatedRule.rule_name,
        rule_type: generatedRule.rule_type || 'custom',
        description: generatedRule.description,
        severity: generatedRule.severity || 'medium',
        rule_logic: generatedRule.detection_logic,
        enabled: false, // Start disabled for testing
        tags: generatedRule.tags || [],
        detection_count: 0,
        false_positive_count: 0
      });

      toast.success('Rule saved to Detection Rules!');
    } catch (error) {
      toast.error('Failed to save rule');
    }
  };

  return (
    <Tabs defaultValue="generate" className="space-y-6">
      <TabsList className="bg-slate-900/50">
        <TabsTrigger value="generate">
          <Wand2 className="w-4 h-4 mr-2" />
          Generate Rule
        </TabsTrigger>
        <TabsTrigger value="debug">
          <Brain className="w-4 h-4 mr-2" />
          Debug Rule
        </TabsTrigger>
        <TabsTrigger value="optimize">
          <Sparkles className="w-4 h-4 mr-2" />
          Optimize Rule
        </TabsTrigger>
      </TabsList>

      {/* Generate Tab */}
      <TabsContent value="generate">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-blue-400" />
              Generate Rule from Natural Language
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">
                Describe what you want to detect:
              </label>
              <Textarea
                value={naturalLanguage}
                onChange={(e) => setNaturalLanguage(e.target.value)}
                placeholder="e.g., Detect when a BLE device advertises with unusual RSSI values that change too quickly, indicating possible spoofing..."
                className="bg-slate-800 border-slate-700 h-32"
              />
            </div>

            <Button
              onClick={() => generateRuleMutation.mutate(naturalLanguage)}
              disabled={!naturalLanguage.trim() || generateRuleMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {generateRuleMutation.isPending ? (
                <>
                  <Brain className="w-4 h-4 mr-2 animate-pulse" />
                  Generating with AI...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Detection Rule
                </>
              )}
            </Button>

            {generatedRule && (
              <div className="space-y-3 mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Generated Rule:</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(generatedRule)}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveRule}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Save Rule
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-slate-800/50 rounded border border-green-500">
                  <div className="flex items-start gap-3 mb-3">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-1" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">{generatedRule.rule_name}</h4>
                      <p className="text-sm text-slate-400 mt-1">{generatedRule.description}</p>
                    </div>
                    <Badge className={
                      generatedRule.severity === 'critical' ? 'bg-red-500' :
                      generatedRule.severity === 'high' ? 'bg-orange-500' :
                      generatedRule.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                    }>
                      {generatedRule.severity}
                    </Badge>
                  </div>

                  <div className="mt-3">
                    <label className="text-xs text-slate-500 mb-1 block">Detection Logic:</label>
                    <pre className="bg-slate-950 p-3 rounded text-xs text-green-400 overflow-x-auto font-mono">
                      {JSON.stringify(generatedRule.detection_logic, null, 2)}
                    </pre>
                  </div>

                  {generatedRule.tags && generatedRule.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {generatedRule.tags.map((tag, i) => (
                        <Badge key={i} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  )}

                  {generatedRule.confidence && (
                    <div className="mt-3 text-xs text-slate-400">
                      AI Confidence: {Math.round(generatedRule.confidence * 100)}%
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Debug Tab */}
      <TabsContent value="debug">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              Debug Detection Rule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">
                Paste your rule code:
              </label>
              <Textarea
                value={existingRule}
                onChange={(e) => setExistingRule(e.target.value)}
                placeholder="Paste JSON, YAML, or SIGMA rule here..."
                className="bg-slate-800 border-slate-700 h-48 font-mono text-sm"
              />
            </div>

            <Button
              onClick={() => debugRuleMutation.mutate(existingRule)}
              disabled={!existingRule.trim() || debugRuleMutation.isPending}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {debugRuleMutation.isPending ? (
                <>
                  <Brain className="w-4 h-4 mr-2 animate-pulse" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Debug Rule
                </>
              )}
            </Button>

            {debugOutput && (
              <div className="p-4 bg-purple-500/10 rounded border border-purple-500">
                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-purple-400" />
                  AI Analysis:
                </h3>
                <div className="prose prose-invert prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm text-slate-300">
                    {debugOutput}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Optimize Tab */}
      <TabsContent value="optimize">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              Optimize Detection Rule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">
                Paste rule to optimize:
              </label>
              <Textarea
                value={existingRule}
                onChange={(e) => setExistingRule(e.target.value)}
                placeholder="Paste your rule code here for AI optimization..."
                className="bg-slate-800 border-slate-700 h-48 font-mono text-sm"
              />
            </div>

            <Button
              onClick={() => optimizeRuleMutation.mutate(existingRule)}
              disabled={!existingRule.trim() || optimizeRuleMutation.isPending}
              className="w-full bg-yellow-600 hover:bg-yellow-700"
            >
              {optimizeRuleMutation.isPending ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                  Optimizing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Optimize Rule
                </>
              )}
            </Button>

            {generatedRule && generatedRule.improvements && (
              <div className="space-y-3">
                <div className="p-4 bg-yellow-500/10 rounded border border-yellow-500">
                  <h3 className="font-semibold text-white mb-3">Optimized Rule:</h3>
                  <pre className="bg-slate-950 p-3 rounded text-xs text-yellow-400 overflow-x-auto font-mono mb-3">
                    {generatedRule.optimized_rule}
                  </pre>

                  <h4 className="font-semibold text-white mb-2 text-sm">Improvements Made:</h4>
                  <ul className="space-y-2">
                    {generatedRule.improvements.map((improvement, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>

                  {generatedRule.performance_gain && (
                    <div className="mt-3 p-2 bg-green-500/10 rounded text-sm text-green-400">
                      ⚡ Performance Gain: {generatedRule.performance_gain}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(generatedRule.optimized_rule)}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Optimized Rule
                  </Button>
                  <Button
                    onClick={saveRule}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Save to Rules
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Info */}
      <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500">
        <div className="flex items-start gap-3 text-sm text-blue-400">
          <Sparkles className="w-5 h-5 mt-0.5" />
          <div>
            <strong>AI Rule Assistant:</strong> Generate, debug, and optimize detection rules using advanced AI. 
            Describe threats in natural language and get production-ready detection rules instantly.
          </div>
        </div>
      </div>
    </Tabs>
  );
}