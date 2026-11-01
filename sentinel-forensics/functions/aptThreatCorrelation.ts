import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * APT THREAT CORRELATION ENGINE
 * Cross-references vulnerabilities with known APT TTPs
 * Auto-prioritizes CVEs exploited by APT groups in last 90 days
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all vulnerabilities for organization
    const vulnerabilities = await base44.entities.VulnerabilityAssessment.filter({
      organization_id: user.organization_id
    }, '-created_date', 500);

    // Fetch known APT groups and their TTPs
    const aptGroups = await base44.entities.APTGroup.filter({
      organization_id: user.organization_id
    });

    // Fetch recent threat intelligence (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const recentThreats = await base44.entities.ThreatIntelligence.filter({
      organization_id: user.organization_id
    }, '-timestamp', 1000);

    const correlatedVulnerabilities = [];

    for (const vuln of vulnerabilities) {
      let riskBoost = 0;
      const matchedAPTs = [];
      const matchedTTPs = [];
      const threatSources = [];

      // Correlate with APT groups
      for (const apt of aptGroups) {
        if (vuln.apt_relevance?.apt_groups?.includes(apt.group_name)) {
          matchedAPTs.push(apt.group_name);
          riskBoost += 15; // Major boost for known APT targeting
        }
      }

      // Correlate with recent threat intel
      for (const threat of recentThreats) {
        const threatAge = new Date() - new Date(threat.timestamp);
        const daysOld = threatAge / (1000 * 60 * 60 * 24);
        
        if (daysOld <= 90) {
          // Check if threat mentions this CVE
          const cveMatch = threat.indicators?.some(ind => 
            ind.value?.includes(vuln.cve_id)
          );
          
          if (cveMatch) {
            threatSources.push(threat.source);
            matchedTTPs.push(...(threat.ttps || []));
            riskBoost += Math.max(5, 20 - (daysOld / 5)); // Decay over time
          }
        }
      }

      // Calculate enhanced risk score
      const originalScore = vuln.risk_priority_score || vuln.cvss_score * 10 || 0;
      const enhancedScore = Math.min(100, originalScore + riskBoost);

      // Update if score changed significantly
      if (enhancedScore > originalScore + 10) {
        await base44.asServiceRole.entities.VulnerabilityAssessment.update(vuln.id, {
          risk_priority_score: enhancedScore,
          apt_relevance: {
            ...vuln.apt_relevance,
            apt_groups: matchedAPTs,
            threat_actors: [...new Set([...(vuln.apt_relevance?.threat_actors || []), ...threatSources])],
            is_apt_targeted: matchedAPTs.length > 0
          },
          threat_intelligence_sources: [...new Set([...(vuln.threat_intelligence_sources || []), ...threatSources])]
        });

        correlatedVulnerabilities.push({
          cve_id: vuln.cve_id,
          originalScore,
          enhancedScore,
          matchedAPTs,
          matchedTTPs: [...new Set(matchedTTPs)]
        });
      }
    }

    // Log correlation run
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: 'system',
      action: 'apt_correlation_completed',
      resource_type: 'vulnerability',
      severity: 'info',
      details: {
        vulnerabilities_analyzed: vulnerabilities.length,
        vulnerabilities_reprioritized: correlatedVulnerabilities.length,
        apt_groups_checked: aptGroups.length
      }
    });

    return Response.json({
      success: true,
      analyzed: vulnerabilities.length,
      reprioritized: correlatedVulnerabilities.length,
      correlations: correlatedVulnerabilities
    });

  } catch (error) {
    console.error('APT correlation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});