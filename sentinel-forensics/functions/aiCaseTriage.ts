import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { z } from 'npm:zod@3.24.1';

/**
 * AI CASE TRIAGE SYSTEM
 * Automatically analyzes, classifies, and routes new cases
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Schema validation
    const RequestSchema = z.object({
      caseId: z.string().uuid()
    });

    const validationResult = RequestSchema.safeParse(body);
    if (!validationResult.success) {
      return Response.json({
        error: 'Validation failed',
        details: validationResult.error.errors
      }, { status: 400 });
    }

    const { caseId } = validationResult.data;

    // Fetch case data
    const cases = await base44.entities.Case.filter({ id: caseId });
    const caseData = cases[0];

    if (!caseData) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }

    // Fetch related evidence if any
    const evidence = await base44.entities.EvidenceV2.filter({ 
      case_id: caseId 
    });

    // Fetch related alerts
    const alerts = await base44.asServiceRole.entities.Alert.list();
    const relatedAlerts = alerts.filter(a => 
      evidence.some(e => a.source === e.title || a.source === e.id)
    );

    // Build triage prompt
    const prompt = `You are a forensic case triage specialist. Analyze this case and provide a comprehensive triage assessment.

**CASE DETAILS:**
- Title: ${caseData.title}
- Type: ${caseData.case_type}
- Current Priority: ${caseData.priority || 'unassigned'}
- Status: ${caseData.status}
- Description: ${caseData.description || 'No description provided'}
- Created: ${new Date(caseData.created_date).toISOString()}

**EVIDENCE (${evidence.length} items):**
${evidence.map(e => `- ${e.title} (${e.evidence_type}): Threat: ${e.threat_classification || 'unknown'}, Risk: ${e.risk_score || 'N/A'}`).join('\n') || 'No evidence yet'}

**RELATED ALERTS (${relatedAlerts.length} items):**
${relatedAlerts.map(a => `- ${a.title} (${a.severity}): ${a.alert_type}`).join('\n') || 'No alerts'}

**TRIAGE ASSESSMENT REQUIRED:**

1. **Priority Classification**: Assign HIGH, MEDIUM, or LOW based on:
   - Case type urgency (ransomware, data breach = HIGH)
   - Evidence threat levels
   - Alert severities
   - Potential business impact
   - Time sensitivity

2. **Threat Assessment**: Identify:
   - Primary threat indicators
   - Attack vectors
   - Potential threat actors
   - Scope of compromise

3. **Investigation Path**: Recommend:
   - Immediate actions (first 24 hours)
   - Evidence to collect next
   - Systems to examine
   - Experts to involve

4. **Risk Factors**: Identify:
   - Data exposure risks
   - Legal/compliance implications
   - Operational impact
   - Escalation triggers

5. **Keywords**: Extract 5-10 relevant keywords for search/correlation

Provide structured JSON output.`;

    // Use AI orchestrator for triage analysis
    const aiResult = await base44.asServiceRole.functions.invoke('aiOrchestrator', {
      orgId: user.organization_id,
      userId: user.email,
      taskType: 'threat_analysis',
      sensitivity: 'high', // Case triage is critical
      costTier: user.subscription_tier || 'free',
      latencyToleranceMs: 15000,
      input: {
        prompt,
        context: { caseData, evidence, alerts: relatedAlerts },
        rawDataRefs: evidence.map(e => e.id)
      },
      response_json_schema: {
        type: "object",
        properties: {
          priority: {
            type: "string",
            enum: ["high", "medium", "low"]
          },
          priority_justification: { type: "string" },
          threat_assessment: {
            type: "object",
            properties: {
              primary_threats: { type: "array", items: { type: "string" } },
              attack_vectors: { type: "array", items: { type: "string" } },
              potential_actors: { type: "array", items: { type: "string" } },
              scope: { type: "string" }
            }
          },
          investigation_path: {
            type: "object",
            properties: {
              immediate_actions: { type: "array", items: { type: "string" } },
              evidence_to_collect: { type: "array", items: { type: "string" } },
              systems_to_examine: { type: "array", items: { type: "string" } },
              experts_needed: { type: "array", items: { type: "string" } }
            }
          },
          risk_factors: {
            type: "object",
            properties: {
              data_exposure: { type: "string" },
              legal_compliance: { type: "string" },
              operational_impact: { type: "string" },
              escalation_triggers: { type: "array", items: { type: "string" } }
            }
          },
          keywords: { type: "array", items: { type: "string" } },
          confidence_score: { type: "number" },
          recommended_investigator_type: { type: "string" }
        }
      }
    });

    const triageResult = aiResult.data.response;

    // Update case with triage results
    await base44.asServiceRole.entities.Case.update(caseId, {
      priority: triageResult.priority,
      tags: triageResult.keywords || [],
      metadata: {
        ...caseData.metadata,
        triage: {
          performed_at: new Date().toISOString(),
          performed_by: 'ai_triage_system',
          confidence: triageResult.confidence_score,
          assessment: triageResult.threat_assessment,
          investigation_path: triageResult.investigation_path,
          risk_factors: triageResult.risk_factors
        }
      }
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'case_triage',
      severity: 'info',
      description: `AI triage completed for case ${caseData.case_number}: ${triageResult.priority} priority`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      case_id: caseId,
      metadata: {
        case_id: caseId,
        priority_assigned: triageResult.priority,
        confidence: triageResult.confidence_score,
        keywords: triageResult.keywords
      },
      blockchain_hash: await generateHash({
        case_id: caseId,
        priority: triageResult.priority,
        timestamp: new Date().toISOString()
      })
    });

    return Response.json({
      success: true,
      triage: triageResult,
      case_updated: true,
      metadata: aiResult.data.metadata
    });

  } catch (error) {
    console.error('Case triage error:', error);
    return Response.json({
      error: error.message || 'Triage failed',
      stack: error.stack
    }, { status: 500 });
  }
});

async function generateHash(data) {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(data))
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}