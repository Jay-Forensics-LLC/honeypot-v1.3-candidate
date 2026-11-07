import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Automated IOC extraction and threat intelligence enrichment
 * Queries VirusTotal, AlienVault OTX, AbuseIPDB for threat context
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

    // Fetch evidence
    const evidence = await base44.entities.EvidenceV2.filter({ id: evidence_id });
    if (!evidence.length) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }
    const evidenceData = evidence[0];

    const enrichmentResults = [];
    const iocMatches = [];

    // Extract IOCs from evidence
    const iocs = [];

    // File hash IOC
    if (evidenceData.sha256_hash) {
      iocs.push({
        type: 'file_hash',
        value: evidenceData.sha256_hash
      });
    }

    // Extract IPs from description/metadata
    const ipRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    const domainRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
    
    const textContent = `${evidenceData.description || ''} ${JSON.stringify(evidenceData.metadata || {})}`;
    
    const ipMatches = textContent.match(ipRegex) || [];
    ipMatches.forEach(ip => iocs.push({ type: 'ip_address', value: ip }));

    const domainMatches = textContent.match(domainRegex) || [];
    domainMatches.forEach(domain => iocs.push({ type: 'domain', value: domain }));

    // Enrich each IOC
    for (const ioc of iocs) {
      // VirusTotal enrichment
      if (ioc.type === 'file_hash' && Deno.env.get('VIRUSTOTAL_API_KEY')) {
        try {
          const vtResponse = await fetch(`https://www.virustotal.com/api/v3/files/${ioc.value}`, {
            headers: {
              'x-apikey': Deno.env.get('VIRUSTOTAL_API_KEY')
            }
          });

          if (vtResponse.ok) {
            const vtData = await vtResponse.json();
            const stats = vtData.data?.attributes?.last_analysis_stats || {};
            const malicious = stats.malicious || 0;
            const suspicious = stats.suspicious || 0;
            const total = Object.values(stats).reduce((a, b) => a + b, 0);

            const verdict = malicious > 0 ? 'malicious' : suspicious > 0 ? 'suspicious' : 'clean';
            const threatScore = total > 0 ? Math.round(((malicious + suspicious * 0.5) / total) * 100) : 0;

            // Create enrichment result
            const enrichment = await base44.asServiceRole.entities.EnrichmentResult.create({
              organization_id: user.organization_id,
              evidence_id,
              feed_source: 'VirusTotal',
              verdict,
              threat_score: threatScore,
              threat_context: {
                malware_families: vtData.data?.attributes?.popular_threat_classification?.suggested_threat_label ? 
                  [vtData.data.attributes.popular_threat_classification.suggested_threat_label] : []
              },
              raw_response: vtData.data?.attributes || {},
              enriched_at: new Date().toISOString()
            });

            enrichmentResults.push(enrichment);

            // Create or update IOC
            const existingIOCs = await base44.entities.IOCIndicator.filter({
              indicator_type: ioc.type,
              indicator_value: ioc.value
            });

            if (existingIOCs.length === 0) {
              const iocRecord = await base44.asServiceRole.entities.IOCIndicator.create({
                organization_id: user.organization_id,
                case_id: evidenceData.case_id,
                indicator_type: ioc.type,
                indicator_value: ioc.value,
                first_seen: new Date().toISOString(),
                last_seen: new Date().toISOString(),
                threat_classification: verdict,
                confidence_score: threatScore,
                threat_names: vtData.data?.attributes?.names || [],
                sources: [{
                  feed_name: 'VirusTotal',
                  detection_date: new Date().toISOString(),
                  verdict
                }],
                related_evidence_ids: [evidence_id]
              });
              iocMatches.push(iocRecord);
            }
          }
        } catch (error) {
          console.error('VirusTotal enrichment error:', error);
        }
      }

      // AbuseIPDB enrichment for IPs
      if (ioc.type === 'ip_address' && Deno.env.get('ABUSEIPDB_API_KEY')) {
        try {
          const abuseResponse = await fetch(
            `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ioc.value)}`,
            {
              headers: {
                'Key': Deno.env.get('ABUSEIPDB_API_KEY'),
                'Accept': 'application/json'
              }
            }
          );

          if (abuseResponse.ok) {
            const abuseData = await abuseResponse.json();
            const data = abuseData.data || {};
            const abuseScore = data.abuseConfidenceScore || 0;
            const verdict = abuseScore > 75 ? 'malicious' : abuseScore > 25 ? 'suspicious' : 'clean';

            const enrichment = await base44.asServiceRole.entities.EnrichmentResult.create({
              organization_id: user.organization_id,
              evidence_id,
              feed_source: 'AbuseIPDB',
              verdict,
              threat_score: abuseScore,
              threat_context: {
                malware_families: [],
                campaigns: []
              },
              raw_response: data,
              enriched_at: new Date().toISOString()
            });

            enrichmentResults.push(enrichment);

            // Create IOC if malicious
            if (verdict === 'malicious' || verdict === 'suspicious') {
              const iocRecord = await base44.asServiceRole.entities.IOCIndicator.create({
                organization_id: user.organization_id,
                case_id: evidenceData.case_id,
                indicator_type: ioc.type,
                indicator_value: ioc.value,
                first_seen: new Date().toISOString(),
                last_seen: new Date().toISOString(),
                threat_classification: verdict,
                confidence_score: abuseScore,
                threat_names: [],
                sources: [{
                  feed_name: 'AbuseIPDB',
                  detection_date: new Date().toISOString(),
                  verdict
                }],
                related_evidence_ids: [evidence_id],
                metadata: {
                  country_code: data.countryCode,
                  isp: data.isp
                }
              });
              iocMatches.push(iocRecord);
            }
          }
        } catch (error) {
          console.error('AbuseIPDB enrichment error:', error);
        }
      }

      // AlienVault OTX enrichment
      if (Deno.env.get('ALIENVAULT_OTX_API_KEY')) {
        try {
          let otxEndpoint = '';
          if (ioc.type === 'ip_address') {
            otxEndpoint = `https://otx.alienvault.com/api/v1/indicators/IPv4/${ioc.value}/general`;
          } else if (ioc.type === 'domain') {
            otxEndpoint = `https://otx.alienvault.com/api/v1/indicators/domain/${ioc.value}/general`;
          } else if (ioc.type === 'file_hash') {
            otxEndpoint = `https://otx.alienvault.com/api/v1/indicators/file/${ioc.value}/general`;
          }

          if (otxEndpoint) {
            const otxResponse = await fetch(otxEndpoint, {
              headers: {
                'X-OTX-API-KEY': Deno.env.get('ALIENVAULT_OTX_API_KEY')
              }
            });

            if (otxResponse.ok) {
              const otxData = await otxResponse.json();
              const pulseCount = otxData.pulse_info?.count || 0;
              const verdict = pulseCount > 5 ? 'malicious' : pulseCount > 0 ? 'suspicious' : 'clean';

              if (pulseCount > 0) {
                const enrichment = await base44.asServiceRole.entities.EnrichmentResult.create({
                  organization_id: user.organization_id,
                  evidence_id,
                  feed_source: 'AlienVault OTX',
                  verdict,
                  threat_score: Math.min(pulseCount * 10, 100),
                  threat_context: {
                    malware_families: otxData.pulse_info?.pulses?.map(p => p.name).slice(0, 5) || []
                  },
                  raw_response: otxData,
                  enriched_at: new Date().toISOString()
                });

                enrichmentResults.push(enrichment);
              }
            }
          }
        } catch (error) {
          console.error('OTX enrichment error:', error);
        }
      }
    }

    // Auto-tag evidence if threats found
    const maliciousCount = enrichmentResults.filter(e => e.verdict === 'malicious').length;
    if (maliciousCount > 0) {
      // Create threat tag if not exists
      const threatTags = await base44.entities.Tag.filter({
        case_id: evidenceData.case_id,
        name: 'Malicious IOC Detected'
      });

      let threatTag;
      if (threatTags.length === 0) {
        threatTag = await base44.asServiceRole.entities.Tag.create({
          organization_id: user.organization_id,
          case_id: evidenceData.case_id,
          name: 'Malicious IOC Detected',
          color: '#EF4444',
          description: 'Automatically tagged by threat intelligence enrichment',
          created_by: 'system'
        });
      } else {
        threatTag = threatTags[0];
      }

      // Tag evidence
      await base44.asServiceRole.entities.EvidenceTag.create({
        organization_id: user.organization_id,
        evidence_id,
        tag_id: threatTag.id,
        applied_by: 'ai_enrichment',
        applied_at: new Date().toISOString(),
        is_active: true
      });
    }

    return Response.json({
      success: true,
      iocs_extracted: iocs.length,
      enrichments_completed: enrichmentResults.length,
      threats_detected: maliciousCount,
      ioc_matches: iocMatches
    });

  } catch (error) {
    console.error('Evidence enrichment error:', error);
    return Response.json({
      error: 'Enrichment failed',
      details: error.message
    }, { status: 500 });
  }
});