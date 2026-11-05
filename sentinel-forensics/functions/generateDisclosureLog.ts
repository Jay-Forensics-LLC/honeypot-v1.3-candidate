import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id, disclosure_type, evidence_ids } = await req.json();

    const evidenceItems = [];
    for (const evidenceId of evidence_ids) {
      const evidence = await base44.entities.EvidenceV2.filter({ id: evidenceId });
      if (evidence[0]) {
        evidenceItems.push({
          evidence_id: evidenceId,
          exhibit_number: evidence[0].exhibit_number || 'TBD',
          description: evidence[0].description
        });
      }
    }

    const disclosureLog = await base44.entities.DisclosureLog.create({
      organization_id: user.organization_id,
      legal_case_id,
      disclosure_type,
      evidence_items: evidenceItems,
      disclosure_date: new Date().toISOString(),
      certificate_of_service: false
    });

    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'disclosure_log_generated',
      resource_type: 'disclosure_log',
      resource_id: disclosureLog.id,
      timestamp: new Date().toISOString(),
      details: { legal_case_id, evidence_count: evidence_ids.length }
    });

    return Response.json({
      success: true,
      disclosure_log_id: disclosureLog.id,
      evidence_count: evidenceItems.length
    });

  } catch (error) {
    console.error('Disclosure log generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});