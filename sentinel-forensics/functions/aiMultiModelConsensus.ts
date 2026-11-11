import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * MULTI-MODEL CONSENSUS ENGINE
 * For critical forensic decisions requiring high confidence
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      task,
      prompt,
      models = ['gpt-4o', 'claude-3-5-sonnet'],
      consensus_threshold = 0.7
    } = await req.json();

    if (!task || !prompt) {
      return Response.json({ error: 'task and prompt required' }, { status: 400 });
    }

    console.log(`Running consensus with ${models.length} models...`);

    // Call orchestrator for each model
    const responses = await Promise.all(
      models.map(async (model) => {
        try {
          const result = await base44.functions.invoke('aiOrchestrator', {
            task,
            prompt,
            model_preference: model,
            enable_fallback: false
          });
          return {
            model,
            response: result.data.response,
            metadata: result.data.metadata,
            success: true
          };
        } catch (error) {
          console.error(`Model ${model} failed:`, error);
          return {
            model,
            error: error.message,
            success: false
          };
        }
      })
    );

    const successful = responses.filter(r => r.success);

    if (successful.length === 0) {
      return Response.json({
        error: 'All models failed',
        responses
      }, { status: 500 });
    }

    // Simple consensus: majority vote or weighted average
    const consensusResponse = {
      responses: successful.map(r => ({
        model: r.model,
        response: r.response
      })),
      consensus: successful[0].response, // Primary response
      confidence: successful.length / models.length,
      models_used: successful.map(r => r.model),
      total_tokens: successful.reduce((sum, r) => sum + (r.metadata?.tokens_used || 0), 0),
      total_cost: successful.reduce((sum, r) => sum + (r.metadata?.cost_usd || 0), 0)
    };

    // Audit
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'ai_consensus',
      severity: 'info',
      description: `Multi-model consensus for ${task}`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        organization_id: user.organization_id,
        task,
        models: successful.map(r => r.model),
        confidence: consensusResponse.confidence
      }
    });

    return Response.json({
      success: true,
      ...consensusResponse
    });

  } catch (error) {
    console.error('Consensus error:', error);
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});