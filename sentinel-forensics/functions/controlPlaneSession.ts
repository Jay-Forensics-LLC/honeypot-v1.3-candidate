import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { operation, ...params } = await req.json();

    if (operation === 'createSession') {
      const { session_name, device_label, location, initial_narrative, posture_snapshot } = params;

      // Create incident session
      const session = await base44.asServiceRole.entities.IncidentSession.create({
        organization_id: user.organization_id,
        session_name,
        device_label,
        location: location || null,
        initial_narrative: initial_narrative || '',
        status: 'ACTIVE',
        posture_snapshot: posture_snapshot || {},
        risk_summary: {
          carrier_score: 0,
          account_score: 0,
          device_score: 0,
          network_score: 0,
          physical_score: 0,
          overall_score: 0,
          last_assessed_at: new Date().toISOString()
        },
        created_by: user.email
      });

      // Create first chain entry
      const entryData = {
        organization_id: user.organization_id,
        session_id: session.id,
        entry_type: 'SESSION_START',
        timestamp_utc: new Date().toISOString(),
        timestamp_local: new Date().toLocaleString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        actor_email: user.email,
        event_data: {
          session_name,
          device_label,
          posture_snapshot
        },
        narrative: `Incident session "${session_name}" started for device ${device_label}`,
        prev_entry_hash: null
      };

      // Compute entry hash
      const entryHash = await computeHash(JSON.stringify({
        prev_hash: null,
        data: entryData
      }));

      entryData.entry_hash = entryHash;

      await base44.asServiceRole.entities.ChainOfCustodyEntry.create(entryData);

      // Update session with chain head
      await base44.asServiceRole.entities.IncidentSession.update(session.id, {
        chain_head_hash: entryHash
      });

      return Response.json({ session, chain_head_hash: entryHash });
    }

    if (operation === 'addIndicator') {
      const { session_id, plane, indicator_type, severity, title, description, weight } = params;

      const indicator = await base44.asServiceRole.entities.ControlPlaneIndicator.create({
        organization_id: user.organization_id,
        session_id,
        plane,
        indicator_type,
        severity: severity || 'MEDIUM',
        status: 'SUSPECTED',
        title,
        description: description || '',
        weight: weight || 50,
        detected_at: new Date().toISOString()
      });

      // Add chain entry
      await addChainEntry(base44, user, session_id, 'INDICATOR_ADDED', {
        indicator_id: indicator.id,
        plane,
        title
      }, `Added ${severity} indicator to ${plane}: ${title}`);

      // Recalculate risk scores
      await recalculateRiskScores(base44, session_id);

      return Response.json({ indicator });
    }

    if (operation === 'updateIndicatorStatus') {
      const { indicator_id, status } = params;

      const indicator = await base44.asServiceRole.entities.ControlPlaneIndicator.update(indicator_id, {
        status,
        mitigated_at: status === 'MITIGATED' ? new Date().toISOString() : null
      });

      await addChainEntry(base44, user, indicator.session_id, 'STATUS_CHANGE', {
        indicator_id,
        new_status: status
      }, `Indicator status changed to ${status}`);

      await recalculateRiskScores(base44, indicator.session_id);

      return Response.json({ indicator });
    }

    if (operation === 'recordAction') {
      const { session_id, plane, action_type, action_title, action_description, execution_mode, before_state, after_state, user_notes } = params;

      const action = await base44.asServiceRole.entities.ControlPlaneAction.create({
        organization_id: user.organization_id,
        session_id,
        plane,
        action_type,
        action_title,
        action_description: action_description || '',
        status: 'COMPLETED',
        execution_mode: execution_mode || 'GUIDED_MANUAL',
        before_state: before_state || {},
        after_state: after_state || {},
        user_notes: user_notes || '',
        completed_at: new Date().toISOString()
      });

      await addChainEntry(base44, user, session_id, 'ACTION_TAKEN', {
        action_id: action.id,
        plane,
        action_type,
        action_title
      }, `Completed ${plane} action: ${action_title}`);

      return Response.json({ action });
    }

    if (operation === 'captureEvidence') {
      const { session_id, artifact_type, file_url, file_size_bytes, mime_type, sha256_hash, caption, metadata } = params;

      const evidence = await base44.asServiceRole.entities.ControlPlaneEvidence.create({
        organization_id: user.organization_id,
        session_id,
        artifact_type,
        file_url: file_url || null,
        file_size_bytes: file_size_bytes || 0,
        mime_type: mime_type || null,
        sha256_hash: sha256_hash || null,
        caption: caption || '',
        metadata: metadata || {}
      });

      await addChainEntry(base44, user, session_id, 'EVIDENCE_CAPTURED', {
        evidence_id: evidence.id,
        artifact_type,
        caption
      }, `Captured ${artifact_type}: ${caption || 'No caption'}`);

      return Response.json({ evidence });
    }

    if (operation === 'closeSession') {
      const { session_id } = params;

      await base44.asServiceRole.entities.IncidentSession.update(session_id, {
        status: 'CLOSED',
        closed_at: new Date().toISOString(),
        closed_by: user.email
      });

      await addChainEntry(base44, user, session_id, 'SESSION_CLOSED', {}, 'Incident session closed');

      return Response.json({ status: 'closed' });
    }

    return Response.json({ error: 'Invalid operation' }, { status: 400 });

  } catch (error) {
    console.error('Control plane session error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function computeHash(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function addChainEntry(base44, user, session_id, entry_type, event_data, narrative) {
  const session = await base44.asServiceRole.entities.IncidentSession.get(session_id);
  
  const entryData = {
    organization_id: user.organization_id,
    session_id,
    entry_type,
    timestamp_utc: new Date().toISOString(),
    timestamp_local: new Date().toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    actor_email: user.email,
    event_data,
    narrative,
    prev_entry_hash: session.chain_head_hash || null
  };

  const entryHash = await computeHash(JSON.stringify({
    prev_hash: session.chain_head_hash,
    data: entryData
  }));

  entryData.entry_hash = entryHash;

  await base44.asServiceRole.entities.ChainOfCustodyEntry.create(entryData);
  
  await base44.asServiceRole.entities.IncidentSession.update(session_id, {
    chain_head_hash: entryHash
  });
}

async function recalculateRiskScores(base44, session_id) {
  const indicators = await base44.asServiceRole.entities.ControlPlaneIndicator.filter({
    session_id,
    status: { $in: ['SUSPECTED', 'CONFIRMED'] }
  });

  const planeScores = {
    CARRIER: 0,
    ACCOUNT: 0,
    DEVICE: 0,
    NETWORK: 0,
    PHYSICAL: 0
  };

  const planeCounts = {
    CARRIER: 0,
    ACCOUNT: 0,
    DEVICE: 0,
    NETWORK: 0,
    PHYSICAL: 0
  };

  indicators.forEach(ind => {
    const plane = ind.plane;
    const weight = ind.weight || 50;
    const severityMultiplier = {
      'INFO': 0.2,
      'LOW': 0.4,
      'MEDIUM': 0.6,
      'HIGH': 0.8,
      'CRITICAL': 1.0
    }[ind.severity] || 0.6;

    planeScores[plane] += weight * severityMultiplier;
    planeCounts[plane]++;
  });

  // Normalize scores (cap at 100)
  Object.keys(planeScores).forEach(plane => {
    planeScores[plane] = Math.min(100, planeScores[plane]);
  });

  const overall = Object.values(planeScores).reduce((sum, score) => sum + score, 0) / 5;

  await base44.asServiceRole.entities.IncidentSession.update(session_id, {
    risk_summary: {
      carrier_score: Math.round(planeScores.CARRIER),
      account_score: Math.round(planeScores.ACCOUNT),
      device_score: Math.round(planeScores.DEVICE),
      network_score: Math.round(planeScores.NETWORK),
      physical_score: Math.round(planeScores.PHYSICAL),
      overall_score: Math.round(overall),
      last_assessed_at: new Date().toISOString()
    }
  });
}