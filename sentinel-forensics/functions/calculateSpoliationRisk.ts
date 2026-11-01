import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { evidence_id } = await req.json();

    const evidence = await base44.entities.EvidenceV2.filter({ id: evidence_id });
    if (!evidence || evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidenceData = evidence[0];
    const chainLogs = await base44.entities.ChainOfCustodyLog.filter({ evidence_id });

    let riskScore = 0;
    const riskFactors = [];

    // Check chain of custody gaps
    if (chainLogs.length < 2) {
      riskScore += 30;
      riskFactors.push('Insufficient chain of custody documentation');
    }

    // Check time gaps between custody transfers
    for (let i = 1; i < chainLogs.length; i++) {
      const timeDiff = new Date(chainLogs[i].timestamp) - new Date(chainLogs[i-1].timestamp);
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      if (daysDiff > 30) {
        riskScore += 15;
        riskFactors.push(`Large time gap (${Math.floor(daysDiff)} days) between transfers`);
      }
    }

    // Check hash integrity
    if (!evidenceData.hash || !evidenceData.hash_algorithm) {
      riskScore += 25;
      riskFactors.push('Missing cryptographic hash verification');
    }

    // Check storage location
    if (!evidenceData.storage_location || evidenceData.storage_location === 'unknown') {
      riskScore += 10;
      riskFactors.push('Unknown or undocumented storage location');
    }

    // Check handling procedures
    const handlingCount = chainLogs.filter(log => log.action === 'accessed' || log.action === 'modified').length;
    if (handlingCount > 10) {
      riskScore += 10;
      riskFactors.push(`High handling frequency (${handlingCount} accesses)`);
    }

    // Cap at 100
    riskScore = Math.min(100, riskScore);

    await base44.entities.EvidenceV2.update(evidence_id, { spoliation_risk_score: riskScore });

    return Response.json({
      success: true,
      risk_score: riskScore,
      risk_level: riskScore > 50 ? 'high' : riskScore > 25 ? 'medium' : 'low',
      risk_factors: riskFactors
    });

  } catch (error) {
    console.error('Spoliation risk calculation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});