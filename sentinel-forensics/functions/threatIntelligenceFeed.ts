import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { indicator_type, indicator_value } = await req.json();

    const threats = [];

    // Check AlienVault OTX
    try {
      const otxKey = Deno.env.get('ALIENVAULT_OTX_API_KEY');
      if (otxKey && indicator_type === 'ip') {
        const otxResponse = await fetch(
          `https://otx.alienvault.com/api/v1/indicators/IPv4/${indicator_value}/general`,
          {
            headers: { 'X-OTX-API-KEY': otxKey }
          }
        );
        
        if (otxResponse.ok) {
          const otxData = await otxResponse.json();
          if (otxData.pulse_info?.count > 0) {
            threats.push({
              source: 'AlienVault OTX',
              threat_level: 'high',
              description: `Found in ${otxData.pulse_info.count} threat pulses`,
              reputation_score: Math.max(0, 100 - (otxData.pulse_info.count * 10))
            });
          }
        }
      }
    } catch (error) {
      console.error('OTX check failed:', error);
    }

    // Check VirusTotal
    try {
      const vtKey = Deno.env.get('VIRUSTOTAL_API_KEY');
      if (vtKey && (indicator_type === 'ip' || indicator_type === 'domain')) {
        const vtEndpoint = indicator_type === 'ip' 
          ? `https://www.virustotal.com/api/v3/ip_addresses/${indicator_value}`
          : `https://www.virustotal.com/api/v3/domains/${indicator_value}`;
        
        const vtResponse = await fetch(vtEndpoint, {
          headers: { 'x-apikey': vtKey }
        });
        
        if (vtResponse.ok) {
          const vtData = await vtResponse.json();
          const malicious = vtData.data?.attributes?.last_analysis_stats?.malicious || 0;
          
          if (malicious > 0) {
            threats.push({
              source: 'VirusTotal',
              threat_level: malicious > 5 ? 'critical' : 'high',
              description: `${malicious} security vendors flagged as malicious`,
              reputation_score: Math.max(0, 100 - (malicious * 5))
            });
          }
        }
      }
    } catch (error) {
      console.error('VirusTotal check failed:', error);
    }

    // Check Shodan
    try {
      const shodanKey = Deno.env.get('SHODAN_API_KEY');
      if (shodanKey && indicator_type === 'ip') {
        const shodanResponse = await fetch(
          `https://api.shodan.io/shodan/host/${indicator_value}?key=${shodanKey}`
        );
        
        if (shodanResponse.ok) {
          const shodanData = await shodanResponse.json();
          const vulnCount = shodanData.vulns?.length || 0;
          
          if (vulnCount > 0) {
            threats.push({
              source: 'Shodan',
              threat_level: vulnCount > 3 ? 'high' : 'medium',
              description: `${vulnCount} known vulnerabilities detected`,
              reputation_score: Math.max(0, 100 - (vulnCount * 15))
            });
          }
        }
      }
    } catch (error) {
      console.error('Shodan check failed:', error);
    }

    // Calculate overall threat score
    const overallScore = threats.length > 0
      ? Math.min(...threats.map(t => t.reputation_score))
      : 100;

    const threatLevel = overallScore < 30 ? 'critical' :
                       overallScore < 50 ? 'high' :
                       overallScore < 70 ? 'medium' : 'low';

    // Auto-flag if threat detected
    if (threats.length > 0) {
      await base44.asServiceRole.entities.Alert.create({
        alert_type: 'unauthorized_access',
        severity: threatLevel === 'critical' ? 'critical' : 'high',
        title: `Threat Intelligence Match: ${indicator_type} ${indicator_value}`,
        description: `This ${indicator_type} was flagged by ${threats.length} threat intelligence source(s)`,
        source: 'Threat Intelligence Feeds',
        detection_timestamp: new Date().toISOString(),
        status: 'new',
        recommended_actions: [
          'Block this indicator immediately',
          'Review associated traffic/logs',
          'Check for indicators of compromise',
          'Update firewall rules'
        ],
        threat_score: 100 - overallScore,
        affected_systems: [indicator_value]
      });
    }

    return Response.json({
      indicator_type,
      indicator_value,
      threats,
      overall_score: overallScore,
      threat_level: threatLevel,
      checked_at: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});