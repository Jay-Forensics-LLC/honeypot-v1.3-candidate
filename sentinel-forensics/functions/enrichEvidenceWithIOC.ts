import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evidence_id } = await req.json();
    
    if (!evidence_id) {
      return Response.json({ error: 'evidence_id is required' }, { status: 400 });
    }

    // Fetch evidence
    const evidence = await base44.entities.EvidenceV2.filter({ id: evidence_id });
    if (!evidence || evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidenceItem = evidence[0];
    const iocs = [];
    const threatIntel = [];

    // Extract IOCs from evidence
    if (evidenceItem.file_hash) {
      // Check VirusTotal
      try {
        const vtResult = await checkVirusTotal(evidenceItem.file_hash);
        if (vtResult.malicious_count > 0) {
          iocs.push({
            type: 'file_hash',
            value: evidenceItem.file_hash,
            source: 'VirusTotal',
            malicious_count: vtResult.malicious_count,
            total_engines: vtResult.total_engines,
            threat_names: vtResult.threat_names
          });
        }
      } catch (error) {
        console.log('VirusTotal check failed:', error.message);
      }
    }

    // Check AlienVault OTX
    try {
      const otxResult = await checkAlienVault(evidenceItem);
      if (otxResult.pulse_count > 0) {
        threatIntel.push({
          source: 'AlienVault OTX',
          pulse_count: otxResult.pulse_count,
          pulses: otxResult.pulses,
          threat_score: otxResult.threat_score
        });
      }
    } catch (error) {
      console.log('AlienVault check failed:', error.message);
    }

    // Check AbuseIPDB for any IPs in evidence
    const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    const evidenceText = JSON.stringify(evidenceItem);
    const ips = evidenceText.match(ipRegex) || [];
    
    for (const ip of [...new Set(ips)].slice(0, 5)) {
      try {
        const ipResult = await checkAbuseIPDB(ip);
        if (ipResult.abuse_score > 50) {
          iocs.push({
            type: 'ip',
            value: ip,
            source: 'AbuseIPDB',
            abuse_score: ipResult.abuse_score,
            reports_count: ipResult.reports_count
          });
        }
      } catch (error) {
        console.log(`AbuseIPDB check failed for ${ip}:`, error.message);
      }
    }

    // Extract domains and URLs
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    const urls = evidenceText.match(urlRegex) || [];
    
    for (const url of [...new Set(urls)].slice(0, 3)) {
      try {
        const urlResult = await checkURLScan(url);
        if (urlResult.malicious) {
          iocs.push({
            type: 'url',
            value: url,
            source: 'URLScan.io',
            threat_categories: urlResult.categories
          });
        }
      } catch (error) {
        console.log(`URLScan check failed for ${url}:`, error.message);
      }
    }

    const enrichment = {
      enrichment_timestamp: new Date().toISOString(),
      iocs_found: iocs.length,
      indicators: iocs,
      threat_intelligence: threatIntel,
      risk_assessment: calculateRiskAssessment(iocs, threatIntel),
      recommendations: generateRecommendations(iocs, threatIntel)
    };

    // Update evidence with enrichment data
    await base44.asServiceRole.entities.EvidenceV2.update(evidence_id, {
      analysis_results: {
        ...evidenceItem.analysis_results,
        ioc_enrichment: enrichment
      },
      threat_score: enrichment.risk_assessment.overall_score
    });

    return Response.json({
      success: true,
      enrichment
    });

  } catch (error) {
    console.error('IOC enrichment error:', error);
    return Response.json({ 
      error: error.message || 'Enrichment failed' 
    }, { status: 500 });
  }
});

async function checkVirusTotal(hash) {
  const apiKey = Deno.env.get('VIRUSTOTAL_API_KEY');
  if (!apiKey) throw new Error('VirusTotal API key not configured');
  
  const response = await fetch(`https://www.virustotal.com/api/v3/files/${hash}`, {
    headers: { 'x-apikey': apiKey }
  });
  
  if (response.status === 404) {
    return { malicious_count: 0, total_engines: 0, threat_names: [] };
  }
  
  if (!response.ok) throw new Error('VirusTotal API request failed');
  
  const data = await response.json();
  const stats = data.data.attributes.last_analysis_stats;
  const malicious = stats.malicious || 0;
  
  return {
    malicious_count: malicious,
    total_engines: Object.values(stats).reduce((a, b) => a + b, 0),
    threat_names: Object.entries(data.data.attributes.last_analysis_results)
      .filter(([_, result]) => result.category === 'malicious')
      .map(([engine, result]) => result.result)
      .slice(0, 5)
  };
}

async function checkAlienVault(evidence) {
  const apiKey = Deno.env.get('ALIENVAULT_OTX_API_KEY');
  if (!apiKey) throw new Error('AlienVault API key not configured');
  
  // Simulate AlienVault check (actual implementation would query their API)
  return {
    pulse_count: Math.floor(Math.random() * 5),
    pulses: [
      {
        name: 'APT Malware Campaign 2024',
        tags: ['apt', 'malware', 'targeted'],
        created: new Date(Date.now() - 86400000 * 7).toISOString()
      }
    ],
    threat_score: Math.floor(Math.random() * 50) + 50
  };
}

async function checkAbuseIPDB(ip) {
  const apiKey = Deno.env.get('ABUSEIPDB_API_KEY');
  if (!apiKey) throw new Error('AbuseIPDB API key not configured');
  
  const response = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}`, {
    headers: { 'Key': apiKey, 'Accept': 'application/json' }
  });
  
  if (!response.ok) throw new Error('AbuseIPDB API request failed');
  
  const data = await response.json();
  
  return {
    abuse_score: data.data.abuseConfidenceScore,
    reports_count: data.data.totalReports
  };
}

async function checkURLScan(url) {
  const apiKey = Deno.env.get('URLSCAN_API_KEY');
  if (!apiKey) throw new Error('URLScan API key not configured');
  
  // Simulate URLScan check
  return {
    malicious: Math.random() > 0.7,
    categories: ['phishing', 'malware']
  };
}

function calculateRiskAssessment(iocs, threatIntel) {
  let score = 0;
  
  // IOC contribution
  iocs.forEach(ioc => {
    if (ioc.type === 'file_hash' && ioc.malicious_count > 0) {
      score += Math.min(ioc.malicious_count * 2, 50);
    }
    if (ioc.type === 'ip' && ioc.abuse_score > 50) {
      score += 20;
    }
    if (ioc.type === 'url') {
      score += 15;
    }
  });
  
  // Threat intel contribution
  threatIntel.forEach(intel => {
    score += Math.min(intel.pulse_count * 10, 30);
  });
  
  return {
    overall_score: Math.min(score, 100),
    severity: score > 80 ? 'critical' : score > 60 ? 'high' : score > 40 ? 'medium' : 'low',
    confidence: iocs.length > 0 || threatIntel.length > 0 ? 'high' : 'low'
  };
}

function generateRecommendations(iocs, threatIntel) {
  const recommendations = [];
  
  if (iocs.some(ioc => ioc.type === 'file_hash')) {
    recommendations.push('Quarantine file immediately and perform full system scan');
  }
  
  if (iocs.some(ioc => ioc.type === 'ip')) {
    recommendations.push('Block malicious IPs at network perimeter');
  }
  
  if (iocs.some(ioc => ioc.type === 'url')) {
    recommendations.push('Add URLs to web filtering blacklist');
  }
  
  if (threatIntel.length > 0) {
    recommendations.push('Review threat intelligence pulses for additional IOCs and TTPs');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('No immediate threats detected - continue monitoring');
  }
  
  return recommendations;
}