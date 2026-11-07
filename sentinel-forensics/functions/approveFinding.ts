/**
 * PHASE 0: Human-in-the-Loop Approval Workflow
 * 
 * Approves or rejects an AI-generated finding with full audit trail.
 * RBAC: Only users with 'ai_approval' permission can approve findings.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // RBAC: Check approval permission
    // TODO: Implement fine-grained RBAC when permission system is built
    // For now, require admin role for approval
    if (user.role !== 'admin') {
      return Response.json({ 
        error: 'Forbidden: AI approval requires admin role' 
      }, { status: 403 });
    }
    
    const { finding_id, approval_status, approval_notes } = await req.json();
    
    if (!finding_id || !approval_status) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    if (!['accepted', 'rejected'].includes(approval_status)) {
      return Response.json({ error: 'Invalid approval status' }, { status: 400 });
    }
    
    // Fetch finding
    const finding = await base44.entities.AIAnalyticsFinding.get(finding_id);
    
    if (!finding) {
      return Response.json({ error: 'Finding not found' }, { status: 404 });
    }
    
    if (finding.approval_status !== 'pending') {
      return Response.json({ 
        error: 'Finding already approved/rejected' 
      }, { status: 400 });
    }
    
    // Update finding with approval
    const updatedFinding = await base44.entities.AIAnalyticsFinding.update(finding_id, {
      approval_status,
      approved_by: user.email,
      approved_at: new Date().toISOString(),
      approval_notes: approval_notes || ''
    });
    
    // PHASE 0: Audit logging
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id || 'default',
      event_type: 'ai_finding_approval',
      severity: approval_status === 'accepted' ? 'info' : 'warning',
      description: `AI finding ${approval_status}: ${finding.title}`,
      user_id: user.email,
      resource_type: 'AIAnalyticsFinding',
      resource_id: finding_id,
      case_id: finding.case_id,
      action_performed: 'update',
      fields_changed: ['approval_status', 'approved_by', 'approved_at'],
      previous_state: {
        approval_status: 'pending'
      },
      new_state: {
        approval_status
      },
      metadata: {
        finding_type: finding.finding_type,
        confidence: finding.confidence,
        approval_notes
      },
      success: true,
      blockchain_hash: '', // Will be set by backend
      timestamp: new Date().toISOString()
    });
    
    return Response.json({ 
      success: true, 
      finding: updatedFinding 
    });
    
  } catch (error) {
    console.error('Finding approval failed:', error);
    return Response.json({ 
      error: error.message || 'Failed to approve finding' 
    }, { status: 500 });
  }
});