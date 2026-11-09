/**
 * PHASE 0: Immutable Analytics Run Creation
 * 
 * Creates a new analytics run with full provenance tracking, hashing, and audit logging.
 * Enforces immutability: new run = new artifacts; never overwrite.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { case_id, run_type, court_admissible_mode, parameters } = await req.json();
    
    if (!case_id || !run_type) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Fetch case for input snapshot
    const caseData = await base44.entities.Case.get(case_id);
    
    if (!caseData) {
      return Response.json({ error: 'Case not found' }, { status: 404 });
    }
    
    // Fetch associated evidence for snapshot
    const evidence = await base44.entities.EvidenceV2.filter({ case_id });
    
    // Create input snapshot for reproducibility
    const inputSnapshot = {
      case_state: {
        id: caseData.id,
        title: caseData.title,
        status: caseData.status,
        priority: caseData.priority,
        created_at: caseData.created_date
      },
      evidence_refs: evidence.map(e => e.id),
      evidence_count: evidence.length,
      parameters: parameters || {},
      snapshot_timestamp: new Date().toISOString()
    };
    
    // Create immutable analytics run
    const analyticsRun = await base44.asServiceRole.entities.AnalyticsRun.create({
      case_id,
      run_type,
      status: 'pending',
      court_admissible_mode: court_admissible_mode || false,
      input_snapshot: inputSnapshot,
      model_metadata: {
        model_name: 'gpt-4',
        model_version: '0125-preview',
        temperature: 0.3,
        provider: 'openai'
      },
      manifest: {
        findings_count: 0,
        visualizations_count: 0,
        execution_time_ms: 0,
        token_usage: 0
      },
      sealed: false
    });
    
    // PHASE 0: Audit logging
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id || 'default',
      event_type: 'ai_analytics_run_created',
      severity: 'info',
      description: `Analytics run created: ${run_type} for case ${case_id}`,
      user_id: user.email,
      resource_type: 'AnalyticsRun',
      resource_id: analyticsRun.id,
      case_id,
      action_performed: 'create',
      metadata: {
        run_type,
        court_admissible_mode,
        evidence_count: evidence.length
      },
      success: true,
      blockchain_hash: '', // Will be set by backend
      timestamp: new Date().toISOString()
    });
    
    return Response.json({ 
      success: true, 
      run: analyticsRun 
    });
    
  } catch (error) {
    console.error('Analytics run creation failed:', error);
    return Response.json({ 
      error: error.message || 'Failed to create analytics run' 
    }, { status: 500 });
  }
});