import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { evidence_id } = await req.json();

    // Get evidence
    const evidence = await base44.entities.EvidenceV2.filter({ id: evidence_id });
    if (!evidence || evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidenceItem = evidence[0];

    // Get chain of custody logs
    const chainLogs = await base44.entities.ChainOfCustodyLog.filter({ 
      evidence_id,
      organization_id: user.organization_id 
    }, 'timestamp', 1000);

    // Validation checks
    const validationResults = {
      has_initial_collection: false,
      has_continuous_chain: true,
      hash_verified: false,
      timestamps_sequential: true,
      gaps_detected: [],
      spoliation_risk: false,
      admissibility_score: 0
    };

    if (chainLogs.length === 0) {
      return Response.json({
        valid: false,
        errors: ['No chain of custody logs found'],
        ...validationResults
      });
    }

    // Check initial collection
    const collectionLog = chainLogs.find(log => log.action === 'collected');
    validationResults.has_initial_collection = !!collectionLog;

    // Check hash consistency
    if (evidenceItem.hash) {
      const hashLogs = chainLogs.filter(log => log.event_metadata?.hash === evidenceItem.hash);
      validationResults.hash_verified = hashLogs.length > 0;
    }

    // Check for gaps in custody
    for (let i = 1; i < chainLogs.length; i++) {
      const prev = new Date(chainLogs[i - 1].timestamp);
      const curr = new Date(chainLogs[i].timestamp);
      const gapHours = (curr - prev) / (1000 * 60 * 60);
      
      if (gapHours > 72) {
        validationResults.gaps_detected.push({
          from: chainLogs[i - 1].timestamp,
          to: chainLogs[i].timestamp,
          gap_hours: gapHours
        });
        validationResults.has_continuous_chain = false;
      }
    }

    // Check for modification without justification
    const modifications = chainLogs.filter(log => log.action === 'modified');
    const unauthorizedMods = modifications.filter(mod => !mod.event_metadata?.justification);
    if (unauthorizedMods.length > 0) {
      validationResults.spoliation_risk = true;
    }

    // Calculate admissibility score (0-100)
    let score = 0;
    if (validationResults.has_initial_collection) score += 30;
    if (validationResults.hash_verified) score += 30;
    if (validationResults.has_continuous_chain) score += 25;
    if (!validationResults.spoliation_risk) score += 15;
    validationResults.admissibility_score = score;

    const valid = score >= 75;

    return Response.json({
      valid,
      score,
      ...validationResults,
      chain_logs: chainLogs,
      recommendations: valid ? [] : [
        !validationResults.has_initial_collection && 'Document initial evidence collection',
        !validationResults.hash_verified && 'Verify cryptographic hash integrity',
        !validationResults.has_continuous_chain && 'Explain gaps in custody chain',
        validationResults.spoliation_risk && 'Document all modifications with legal justification'
      ].filter(Boolean)
    });

  } catch (error) {
    console.error('Chain validation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});