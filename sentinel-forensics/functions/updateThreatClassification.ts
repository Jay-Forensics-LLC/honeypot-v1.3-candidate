import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Update Threat Classification - BACKEND ONLY
 * Fixes Issue #024: Threat classification updated by backend analysis
 * 
 * Called by:
 * - MVT analysis function
 * - Sandbox analysis function
 * - AI threat detection
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evidence_id, threat_classification, risk_score, analysis_data } = await req.json();

    if (!evidence_id || !threat_classification) {
      return Response.json({ 
        error: 'Missing required fields: evidence_id, threat_classification' 
      }, { status: 400 });
    }

    // Validate threat_classification
    const validClassifications = [
      'benign',
      'suspicious',
      'malicious',
      'pegasus',
      'apt',
      'unknown'
    ];

    if (!validClassifications.includes(threat_classification)) {
      return Response.json({ 
        error: `Invalid classification. Must be one of: ${validClassifications.join(', ')}` 
      }, { status: 400 });
    }

    // Validate risk_score if provided
    if (risk_score !== undefined && (risk_score < 0 || risk_score > 100)) {
      return Response.json({ 
        error: 'risk_score must be between 0 and 100' 
      }, { status: 400 });
    }

    // Get evidence record
    const evidence = await base44.asServiceRole.entities.EvidenceV2.get(evidence_id);
    
    if (!evidence) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    // Verify user has access (admins only for threat updates)
    if (user.role !== 'admin') {
      return Response.json({ 
        error: 'Admin role required to update threat classification' 
      }, { status: 403 });
    }

    // Verify organization match
    if (evidence.organization_id !== user.organization_id) {
      return Response.json({ 
        error: 'Cannot modify evidence from different organization' 
      }, { status: 403 });
    }

    const previousState = {
      threat_classification: evidence.threat_classification,
      risk_score: evidence.risk_score
    };

    // Prepare update object
    const updateData = {
      threat_classification: threat_classification
    };

    if (risk_score !== undefined) {
      updateData.risk_score = risk_score;
    }

    // Issue #031, #032: Update Pegasus/MVT indicators if provided
    if (analysis_data?.pegasus_indicators) {
      updateData.pegasus_indicators = {
        ...evidence.pegasus_indicators,
        ...analysis_data.pegasus_indicators
      };
    }

    if (analysis_data?.mvt_analysis) {
      updateData.mvt_analysis = {
        ...evidence.mvt_analysis,
        ...analysis_data.mvt_analysis,
        analyzed_at: new Date().toISOString()
      };
    }

    if (analysis_data?.sandbox_analysis) {
      updateData.sandbox_analysis = {
        ...evidence.sandbox_analysis,
        ...analysis_data.sandbox_analysis
      };
    }

    // Update evidence using service role
    await base44.asServiceRole.entities.EvidenceV2.update(evidence_id, updateData);

    // Add chain-of-custody entry
    await base44.functions.invoke('addChainOfCustodyEntry', {
      evidence_id: evidence_id,
      action: 'analyzed',
      notes: `Threat classification updated to: ${threat_classification} (risk: ${risk_score || 'N/A'})`
    });

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: 'evidence_threat_updated',
      severity: threat_classification === 'malicious' || threat_classification === 'pegasus' ? 'critical' : 'warning',
      description: `Threat classification updated: ${threat_classification}`,
      resource_type: 'Evidence',
      resource_id: evidence_id,
      case_id: evidence.case_id,
      evidence_id: evidence_id,
      action_performed: 'update_threat_classification',
      fields_changed: ['threat_classification', 'risk_score'],
      previous_state: previousState,
      new_state: {
        threat_classification: threat_classification,
        risk_score: risk_score
      },
      metadata: {
        performed_by: user.email,
        analysis_type: analysis_data?.analysis_type || 'manual'
      }
    });

    // Issue #024: Create alert for malicious/pegasus threats
    if (threat_classification === 'malicious' || threat_classification === 'pegasus') {
      await base44.asServiceRole.entities.Alert.create({
        alert_type: 'malware_detected',
        severity: 'critical',
        title: `${threat_classification.toUpperCase()} Evidence Detected`,
        description: `Evidence "${evidence.title}" classified as ${threat_classification}`,
        source: 'threat_analysis',
        status: 'new',
        threat_score: risk_score || 100,
        created_by: 'system'
      });
    }

    return Response.json({ 
      success: true,
      threat_classification: threat_classification,
      risk_score: risk_score,
      message: 'Threat classification updated successfully'
    });

  } catch (error) {
    console.error('Threat classification update failed:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});