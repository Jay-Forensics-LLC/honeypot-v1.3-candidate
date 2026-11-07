import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * CRYPTOGRAPHIC CHAIN-OF-CUSTODY VALIDATION
 * Validates evidence integrity before any read/mutation operation
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evidence_id } = await req.json();

    if (!evidence_id) {
      return Response.json({ error: 'evidence_id required' }, { status: 400 });
    }

    // Fetch evidence record
    const evidence = await base44.entities.EvidenceV2.filter({
      id: evidence_id,
      organization_id: user.organization_id
    });

    if (!evidence || evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidenceRecord = evidence[0];

    // Fetch blockchain chain-of-custody records
    const chainRecords = await base44.entities.ChainOfCustodyLog.filter({
      evidence_id: evidence_id,
      organization_id: user.organization_id
    }, 'created_date', 1000);

    if (chainRecords.length === 0) {
      return Response.json({
        valid: false,
        error: 'No chain-of-custody records found',
        evidence_id
      });
    }

    // Validate chain integrity
    const validationResults = [];
    let chainValid = true;

    for (let i = 0; i < chainRecords.length; i++) {
      const record = chainRecords[i];
      const isValid = await validateChainRecord(record, i === 0 ? null : chainRecords[i - 1]);
      
      validationResults.push({
        record_id: record.id,
        action: record.action,
        timestamp: record.timestamp,
        hash_valid: isValid,
        actor: record.actor_email
      });

      if (!isValid) {
        chainValid = false;
      }
    }

    // Verify current evidence hash matches latest chain record
    const latestRecord = chainRecords[chainRecords.length - 1];
    const currentHashValid = evidenceRecord.file_hash === latestRecord.evidence_hash;

    if (!currentHashValid) {
      chainValid = false;
      validationResults.push({
        error: 'Current evidence hash mismatch',
        expected: latestRecord.evidence_hash,
        actual: evidenceRecord.file_hash
      });
    }

    // Log validation attempt
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'chain_validation_performed',
      resource_type: 'evidence',
      resource_id: evidence_id,
      severity: chainValid ? 'info' : 'critical',
      details: {
        chain_valid: chainValid,
        records_validated: chainRecords.length,
        current_hash_valid: currentHashValid
      }
    });

    // If tampering detected, create alert
    if (!chainValid) {
      await base44.asServiceRole.entities.Alert.create({
        organization_id: user.organization_id,
        alert_type: 'data_exfiltration',
        severity: 'critical',
        title: `Evidence Tampering Detected: ${evidenceRecord.file_name}`,
        description: `Chain-of-custody validation failed for evidence ${evidence_id}`,
        source: 'evidence_integrity_validator',
        detection_timestamp: new Date().toISOString(),
        status: 'new',
        threat_score: 95,
        recommended_actions: [
          'Immediately quarantine evidence',
          'Launch forensic investigation',
          'Review all access logs',
          'Notify legal team'
        ]
      });
    }

    return Response.json({
      valid: chainValid,
      evidence_id,
      records_validated: chainRecords.length,
      validation_results: validationResults,
      tamper_detected: !chainValid
    });

  } catch (error) {
    console.error('Chain validation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Validate individual chain record
 */
async function validateChainRecord(currentRecord, previousRecord) {
  try {
    // Reconstruct hash from record data
    const recordData = JSON.stringify({
      evidence_id: currentRecord.evidence_id,
      action: currentRecord.action,
      actor_email: currentRecord.actor_email,
      timestamp: currentRecord.timestamp,
      evidence_hash: currentRecord.evidence_hash,
      previous_hash: currentRecord.previous_hash
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(recordData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Verify current record hash
    if (currentRecord.record_hash !== computedHash) {
      return false;
    }

    // Verify chain linkage
    if (previousRecord && currentRecord.previous_hash !== previousRecord.record_hash) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Record validation error:', error);
    return false;
  }
}