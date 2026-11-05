import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Auto-trigger playbook based on incident type and severity
 * Called automatically when new incidents are created
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { incidentId } = await req.json();

    // Get incident
    const incidents = await base44.asServiceRole.entities.IncidentResponse.filter({ 
      incident_id: incidentId 
    });
    
    if (!incidents || incidents.length === 0) {
      return Response.json({ error: 'Incident not found' }, { status: 404 });
    }
    
    const incident = incidents[0];

    // Find matching playbooks
    const playbooks = await base44.asServiceRole.entities.AutomationPlaybook.filter({
      enabled: true
    });

    const matchingPlaybooks = [];

    for (const playbook of playbooks) {
      const triggers = playbook.trigger_conditions || {};
      
      // Check if incident type matches
      const typeMatch = triggers.event_types?.includes(incident.incident_type) || false;
      
      // Check if severity meets threshold
      const severityOrder = ['low', 'medium', 'high', 'critical'];
      const incidentSeverityIndex = severityOrder.indexOf(incident.severity);
      const thresholdIndex = severityOrder.indexOf(triggers.severity_threshold);
      const severityMatch = incidentSeverityIndex >= thresholdIndex;
      
      if (typeMatch && severityMatch) {
        matchingPlaybooks.push({
          id: playbook.id,
          name: playbook.playbook_name,
          type: playbook.playbook_type
        });
      }
    }

    const executedPlaybooks = [];

    // Execute matching playbooks
    for (const playbook of matchingPlaybooks) {
      try {
        // Call the playbook execution function
        const execResult = await base44.asServiceRole.functions.invoke('executeIncidentPlaybook', {
          incidentId: incident.incident_id,
          playbookId: playbook.id,
          autoExecute: true
        });

        executedPlaybooks.push({
          playbook_id: playbook.id,
          playbook_name: playbook.name,
          status: 'completed',
          actions_count: execResult.actions_taken?.length || 0
        });
      } catch (error) {
        console.error(`Playbook ${playbook.name} failed:`, error);
        executedPlaybooks.push({
          playbook_id: playbook.id,
          playbook_name: playbook.name,
          status: 'failed',
          error: error.message
        });
      }
    }

    // Update incident timeline
    if (executedPlaybooks.length > 0) {
      const timeline = [...(incident.timeline || [])];
      timeline.push({
        timestamp: new Date().toISOString(),
        event: `Auto-executed ${executedPlaybooks.length} playbook(s)`,
        actor: 'Automation Engine',
        details: executedPlaybooks.map(p => p.playbook_name).join(', '),
        automated: true
      });

      await base44.asServiceRole.entities.IncidentResponse.update(incident.id, {
        timeline
      });
    }

    return Response.json({
      success: true,
      matched_playbooks: matchingPlaybooks.length,
      executed_playbooks: executedPlaybooks
    });
  } catch (error) {
    console.error('Auto-trigger error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});