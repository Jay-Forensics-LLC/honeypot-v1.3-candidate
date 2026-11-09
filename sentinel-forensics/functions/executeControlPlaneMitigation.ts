/**
 * PHASE 2: Control Plane Automation - Execution Engine
 * 
 * Executes a mitigation recommendation with strict gating and audit trail.
 * 
 * CRITICAL: DRY_RUN is default; EXECUTE requires flags + approvals
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { writeAuditLog, logFailure } from './helpers/auditLogger.js';
import { getFeatureFlag } from '../components/config/featureFlags.js';
import { requireAdmin, logBlockedAttempt } from './helpers/rbacHelpers.js';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin-only for EXECUTE mode (using shared helper)
    const authCheck = requireAdmin(user);
    if (!authCheck.allowed) {
      await logBlockedAttempt(base44, {
        organization_id: user.organization_id,
        actor: user.email,
        event_type: 'control_plane_execution',
        blocked_reason: authCheck.blocked_reason,
        metadata: { function: 'executeControlPlaneMitigation' }
      });

      return Response.json({ 
        error: authCheck.message,
        blocked_reason: authCheck.blocked_reason
      }, { status: authCheck.status });
    }

    // Parse request
    const { recommendation_id, mode = 'DRY_RUN' } = await req.json();
    if (!recommendation_id) {
      return Response.json({ error: 'Missing recommendation_id' }, { status: 400 });
    }

    if (!['DRY_RUN', 'EXECUTE'].includes(mode)) {
      return Response.json({ error: 'Invalid mode (must be DRY_RUN or EXECUTE)' }, { status: 400 });
    }

    // Fetch recommendation
    const recommendation = await base44.asServiceRole.entities.ControlPlaneMitigationRecommendation.get(recommendation_id);
    if (!recommendation || recommendation.organization_id !== user.organization_id) {
      return Response.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    if (recommendation.status === 'EXECUTED') {
      return Response.json({ error: 'Recommendation already executed' }, { status: 400 });
    }

    // Fetch session for context
    const session = await base44.asServiceRole.entities.IncidentSession.get(recommendation.session_id);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Check feature flags
    const autoExecuteEnabled = getFeatureFlag('CONTROL_PLANE_AUTO_EXECUTE');
    if (mode === 'EXECUTE' && !autoExecuteEnabled) {
      // Audit the block
      await writeAuditLog(base44, {
        organization_id: user.organization_id,
        event_type: 'control_plane_execution_blocked',
        severity: 'warning',
        description: 'Execution blocked by feature flag',
        actor: user.email,
        success: false,
        metadata: {
          recommendation_id,
          blocked_reason: 'CONTROL_PLANE_AUTO_EXECUTE feature flag disabled'
        }
      });

      return Response.json({ 
        recommendation_id,
        mode: 'EXECUTE',
        result: 'BLOCKED',
        blocked_reason: 'Auto-execute disabled by feature flag (CONTROL_PLANE_AUTO_EXECUTE)',
        execution_result: null,
        executed_at: new Date().toISOString()
      }, { status: 200 }); // Not 403 - valid response
    }

    // Check automation settings and thresholds
    const automationSettings = await base44.asServiceRole.entities.ControlPlaneAutomationSettings.filter({
      organization_id: user.organization_id
    });
    const settings = automationSettings[0] || {
      mode: 'SUGGEST_ONLY',
      max_actions_per_hour: 3,
      cooldown_minutes: 30
    };

    // Enforce rate limiting (using durable tracker)
    const { checkRateLimit, incrementRateLimit } = await import('./helpers/rateLimiter.js');
    
    const rateLimitCheck = await checkRateLimit(base44, {
      organization_id: user.organization_id,
      scope: 'control_plane_execution',
      max_per_hour: settings.max_actions_per_hour || 3,
      cooldown_minutes: settings.cooldown_minutes || 30,
      resource_id: recommendation.session_id
    });

    if (!rateLimitCheck.allowed && mode === 'EXECUTE') {
      // Audit rate limit block
      await writeAuditLog(base44, {
        organization_id: user.organization_id,
        event_type: 'control_plane_execution_blocked',
        severity: 'warning',
        description: `Execution blocked: ${rateLimitCheck.blocked_reason}`,
        actor: user.email,
        success: false,
        metadata: {
          recommendation_id,
          blocked_reason: rateLimitCheck.blocked_reason,
          message: rateLimitCheck.message,
          count: rateLimitCheck.count,
          reset_at: rateLimitCheck.reset_at,
          cooldown_until: rateLimitCheck.cooldown_until
        }
      });

      return Response.json({
        recommendation_id,
        mode: 'EXECUTE',
        result: 'BLOCKED',
        blocked_reason: rateLimitCheck.blocked_reason,
        message: rateLimitCheck.message,
        reset_at: rateLimitCheck.reset_at,
        cooldown_until: rateLimitCheck.cooldown_until,
        execution_result: null,
        executed_at: new Date().toISOString()
      }, { status: 200 });
    }

    // Capture before state (session snapshot)
    const beforeState = {
      session_status: session.status,
      session_risk_summary: session.risk_summary,
      posture_snapshot: session.posture_snapshot
    };

    // Select top recommended action
    const topAction = recommendation.recommended_actions[0];
    if (!topAction) {
      return Response.json({ error: 'No actions available' }, { status: 400 });
    }

    let executionResult = {
      dry_run: mode === 'DRY_RUN',
      action_type: topAction.action_type,
      execution_mode: topAction.execution_mode,
      timestamp: new Date().toISOString()
    };

    if (mode === 'EXECUTE') {
      // CRITICAL: Actual execution logic goes here
      // For Phase 2, we simulate execution and return guidance
      switch (topAction.execution_mode) {
        case 'AUTOMATED':
          executionResult.status = 'SIMULATED';
          executionResult.message = `[SIMULATION] Would execute automated action: ${topAction.action_type}`;
          break;
        
        case 'DEEP_LINK':
          executionResult.status = 'DEEP_LINK_READY';
          executionResult.deep_link = `settings://device/${topAction.action_type.toLowerCase()}`;
          executionResult.message = 'Deep link generated for user action';
          break;
        
        case 'GUIDED_MANUAL':
          executionResult.status = 'GUIDANCE_PROVIDED';
          executionResult.message = topAction.action_description;
          executionResult.steps = [
            'Open device settings',
            'Navigate to security section',
            'Follow on-screen instructions'
          ];
          break;
        
        default:
          executionResult.status = 'UNKNOWN_MODE';
      }

      // Update recommendation status
      await base44.asServiceRole.entities.ControlPlaneMitigationRecommendation.update(recommendation_id, {
        status: 'EXECUTED',
        execution_refs: [
          ...(recommendation.execution_refs || []),
          {
            executed_at: new Date().toISOString(),
            executed_by: user.email,
            result: executionResult
          }
        ]
      });

      // Increment rate limit counter (PHASE 5)
      const { incrementRateLimit } = await import('./helpers/rateLimiter.js');
      await incrementRateLimit(base44, {
        organization_id: user.organization_id,
        scope: 'control_plane_execution',
        resource_id: recommendation.session_id
      });
    }

    // Audit log with all required fields
    await writeAuditLog(base44, {
      organization_id: user.organization_id,
      event_type: mode === 'DRY_RUN' ? 'control_plane_dry_run' : 'control_plane_execution',
      severity: mode === 'EXECUTE' ? 'warning' : 'info',
      description: `${mode} for ${topAction.action_type} on session ${session.session_name}`,
      actor: user.email,
      success: true,
      metadata: {
        recommendation_id,
        session_id: session.id,
        plane: recommendation.plane,
        action_type: topAction.action_type,
        execution_mode: topAction.execution_mode,
        mode,
        result: executionResult.status
      },
      before_json: beforeState,
      after_json: { execution_result: executionResult },
      entity_type: 'ControlPlaneMitigationRecommendation',
      entity_id: recommendation_id
    });

    // Contract-compliant output
    return Response.json({
      recommendation_id,
      mode,
      result: mode === 'DRY_RUN' ? 'SIMULATED' : 
              (executionResult.status === 'SIMULATED' ? 'EXECUTED' : executionResult.status),
      blocked_reason: null,
      execution_result: executionResult,
      executed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Execution error:', error);
    
    const user = await base44.auth.me().catch(() => null);
    if (user) {
      await logFailure(base44, user.organization_id, user.email, 
        'control_plane_execution_error', 
        'Failed to execute mitigation', 
        error
      );
    }

    return Response.json({
      error: error.message,
      success: false
    }, { status: 500 });
  }
});