
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { incidentId } = await req.json();

    // Get incident details
    const incidents = await base44.asServiceRole.entities.IncidentResponse.filter({ incident_id: incidentId });
    if (!incidents || incidents.length === 0) {
      return Response.json({ error: 'Incident not found' }, { status: 404 });
    }
    const incident = incidents[0];

    // Build context for AI
    const context = {
      incident_type: incident.incident_type,
      severity: incident.severity,
      status: incident.status,
      affected_systems: incident.affected_systems || [],
      threat_intel: incident.threat_intel_enrichment || {},
      timeline: incident.timeline || []
    };

    // Generate AI suggestions using LLM
    const prompt = `You are a cybersecurity incident response expert. Analyze this security incident and provide 5-7 prioritized response actions.

Incident Details:
- Type: ${context.incident_type}
- Severity: ${context.severity}
- Status: ${context.status}
- Affected Systems: ${context.affected_systems.join(', ') || 'Unknown'}
- Title: ${incident.title}
- Description: ${incident.description}

${context.threat_intel.apt_groups?.length > 0 ? `
Potential APT Groups: ${context.threat_intel.apt_groups.map(g => g.group_name).join(', ')}
` : ''}

${context.threat_intel.malware_families?.length > 0 ? `
Malware Families: ${context.threat_intel.malware_families.join(', ')}
` : ''}

Provide response actions in JSON format with:
- action_type (isolate_devices, block_ips, collect_memory_dumps, restore_backups, etc.)
- description (clear action description)
- priority (critical, high, medium, low)
- confidence (0-100 score)
- reasoning (why this action is recommended)
- prerequisites (what must be done first)
- expected_outcome (what this achieves)
- risk_level (low, medium, high)

Prioritize by urgency and impact. Consider containment first, then eradication, then recovery.`;

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action_type: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                confidence: { type: 'number' },
                reasoning: { type: 'string' },
                prerequisites: { type: 'array', items: { type: 'string' } },
                expected_outcome: { type: 'string' },
                risk_level: { type: 'string', enum: ['low', 'medium', 'high'] }
              }
            }
          }
        }
      }
    });

    const suggestions = response.suggestions || [];

    // Update incident with AI suggestions
    await base44.asServiceRole.entities.IncidentResponse.update(incident.id, {
      ai_suggested_actions: suggestions
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'ai_suggestions_generated',
      severity: 'info',
      description: `Generated ${suggestions.length} AI response suggestions for incident ${incident.incident_number}`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        incident_id: incidentId,
        suggestions_count: suggestions.length
      }
    });

    return Response.json({
      success: true,
      suggestions,
      count: suggestions.length
    });
  } catch (error) {
    console.error('AI suggestions error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});
