/**
 * PHASE 2: Control Plane Automation - Evaluation Engine
 * 
 * Generates mitigation recommendations for a Control Plane Defense session
 * based on detected indicators and current risk posture.
 * 
 * CRITICAL: Deterministic mapping + AI ranking only (no invented actions)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { writeAuditLog, logFailure } from './helpers/auditLogger.js';
import { getFeatureFlag } from '../components/config/featureFlags.js';

/**
 * Deterministic action mappings per control plane
 */
const ACTION_MAPPINGS = {
  CARRIER: {
    SIM_SWAP_DETECTED: [
      {
        action_type: 'CONTACT_CARRIER',
        action_title: 'Contact Carrier Security Team',
        action_description: 'Immediately contact carrier to verify recent SIM changes and request account freeze',
        execution_mode: 'GUIDED_MANUAL',
        estimated_risk_reduction: 80
      },
      {
        action_type: 'VERIFY_ACCOUNT_CHANGES',
        action_title: 'Verify Recent Account Changes',
        action_description: 'Review carrier account activity log for unauthorized changes',
        execution_mode: 'GUIDED_MANUAL',
        estimated_risk_reduction: 60
      }
    ]
  },
  ACCOUNT: {
    UNKNOWN_DEVICE_ADMIN: [
      {
        action_type: 'REVOKE_ADMIN_RIGHTS',
        action_title: 'Revoke Unknown Device Admin',
        action_description: 'Immediately revoke device admin rights from unknown application',
        execution_mode: 'DEEP_LINK',
        estimated_risk_reduction: 90
      },
      {
        action_type: 'FORCE_PASSWORD_RESET',
        action_title: 'Force Password Reset',
        action_description: 'Require immediate password reset for all linked accounts',
        execution_mode: 'GUIDED_MANUAL',
        estimated_risk_reduction: 70
      }
    ],
    SUSPICIOUS_LOGIN: [
      {
        action_type: 'REVOKE_SESSIONS',
        action_title: 'Revoke All Active Sessions',
        action_description: 'Force logout from all devices and locations',
        execution_mode: 'AUTOMATED',
        estimated_risk_reduction: 85
      }
    ]
  },
  DEVICE: {
    MALWARE_SUSPECTED: [
      {
        action_type: 'ISOLATE_DEVICE',
        action_title: 'Network Isolation',
        action_description: 'Disconnect device from all networks to prevent lateral movement',
        execution_mode: 'AUTOMATED',
        estimated_risk_reduction: 95
      },
      {
        action_type: 'CAPTURE_TRIAGE',
        action_title: 'Capture Triage Bundle',
        action_description: 'Collect running processes, network connections, and file system snapshot',
        execution_mode: 'AUTOMATED',
        estimated_risk_reduction: 50
      }
    ],
    UNKNOWN_SOURCES_ENABLED: [
      {
        action_type: 'DISABLE_UNKNOWN_SOURCES',
        action_title: 'Disable Unknown Sources',
        action_description: 'Turn off installation from unknown sources',
        execution_mode: 'DEEP_LINK',
        estimated_risk_reduction: 60
      }
    ]
  },
  NETWORK: {
    SUSPICIOUS_VPN: [
      {
        action_type: 'DISABLE_VPN',
        action_title: 'Disable Suspicious VPN',
        action_description: 'Disconnect and disable suspicious VPN connection',
        execution_mode: 'DEEP_LINK',
        estimated_risk_reduction: 70
      }
    ],
    UNTRUSTED_WIFI: [
      {
        action_type: 'DISCONNECT_NETWORK',
        action_title: 'Disconnect from Network',
        action_description: 'Immediately disconnect from untrusted WiFi network',
        execution_mode: 'AUTOMATED',
        estimated_risk_reduction: 75
      }
    ]
  },
  PHYSICAL: {
    DEVICE_TAMPERED: [
      {
        action_type: 'VERIFY_PHYSICAL_INTEGRITY',
        action_title: 'Verify Physical Integrity',
        action_description: 'Conduct visual inspection for hardware tampering or modifications',
        execution_mode: 'GUIDED_MANUAL',
        estimated_risk_reduction: 40
      }
    ]
  }
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request
    const { session_id } = await req.json();
    if (!session_id) {
      return Response.json({ error: 'Missing session_id' }, { status: 400 });
    }

    // Fetch session and indicators
    const [session, indicators] = await Promise.all([
      base44.asServiceRole.entities.IncidentSession.get(session_id),
      base44.asServiceRole.entities.ControlPlaneIndicator.filter({
        session_id,
        organization_id: user.organization_id
      })
    ]);

    if (!session || session.organization_id !== user.organization_id) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Check automation settings
    const automationSettings = await base44.asServiceRole.entities.ControlPlaneAutomationSettings.filter({
      organization_id: user.organization_id
    });
    const settings = automationSettings[0] || {
      mode: 'SUGGEST_ONLY',
      min_overall_risk_score: 70,
      min_indicator_severity: 'HIGH',
      enabled_planes: ['ACCOUNT', 'DEVICE']
    };

    // Filter indicators by severity threshold
    const severityOrder = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    const minSeverityLevel = severityOrder[settings.min_indicator_severity] || 3;
    
    const qualifyingIndicators = indicators.filter(ind => {
      const indSeverity = severityOrder[ind.severity] || 0;
      return indSeverity >= minSeverityLevel && 
             settings.enabled_planes.includes(ind.plane) &&
             ind.status !== 'FALSE_POSITIVE';
    });

    const warnings = [];
    const recommendations = [];

    // Generate candidate actions per indicator (deterministic)
    for (const indicator of qualifyingIndicators) {
      const planeActions = ACTION_MAPPINGS[indicator.plane];
      if (!planeActions) {
        warnings.push(`No action mappings defined for plane: ${indicator.plane}`);
        continue;
      }

      const candidateActions = planeActions[indicator.indicator_type];
      if (!candidateActions) {
        warnings.push(`No action mappings for indicator type: ${indicator.indicator_type}`);
        continue;
      }

      // Check cooldown via existing recommendations
      const recentRecs = await base44.asServiceRole.entities.ControlPlaneMitigationRecommendation.filter({
        session_id,
        plane: indicator.plane,
        status: { $in: ['OPEN', 'QUEUED', 'EXECUTED'] }
      });

      const cooldownMinutes = settings.cooldown_minutes || 30;
      const now = new Date();
      const recentExecution = recentRecs.find(rec => {
        const generatedAt = new Date(rec.generated_at);
        const minutesAgo = (now - generatedAt) / (1000 * 60);
        return minutesAgo < cooldownMinutes;
      });

      if (recentExecution) {
        const cooldownUntil = new Date(new Date(recentExecution.generated_at).getTime() + cooldownMinutes * 60000).toISOString();
        warnings.push(`Cooldown active for ${indicator.plane} until ${cooldownUntil}`);
        
        // Still create recommendation but mark it with cooldown
        const cooldownRec = await base44.asServiceRole.entities.ControlPlaneMitigationRecommendation.create({
          organization_id: user.organization_id,
          session_id,
          plane: indicator.plane,
          indicator_id: indicator.id,
          recommended_actions: candidateActions,
          rationale: `Cooldown active - action suppressed until ${cooldownUntil}`,
          risk_score_context: {
            session_overall_score: session.risk_summary?.overall_score || 0,
            plane_score: session.risk_summary?.[`${indicator.plane.toLowerCase()}_score`] || 0,
            indicator_weight: indicator.weight || 50,
            contributing_factors: [indicator.title]
          },
          confidence_score: 100,
          status: 'DISMISSED',
          dismissed_reason: `Cooldown active (${cooldownMinutes} min)`,
          dismissed_at: new Date().toISOString(),
          dismissed_by: 'system',
          generated_at: new Date().toISOString()
        });
        
        continue;
      }

      // AI ranking (optional) - for now, use estimated_risk_reduction
      const rankedActions = candidateActions.sort((a, b) => 
        b.estimated_risk_reduction - a.estimated_risk_reduction
      );

      // Create recommendation
      const recommendation = await base44.asServiceRole.entities.ControlPlaneMitigationRecommendation.create({
        organization_id: user.organization_id,
        session_id,
        plane: indicator.plane,
        indicator_id: indicator.id,
        recommended_actions: rankedActions,
        rationale: `Generated based on detected ${indicator.indicator_type} with severity ${indicator.severity}`,
        risk_score_context: {
          session_overall_score: session.risk_summary?.overall_score || 0,
          plane_score: session.risk_summary?.[`${indicator.plane.toLowerCase()}_score`] || 0,
          indicator_weight: indicator.weight || 50,
          contributing_factors: [indicator.title]
        },
        confidence_score: 100, // Deterministic mapping = 100% confidence
        status: 'OPEN',
        generated_at: new Date().toISOString()
      });

      recommendations.push(recommendation);

      // If mode requires approval, create queue item
      let approvalQueueItemId = null;
      if (settings.mode === 'REQUIRE_APPROVAL' || settings.mode === 'AUTO_EXECUTE') {
        for (const action of rankedActions.slice(0, 1)) { // Queue top action only
          const queueItem = await base44.asServiceRole.entities.ApprovalQueueItem.create({
            organization_id: user.organization_id,
            category: 'CONTROL_PLANE_ACTION',
            status: 'PENDING_APPROVAL',
            priority: indicator.severity === 'CRITICAL' ? 'CRITICAL' : 
                     indicator.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
            title: action.action_title,
            description: action.action_description,
            requested_by: 'system',
            requested_at: new Date().toISOString(),
            payload: {
              recommendation_id: recommendation.id,
              session_id,
              plane: indicator.plane,
              action_type: action.action_type,
              execution_mode: action.execution_mode
            },
            related_entity_type: 'ControlPlaneMitigationRecommendation',
            related_entity_id: recommendation.id
          });
          approvalQueueItemId = queueItem.id;
          
          // Update recommendation with queue reference
          await base44.asServiceRole.entities.ControlPlaneMitigationRecommendation.update(recommendation.id, {
            status: 'QUEUED',
            execution_refs: [{
              approval_id: queueItem.id,
              queued_at: new Date().toISOString()
            }]
          });

          // Audit queue creation
          await writeAuditLog(base44, {
            organization_id: user.organization_id,
            event_type: 'control_plane_approval_queued',
            severity: 'info',
            description: `Queued ${action.action_type} for approval`,
            actor: 'system',
            success: true,
            metadata: {
              recommendation_id: recommendation.id,
              session_id,
              plane: indicator.plane,
              approval_queue_item_id: queueItem.id
            }
          });
        }
      }
    }

    // Audit log
    await writeAuditLog(base44, {
      organization_id: user.organization_id,
      event_type: 'control_plane_evaluation_run',
      severity: 'info',
      description: `Generated ${recommendations.length} mitigation recommendations for session ${session_id}`,
      actor: user.email,
      success: true,
      metadata: {
        session_id,
        indicators_evaluated: qualifyingIndicators.length,
        recommendations_created: recommendations.length,
        automation_mode: settings.mode
      }
    });

    // Transform to contract-compliant output
    const contractRecommendations = recommendations.map(rec => ({
      id: rec.id,
      plane: rec.plane,
      risk_score: rec.risk_score_context?.plane_score || 0,
      severity: indicators.find(i => i.id === rec.indicator_id)?.severity || 'MEDIUM',
      status: rec.status,
      rationale: rec.rationale,
      candidate_actions: rec.recommended_actions,
      selected_actions: rec.recommended_actions.slice(0, 1), // Top action selected
      approval_queue_item_id: rec.execution_refs?.[0]?.approval_id || null,
      cooldown_until: null, // Set if cooldown active
      created_at: rec.generated_at
    }));

    return Response.json({
      session_id,
      evaluated_at: new Date().toISOString(),
      recommendations: contractRecommendations,
      warnings
    });

  } catch (error) {
    console.error('Evaluation error:', error);
    
    const user = await base44.auth.me().catch(() => null);
    if (user) {
      await logFailure(base44, user.organization_id, user.email, 
        'control_plane_evaluation_error', 
        'Failed to evaluate mitigations', 
        error
      );
    }

    return Response.json({
      error: error.message,
      success: false
    }, { status: 500 });
  }
});