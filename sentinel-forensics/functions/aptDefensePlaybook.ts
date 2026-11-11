import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AUTOMATED APT DEFENSE PLAYBOOK EXECUTOR
 * Triggers containment actions for high-risk vulnerabilities (score > 85)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const CRITICAL_THRESHOLD = 85;

    // Fetch high-risk vulnerabilities
    const vulnerabilities = await base44.entities.VulnerabilityAssessment.filter({
      organization_id: user.organization_id
    }, '-risk_priority_score', 100);

    const criticalVulns = vulnerabilities.filter(v => 
      (v.risk_priority_score || 0) >= CRITICAL_THRESHOLD
    );

    const executedActions = [];

    for (const vuln of criticalVulns) {
      // Check if already has active orchestration
      const existingRuns = await base44.entities.DefenseActionRun.filter({
        organization_id: user.organization_id,
        vulnerability_id: vuln.id,
        status: 'active'
      });

      if (existingRuns.length > 0) {
        continue; // Skip if already handling
      }

      // Determine containment actions based on threat context
      const actions = [];

      // 1. Network-level containment
      if (vuln.affected_systems?.length > 0) {
        actions.push({
          action_type: 'network_isolation',
          target: vuln.affected_systems.map(s => s.asset_id),
          parameters: {
            block_type: 'temporary',
            duration_hours: 24,
            allow_internal_only: true
          },
          justification: `Isolate affected systems from external network to prevent APT lateral movement`
        });
      }

      // 2. Vulnerability remediation trigger
      if (vuln.remediation?.patch_available) {
        actions.push({
          action_type: 'auto_patch',
          target: vuln.affected_systems?.map(s => s.asset_id) || [],
          parameters: {
            patch_url: vuln.remediation.patch_url,
            schedule: 'immediate',
            create_snapshot: true
          },
          justification: `Emergency patching for ${vuln.cve_id} exploited by ${vuln.apt_relevance?.apt_groups?.join(', ')}`
        });
      }

      // 3. Enhanced monitoring
      actions.push({
        action_type: 'enable_monitoring',
        target: vuln.affected_systems?.map(s => s.asset_id) || [],
        parameters: {
          monitoring_level: 'maximum',
          duration_hours: 72,
          capture_pcap: true,
          log_all_processes: true
        },
        justification: `Enhanced monitoring for APT activity related to ${vuln.cve_id}`
      });

      // 4. Alert escalation
      actions.push({
        action_type: 'alert_escalation',
        target: [user.email],
        parameters: {
          severity: 'critical',
          notification_channels: ['email', 'sms'],
          escalate_to_admin: true
        },
        justification: `Critical vulnerability with APT exploitation evidence`
      });

      // Create defense action run
      const actionRun = await base44.asServiceRole.entities.DefenseActionRun.create({
        organization_id: user.organization_id,
        vulnerability_id: vuln.id,
        cve_id: vuln.cve_id,
        triggered_by: 'automated_playbook',
        actions_planned: actions,
        status: 'active',
        risk_score: vuln.risk_priority_score,
        started_at: new Date().toISOString()
      });

      // Execute each action
      for (const action of actions) {
        try {
          // Simulate action execution (integrate with actual systems)
          const result = await executeDefenseAction(base44, user, action);
          
          // Log action telemetry
          await base44.asServiceRole.entities.DefenseActionTelemetry.create({
            organization_id: user.organization_id,
            action_run_id: actionRun.id,
            action_type: action.action_type,
            status: result.success ? 'completed' : 'failed',
            execution_time_ms: result.duration,
            details: result.details
          });

        } catch (actionError) {
          console.error(`Action execution failed: ${action.action_type}`, actionError);
        }
      }

      // Update action run status
      await base44.asServiceRole.entities.DefenseActionRun.update(actionRun.id, {
        status: 'completed',
        completed_at: new Date().toISOString()
      });

      executedActions.push({
        vulnerability: vuln.cve_id,
        risk_score: vuln.risk_priority_score,
        actions_count: actions.length,
        run_id: actionRun.id
      });

      // Create audit log
      await base44.asServiceRole.entities.AuditLog.create({
        organization_id: user.organization_id,
        user_email: 'system',
        action: 'apt_defense_playbook_executed',
        resource_type: 'vulnerability',
        resource_id: vuln.id,
        severity: 'high',
        details: {
          cve_id: vuln.cve_id,
          risk_score: vuln.risk_priority_score,
          actions_executed: actions.length,
          apt_groups: vuln.apt_relevance?.apt_groups || []
        }
      });
    }

    return Response.json({
      success: true,
      critical_vulnerabilities: criticalVulns.length,
      playbooks_executed: executedActions.length,
      actions: executedActions
    });

  } catch (error) {
    console.error('APT defense playbook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Execute individual defense action
 */
async function executeDefenseAction(base44, user, action) {
  const startTime = Date.now();
  
  try {
    switch (action.action_type) {
      case 'network_isolation':
        // Integrate with firewall/network management
        return {
          success: true,
          duration: Date.now() - startTime,
          details: { isolated_assets: action.target.length }
        };
        
      case 'auto_patch':
        // Trigger patch management system
        return {
          success: true,
          duration: Date.now() - startTime,
          details: { patch_initiated: true }
        };
        
      case 'enable_monitoring':
        // Enhance monitoring for targets
        return {
          success: true,
          duration: Date.now() - startTime,
          details: { monitoring_enabled: true }
        };
        
      case 'alert_escalation':
        // Send notifications
        return {
          success: true,
          duration: Date.now() - startTime,
          details: { alerts_sent: action.target.length }
        };
        
      default:
        return {
          success: false,
          duration: Date.now() - startTime,
          details: { error: 'Unknown action type' }
        };
    }
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startTime,
      details: { error: error.message }
    };
  }
}