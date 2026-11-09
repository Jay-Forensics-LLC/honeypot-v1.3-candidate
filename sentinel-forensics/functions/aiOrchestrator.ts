import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import OpenAI from 'npm:openai@4.67.3';
import { z } from 'npm:zod@3.24.1';

/**
 * AI ORCHESTRATION LAYER
 * Multi-model routing with cost optimization and tier enforcement
 */

// Model Registry
const MODELS = {
  'gpt-4o': {
    provider: 'openai',
    costPer1kTokens: { input: 0.005, output: 0.015 },
    context: 128000,
    capabilities: ['reasoning', 'analysis', 'legal', 'executive_summary']
  },
  'gpt-4o-mini': {
    provider: 'openai',
    costPer1kTokens: { input: 0.00015, output: 0.0006 },
    context: 128000,
    capabilities: ['quick_summary', 'ioc_scoring', 'batch_analysis']
  },
  'claude-3-5-sonnet': {
    provider: 'anthropic',
    costPer1kTokens: { input: 0.003, output: 0.015 },
    context: 200000,
    capabilities: ['forensic_analysis', 'technical_detail', 'reasoning', 'compliance']
  },
  'claude-3-5-haiku': {
    provider: 'anthropic',
    costPer1kTokens: { input: 0.001, output: 0.005 },
    context: 200000,
    capabilities: ['quick_analysis', 'classification', 'triage']
  }
};

// Task-to-Model Routing
const TASK_ROUTING = {
  'forensic_report': ['claude-3-5-sonnet', 'gpt-4o'], // Claude primary, GPT fallback
  'executive_summary': ['gpt-4o', 'claude-3-5-sonnet'],
  'legal_document': ['gpt-4o', 'claude-3-5-sonnet'],
  'threat_analysis': ['claude-3-5-sonnet', 'gpt-4o'],
  'ioc_scoring': ['gpt-4o-mini', 'claude-3-5-haiku'],
  'quick_summary': ['gpt-4o-mini', 'claude-3-5-haiku'],
  'timeline_analysis': ['claude-3-5-sonnet', 'gpt-4o'],
  'incident_response': ['claude-3-5-sonnet', 'gpt-4o'],
  'compliance_audit': ['claude-3-5-sonnet', 'gpt-4o'],
  'evidence_suggestion': ['gpt-4o', 'claude-3-5-sonnet']
};

// Subscription Tier Limits (tokens per month)
const TIER_LIMITS = {
  'free': 10000,
  'professional': 100000,
  'enterprise': 1000000,
  'forensic_suite': -1 // unlimited
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();

    // Schema validation
    const PayloadSchema = z.object({
      orgId: z.string().uuid().optional(),
      userId: z.string().optional(),
      taskType: z.string().optional(),
      task: z.string().optional(),
      sensitivity: z.enum(['low', 'medium', 'high']).optional(),
      costTier: z.string().optional(),
      latencyToleranceMs: z.number().optional(),
      input: z.object({
        prompt: z.string(),
        context: z.any().optional(),
        rawDataRefs: z.array(z.string()).optional()
      }).optional(),
      prompt: z.string().optional(),
      response_json_schema: z.any().optional(),
      model_preference: z.string().optional(),
      max_tokens: z.number().optional(),
      temperature: z.number().optional(),
      enable_fallback: z.boolean().optional()
    }).refine(data => data.taskType || data.task, {
      message: 'Either taskType or task must be provided'
    }).refine(data => data.input?.prompt || data.prompt, {
      message: 'Either input.prompt or prompt must be provided'
    });

    const validationResult = PayloadSchema.safeParse(payload);
    if (!validationResult.success) {
      return Response.json({
        error: 'Validation failed',
        details: validationResult.error.errors
      }, { status: 400 });
    }

    // Support both legacy and new payload formats
    const {
      // New structured format
      orgId,
      userId,
      taskType,
      sensitivity = 'medium',
      costTier,
      latencyToleranceMs = 10000,
      input,
      // Legacy format (backwards compatible)
      task,
      prompt,
      response_json_schema,
      model_preference,
      max_tokens = 4000,
      temperature = 0.7,
      enable_fallback = true
    } = payload;

    // Normalize to new format
    const normalizedTask = taskType || task;
    const normalizedPrompt = input?.prompt || prompt;
    const contextData = input?.context;
    const rawDataRefs = input?.rawDataRefs;

    if (!normalizedTask || !normalizedPrompt) {
      return Response.json({ error: 'taskType/task and prompt required' }, { status: 400 });
    }

    // Get organization and subscription tier
    const organization_id = orgId || user.organization_id;
    const subscription_tier = costTier || user.subscription_tier || 'free';

    // Check usage limits
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const usageMetrics = await base44.asServiceRole.entities.UsageMetric.filter({
      organization_id,
      metric_type: 'ai_tokens',
      month: currentMonth
    });

    const currentUsage = usageMetrics[0]?.value || 0;
    const tierLimit = TIER_LIMITS[subscription_tier];

    if (tierLimit !== -1 && currentUsage >= tierLimit) {
      return Response.json({
        error: 'Token limit exceeded',
        message: `Your ${subscription_tier} tier allows ${tierLimit} tokens/month. Current usage: ${currentUsage}.`,
        upgrade_url: '/Subscription'
      }, { status: 429 });
    }

    // Enrich context from rawDataRefs
    let enrichedPrompt = normalizedPrompt;
    if (rawDataRefs && rawDataRefs.length > 0) {
      try {
        const evidenceData = await base44.asServiceRole.entities.EvidenceV2.filter({
          id: { $in: rawDataRefs },
          organization_id
        });
        
        const logData = await base44.asServiceRole.entities.NetworkLog.filter({
          id: { $in: rawDataRefs },
          organization_id
        });

        const enrichedContext = {
          evidence: evidenceData,
          logs: logData,
          additional: contextData
        };

        enrichedPrompt = `${normalizedPrompt}\n\n### Context Data:\n${JSON.stringify(enrichedContext, null, 2)}`;
      } catch (err) {
        console.warn('Failed to enrich context:', err);
      }
    } else if (contextData) {
      enrichedPrompt = `${normalizedPrompt}\n\n### Context:\n${JSON.stringify(contextData, null, 2)}`;
    }

    // Select model based on sensitivity, latency, and cost
    let modelCandidates = TASK_ROUTING[normalizedTask] || ['gpt-4o-mini'];
    
    // Sensitivity-aware routing
    if (sensitivity === 'high') {
      // High sensitivity: use best models regardless of cost
      modelCandidates = ['claude-3-5-sonnet', 'gpt-4o'];
    } else if (sensitivity === 'low') {
      // Low sensitivity: optimize for speed/cost
      modelCandidates = ['gpt-4o-mini', 'claude-3-5-haiku'];
    }

    // Latency-aware selection
    if (latencyToleranceMs < 5000) {
      // Low latency requirement: prefer faster models
      modelCandidates = modelCandidates.filter(m => 
        m.includes('mini') || m.includes('haiku')
      );
      if (modelCandidates.length === 0) {
        modelCandidates = ['gpt-4o-mini']; // Fallback to fastest
      }
    }

    let selectedModel = model_preference || modelCandidates[0];
    
    // Cost optimization for free tier (override sensitivity if needed)
    if ((subscription_tier === 'free' || costTier === 'free') && !model_preference) {
      selectedModel = 'gpt-4o-mini'; // Force cheapest model
    }

    const modelConfig = MODELS[selectedModel];
    if (!modelConfig) {
      return Response.json({ error: `Unknown model: ${selectedModel}` }, { status: 400 });
    }

    // Execute LLM call
    let response;
    let tokensUsed = 0;
    let costIncurred = 0;
    const startTime = Date.now();

    try {
      if (modelConfig.provider === 'openai') {
        const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
        
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [{ role: 'user', content: enrichedPrompt }],
          max_tokens,
          temperature,
          ...(response_json_schema && { 
            response_format: { type: 'json_object' }
          })
        });

        response = response_json_schema 
          ? JSON.parse(completion.choices[0].message.content)
          : completion.choices[0].message.content;

        tokensUsed = completion.usage.total_tokens;
        costIncurred = (
          (completion.usage.prompt_tokens / 1000) * modelConfig.costPer1kTokens.input +
          (completion.usage.completion_tokens / 1000) * modelConfig.costPer1kTokens.output
        );

      } else if (modelConfig.provider === 'anthropic') {
        // Use Base44 Core.InvokeLLM as proxy for Anthropic
        response = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: enrichedPrompt,
          add_context_from_internet: false,
          response_json_schema
        });

        // Estimate tokens (rough approximation)
        tokensUsed = Math.ceil((enrichedPrompt.length + JSON.stringify(response).length) / 4);
        costIncurred = (tokensUsed / 1000) * modelConfig.costPer1kTokens.input;
      }

    } catch (error) {
      console.error('Primary model failed:', error);

      // Fallback to secondary model
      if (enable_fallback && modelCandidates.length > 1) {
        const fallbackModel = modelCandidates[1];
        console.log(`Falling back to: ${fallbackModel}`);
        
        // Recursive call with fallback model
        return fetch(req.url, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify({
            ...payload,
            taskType: normalizedTask,
            input: { prompt: enrichedPrompt },
            model_preference: fallbackModel,
            enable_fallback: false // Prevent infinite recursion
          })
        });
      }

      throw error;
    }

    const duration = Date.now() - startTime;

    // Update usage metrics
    await base44.asServiceRole.entities.UsageMetric.create({
      organization_id,
      metric_type: 'ai_tokens',
      month: currentMonth,
      value: currentUsage + tokensUsed,
      metadata: {
        task: normalizedTask,
        model: selectedModel,
        tokens_used: tokensUsed,
        cost_incurred: costIncurred,
        duration_ms: duration,
        sensitivity,
        latency_tolerance_ms: latencyToleranceMs,
        enriched: !!(rawDataRefs && rawDataRefs.length > 0)
      }
    });

    // Audit log with blockchain hash
    const auditData = {
      organization_id,
      event_type: 'ai_orchestration',
      severity: 'info',
      description: `AI task: ${normalizedTask} (sensitivity: ${sensitivity}) completed with ${selectedModel}`,
      user_id: userId || user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        task: normalizedTask,
        model: selectedModel,
        tokens_used: tokensUsed,
        cost: costIncurred.toFixed(4),
        sensitivity,
        latency_ms: duration,
        latency_tolerance_ms: latencyToleranceMs
      }
    };
    
    // Generate blockchain hash
    const dataToHash = JSON.stringify({
      ...auditData,
      sequence: Date.now()
    });
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataToHash));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const blockchainHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    await base44.asServiceRole.entities.AuditLog.create({
      ...auditData,
      blockchain_hash: blockchainHash
    });

    return Response.json({
      success: true,
      response,
      metadata: {
        model: selectedModel,
        provider: modelConfig.provider,
        tokens_used: tokensUsed,
        cost_usd: parseFloat(costIncurred.toFixed(4)),
        duration_ms: duration,
        tier: subscription_tier,
        sensitivity,
        latency_tolerance_ms: latencyToleranceMs,
        latency_achieved_ms: duration,
        context_enriched: !!(rawDataRefs && rawDataRefs.length > 0),
        usage: {
          current: currentUsage + tokensUsed,
          limit: tierLimit === -1 ? 'unlimited' : tierLimit
        }
      }
    });

  } catch (error) {
    console.error('AI Orchestrator error:', error);
    return Response.json({
      error: error.message || 'Orchestration failed',
      stack: error.stack
    }, { status: 500 });
  }
});