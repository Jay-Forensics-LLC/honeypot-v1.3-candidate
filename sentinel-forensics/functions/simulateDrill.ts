import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scenario_type, playbook_id, participants = [] } = await req.json();

    if (!scenario_type) {
      return Response.json({ error: 'scenario_type required' }, { status: 400 });
    }

    // Create drill session
    const session = await base44.asServiceRole.entities.DrillSession.create({
      organization_id: user.organization_id,
      session_name: `${scenario_type} Drill - ${new Date().toLocaleDateString()}`,
      scenario_type,
      playbook_id: playbook_id || null,
      status: 'in_progress',
      participants: participants.length > 0 ? participants : [user.email],
      started_at: new Date().toISOString(),
      facilitator: user.email,
      injects: [],
      steps_completed: []
    });

    // Create synthetic case for drill
    const drillCase = await base44.asServiceRole.entities.Case.create({
      organization_id: user.organization_id,
      case_number: `DRILL-${Date.now()}`,
      title: `[SIMULATION] ${scenario_type} Incident Drill`,
      description: `This is a simulated incident for training purposes. Started: ${new Date().toISOString()}`,
      case_type: 'other',
      priority: 'high',
      status: 'active',
      metadata: {
        is_drill: true,
        drill_session_id: session.id
      }
    });

    // Generate scenario-specific synthetic evidence
    const scenarioData = {
      ransomware: [
        { title: 'Suspicious encrypted files detected', type: 'file', description: 'Multiple .encrypted extensions found on server' },
        { title: 'Ransom note discovered', type: 'file', description: 'README.txt demanding payment' },
        { title: 'Unusual process activity', type: 'device_log', description: 'Unknown executable encrypting files' }
      ],
      data_breach: [
        { title: 'Unauthorized database access', type: 'device_log', description: 'SQL queries from unknown IP' },
        { title: 'Large data transfer detected', type: 'network_capture', description: '500GB transferred to external server' },
        { title: 'Compromised credentials', type: 'file', description: 'Admin credentials found in dark web dump' }
      ],
      legal_challenge: [
        { title: 'Evidence admissibility challenge', type: 'file', description: 'Defense questions chain of custody' },
        { title: 'Expert qualification challenge', type: 'file', description: 'Daubert motion filed against forensic expert' },
        { title: 'Spoliation claim', type: 'file', description: 'Allegation of evidence destruction' }
      ]
    };

    const evidenceItems = scenarioData[scenario_type] || [];
    const createdEvidence = [];

    for (const item of evidenceItems) {
      const evidence = await base44.asServiceRole.entities.EvidenceV2.create({
        organization_id: user.organization_id,
        case_id: drillCase.id,
        title: item.title,
        description: item.description,
        evidence_type: item.type,
        collection_timestamp: new Date().toISOString(),
        metadata: {
          is_drill: true,
          drill_session_id: session.id,
          synthetic: true
        }
      });
      createdEvidence.push(evidence);
    }

    // Generate AI adversarial challenges
    const adversarialPrompt = `You are a red team adversary testing an incident response team.
Scenario: ${scenario_type}
Generate 3 realistic challenges or complications that would occur during this incident.
Each should test the team's preparedness and procedures.

Return JSON format:
{
  "challenges": [
    {"time_offset_minutes": 5, "type": "technical", "description": "..."},
    {"time_offset_minutes": 15, "type": "legal", "description": "..."},
    {"time_offset_minutes": 30, "type": "communication", "description": "..."}
  ]
}`;

    const adversarialData = await base44.integrations.Core.InvokeLLM({
      prompt: adversarialPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          challenges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time_offset_minutes: { type: "number" },
                type: { type: "string" },
                description: { type: "string" }
              }
            }
          }
        }
      }
    });

    // Log drill start
    await base44.asServiceRole.entities.CaseActivity.create({
      organization_id: user.organization_id,
      case_id: drillCase.id,
      activity_type: 'case_status_changed',
      actor_email: user.email,
      description: `Drill session started: ${scenario_type}`,
      metadata: {
        drill_session_id: session.id,
        participants: participants.length
      },
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      session_id: session.id,
      case_id: drillCase.id,
      evidence_count: createdEvidence.length,
      adversarial_challenges: adversarialData.challenges,
      message: '🎯 DRILL MODE ACTIVATED - This is a simulation'
    });

  } catch (error) {
    console.error('Drill simulation error:', error);
    return Response.json({
      error: 'Simulation failed',
      details: error.message
    }, { status: 500 });
  }
});