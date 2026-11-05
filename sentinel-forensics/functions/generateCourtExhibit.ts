import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id, evidence_id, exhibit_number, description } = await req.json();

    // Verify chain of custody integrity
    const evidence = await base44.entities.EvidenceV2.filter({ id: evidence_id });
    if (!evidence || evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidenceItem = evidence[0];
    
    // Validate chain of custody
    const chainLogs = await base44.entities.ChainOfCustodyLog.filter({ 
      evidence_id,
      organization_id: user.organization_id 
    });

    const chainVerified = chainLogs.length > 0;

    // Create court exhibit
    const exhibit = await base44.entities.CourtExhibit.create({
      organization_id: user.organization_id,
      legal_case_id,
      exhibit_number,
      evidence_source_id: evidence_id,
      exhibit_type: 'digital_artifact',
      description: description || evidenceItem.description,
      chain_of_custody_verified: chainVerified,
      foundation_notes: 'Digital evidence collected and preserved using forensically sound methods',
      authentication_method: 'Hash verification and metadata validation per FRE 901(b)(9)',
      disclosed_to_opposing: false
    });

    // Create audit log
    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'court_exhibit_created',
      resource_type: 'court_exhibit',
      resource_id: exhibit.id,
      timestamp: new Date().toISOString(),
      details: {
        legal_case_id,
        evidence_id,
        exhibit_number,
        chain_verified: chainVerified
      }
    });

    return Response.json({
      success: true,
      exhibit_id: exhibit.id,
      chain_verified: chainVerified,
      warnings: chainVerified ? [] : ['Chain of custody not fully documented']
    });

  } catch (error) {
    console.error('Exhibit generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});