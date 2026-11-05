import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Set Legal Hold on Evidence - ADMIN ONLY
 * Fixes Issue #026: Legal hold can only be set by admins
 * 
 * Legal hold prevents:
 * - Evidence deletion
 * - Evidence modification
 * - Archive/retention actions
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const admin = await base44.auth.me();

    // Issue #026: Require admin role
    if (!admin || admin.role !== 'admin') {
      return Response.json({ 
        error: 'Forbidden: Admin role required to set legal hold',
        issue: '#026'
      }, { status: 403 });
    }

    const { evidence_id, enabled, court_order_id, reason, expires_at } = await req.json();

    if (!evidence_id || typeof enabled !== 'boolean') {
      return Response.json({ 
        error: 'Missing required fields: evidence_id, enabled' 
      }, { status: 400 });
    }

    // Get evidence record
    const evidence = await base44.asServiceRole.entities.EvidenceV2.get(evidence_id);
    
    if (!evidence) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    // Verify evidence belongs to admin's organization
    if (evidence.organization_id !== admin.organization_id) {
      return Response.json({ 
        error: 'Cannot modify evidence from different organization' 
      }, { status: 403 });
    }

    const previousState = {
      legal_hold: evidence.legal_hold,
      legal_hold_metadata: evidence.legal_hold_metadata
    };

    // Prepare legal hold metadata
    const legal_hold_metadata = enabled ? {
      court_order_id: court_order_id || '',
      applied_by: admin.email,
      applied_at: new Date().toISOString(),
      expires_at: expires_at || null,
      reason: reason || 'Legal hold applied'
    } : null;

    // Update evidence using service role
    await base44.asServiceRole.entities.EvidenceV2.update(evidence_id, {
      legal_hold: enabled,
      legal_hold_metadata: legal_hold_metadata
    });

    // Add chain-of-custody entry
    await base44.functions.invoke('addChainOfCustodyEntry', {
      evidence_id: evidence_id,
      action: enabled ? 'legal_hold_applied' : 'legal_hold_removed',
      notes: `Legal hold ${enabled ? 'applied' : 'removed'} by ${admin.full_name}. Reason: ${reason || 'N/A'}`
    });

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: enabled ? 'legal_hold_applied' : 'legal_hold_removed',
      severity: 'critical',
      description: `Legal hold ${enabled ? 'applied' : 'removed'} on evidence: ${evidence.title}`,
      resource_type: 'Evidence',
      resource_id: evidence_id,
      case_id: evidence.case_id,
      evidence_id: evidence_id,
      action_performed: 'set_legal_hold',
      fields_changed: ['legal_hold', 'legal_hold_metadata'],
      previous_state: previousState,
      new_state: {
        legal_hold: enabled,
        legal_hold_metadata: legal_hold_metadata
      },
      metadata: {
        admin_email: admin.email,
        court_order_id: court_order_id || '',
        reason: reason || ''
      }
    });

    return Response.json({ 
      success: true,
      legal_hold: enabled,
      message: `Legal hold ${enabled ? 'applied' : 'removed'} successfully`
    });

  } catch (error) {
    console.error('Legal hold operation failed:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});