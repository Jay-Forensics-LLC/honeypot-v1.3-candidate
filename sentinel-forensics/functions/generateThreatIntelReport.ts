import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { criteria, report_name, report_purpose, linked_case_id } = await req.json();
    
    if (!criteria || !report_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const reportId = `TIR-${Date.now()}`;
    const now = new Date().toISOString();
    
    // Fetch data based on criteria
    const dataCollectionPromises = [];
    
    if (criteria.data_sources.includes('alerts')) {
      dataCollectionPromises.push(
        base44.asServiceRole.entities.Alert.filter({
          organization_id: user.organization_id,
          created_date: { $gte: criteria.time_range_start, $lte: criteria.time_range_end }
        })
      );
    }
    
    if (criteria.data_sources.includes('endpoint_events')) {
      dataCollectionPromises.push(
        base44.asServiceRole.entities.DeviceEvent.filter({
          organization_id: user.organization_id,
          created_date: { $gte: criteria.time_range_start, $lte: criteria.time_range_end }
        })
      );
    }
    
    if (criteria.data_sources.includes('network_logs')) {
      dataCollectionPromises.push(
        base44.asServiceRole.entities.NetworkTrafficLog.filter({
          organization_id: user.organization_id,
          timestamp: { $gte: criteria.time_range_start, $lte: criteria.time_range_end }
        })
      );
    }

    const [alerts = [], deviceEvents = [], networkLogs = []] = await Promise.all(dataCollectionPromises);
    
    // Filter by severity threshold
    const severityMap = { low: 1, medium: 2, high: 3, critical: 4 };
    const threshold = severityMap[criteria.severity_threshold] || 1;
    
    const filteredAlerts = alerts.filter(a => severityMap[a.severity] >= threshold);
    
    // Build observed indicators
    const observedIndicators = [];
    const threatClassifications = [];
    const affectedSystems = new Set();
    
    // Extract indicators from alerts
    filteredAlerts.forEach(alert => {
      if (alert.affected_systems) {
        alert.affected_systems.forEach(sys => affectedSystems.add(sys));
      }
      
      observedIndicators.push({
        indicator_type: alert.alert_type,
        value: alert.source || 'Unknown',
        first_seen: alert.detection_timestamp || alert.created_date,
        last_seen: alert.detection_timestamp || alert.created_date,
        occurrence_count: 1,
        source_logs: [alert.id]
      });
      
      // Map to MITRE if applicable
      if (criteria.framework_alignment?.includes('mitre_attack')) {
        const mitreMapping = {
          'malware_detected': { technique: 'T1204', tactic: 'Execution' },
          'unauthorized_access': { technique: 'T1078', tactic: 'Initial Access' },
          'data_exfiltration': { technique: 'T1041', tactic: 'Exfiltration' },
          'surveillance_detected': { technique: 'T1113', tactic: 'Collection' }
        };
        
        const mapping = mitreMapping[alert.alert_type];
        if (mapping) {
          threatClassifications.push({
            threat_name: alert.title,
            mitre_technique_id: mapping.technique,
            mitre_tactic: mapping.tactic,
            confidence_level: alert.threat_score > 70 ? 'high' : alert.threat_score > 40 ? 'medium' : 'low',
            evidence_refs: [alert.id]
          });
        }
      }
    });
    
    // Call AI for executive summary and analysis
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return Response.json({ error: 'AI service not configured' }, { status: 500 });
    }

    const aiPrompt = `You are a cybersecurity analyst generating a threat intelligence report.

CONSTRAINTS:
- Only analyze the provided data. Do not invent threats.
- Use precise, evidence-based language.
- Cite specific indicators when making assertions.
- If data is insufficient, state limitations clearly.

DATA SUMMARY:
- Time Range: ${criteria.time_range_start} to ${criteria.time_range_end}
- Alerts Analyzed: ${filteredAlerts.length}
- Data Sources: ${criteria.data_sources.join(', ')}
- Threat Categories: ${criteria.threat_categories.join(', ')}

OBSERVED INDICATORS:
${JSON.stringify(observedIndicators, null, 2)}

THREAT CLASSIFICATIONS:
${JSON.stringify(threatClassifications, null, 2)}

TASK:
Generate an executive summary (2-3 paragraphs, plain English) and impact assessment for report purpose: ${report_purpose}.

Output JSON format:
{
  "executive_summary": "...",
  "business_impact": "...",
  "technical_impact": "...",
  "risk_score": 0-100,
  "limitations_and_assumptions": ["..."]
}`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: aiPrompt
        }]
      })
    });

    if (!aiResponse.ok) {
      throw new Error('AI service error');
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.content[0].text;
    const aiJson = JSON.parse(aiContent);

    // Calculate report hash
    const reportData = {
      report_id: reportId,
      criteria,
      observed_indicators: observedIndicators,
      threat_classifications: threatClassifications
    };
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(reportData));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const reportHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create report
    const report = await base44.asServiceRole.entities.ThreatIntelReport.create({
      organization_id: user.organization_id,
      report_id: reportId,
      report_name,
      report_purpose,
      criteria,
      executive_summary: aiJson.executive_summary,
      scope_and_sources: {
        data_sources_used: criteria.data_sources,
        coverage_window: `${criteria.time_range_start} to ${criteria.time_range_end}`,
        total_records_analyzed: filteredAlerts.length + deviceEvents.length + networkLogs.length
      },
      observed_indicators: observedIndicators,
      threat_classifications: threatClassifications,
      impact_assessment: {
        affected_systems: Array.from(affectedSystems),
        business_impact: aiJson.business_impact,
        technical_impact: aiJson.technical_impact,
        risk_score: aiJson.risk_score
      },
      limitations_and_assumptions: aiJson.limitations_and_assumptions,
      report_metadata: {
        generated_at: now,
        generated_by: user.email,
        toolchain_version: 'v1.0.0',
        ai_model_used: 'claude-3-5-sonnet-20241022',
        report_hash: reportHash
      },
      linked_case_id
    });

    return Response.json({ 
      success: true,
      report_id: reportId,
      report
    });

  } catch (error) {
    console.error('Report generation error:', error);
    return Response.json({ 
      error: 'Report generation failed',
      details: error.message 
    }, { status: 500 });
  }
});