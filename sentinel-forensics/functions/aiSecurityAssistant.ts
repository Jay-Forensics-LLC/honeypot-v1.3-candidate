import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Anthropic from 'npm:@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Validate auth first
    let user;
    try {
      user = await base44.auth.me();
    } catch (authError) {
      console.error('Auth error:', authError);
      return Response.json({ error: 'Authentication failed' }, { status: 401 });
    }

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body safely
    let query, context;
    try {
      const body = await req.json();
      query = body.query;
      context = body.context;
    } catch (parseError) {
      console.error('Body parse error:', parseError);
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!query) {
      return Response.json({ error: 'Query required' }, { status: 400 });
    }

    // Validate API key
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      console.error('ANTHROPIC_API_KEY not configured');
      return Response.json({ 
        error: 'AI service not configured. Please contact administrator.' 
      }, { status: 503 });
    }

    // Fetch recent security context (gracefully degrade if entities don't exist)
    const securityContext = {
      alerts: [],
      devices: [],
      threats: [],
      cases: [],
      evidence: [],
      additionalContext: context || {}
    };

    try {
      const alertsResult = await base44.asServiceRole.entities.Alert.filter(
        { organization_id: user.organization_id }, 
        '-detection_timestamp', 
        50
      );
      securityContext.alerts = alertsResult || [];
    } catch (e) {
      console.warn('Failed to fetch alerts:', e.message);
    }

    try {
      const devicesResult = await base44.asServiceRole.entities.Device.filter(
        { organization_id: user.organization_id }, 
        '-agent_last_seen_at', 
        20
      );
      securityContext.devices = devicesResult || [];
    } catch (e) {
      console.warn('Failed to fetch devices:', e.message);
    }

    try {
      const threatsResult = await base44.asServiceRole.entities.ThreatDetection.filter(
        { organization_id: user.organization_id }, 
        '-detected_at', 
        30
      );
      securityContext.threats = threatsResult || [];
    } catch (e) {
      console.warn('Failed to fetch threats:', e.message);
    }

    try {
      const casesResult = await base44.asServiceRole.entities.Case.filter(
        { organization_id: user.organization_id }, 
        '-created_date', 
        20
      );
      securityContext.cases = casesResult || [];
    } catch (e) {
      console.warn('Failed to fetch cases:', e.message);
    }

    try {
      const evidenceResult = await base44.asServiceRole.entities.EvidenceV2.filter(
        { organization_id: user.organization_id }, 
        '-created_date', 
        30
      );
      securityContext.evidence = evidenceResult || [];
    } catch (e) {
      console.warn('Failed to fetch evidence:', e.message);
    }

    const systemPrompt = `You are a forensic security analyst assistant for Sentinel Forensics. 
You specialize in:
- Analyzing security logs and alerts for threats, anomalies, and attack patterns
- Endpoint behavioral analysis and malware detection
- Forensic data analysis (disk images, memory dumps, artifacts)
- Providing actionable incident response recommendations based on NIST, SANS, and industry best practices
- Remote endpoint investigation and containment strategies
- Suggesting security policy configurations aligned with GDPR, HIPAA, SOC 2, OWASP, CCPA compliance
- Generating forensically sound security reports and documentation

Current security context:
- Alerts: ${securityContext.alerts.length} recent alerts
- Devices: ${securityContext.devices.length} monitored devices
- Threats: ${securityContext.threats.length} detected threats
- Cases: ${securityContext.cases.length} active investigations
- Evidence: ${securityContext.evidence.length} evidence items

When analyzing forensic data:
1. Examine process artifacts for suspicious behavior (encoded commands, privilege escalation)
2. Check network artifacts for C2 communications and data exfiltration
3. Analyze memory dumps for code injection and malware signatures
4. Review registry/persistence mechanisms
5. Correlate findings across artifacts for comprehensive threat assessment

Provide clear, actionable, and forensically sound advice. Always prioritize evidence preservation and chain of custody. For endpoint threats, recommend immediate isolation and investigation procedures.`;

    // Call Anthropic API with error handling
    let assistantResponse;
    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Security Context:\n${JSON.stringify(securityContext, null, 2)}\n\nUser Query: ${query}`
          }
        ]
      });

      assistantResponse = response.content[0].text;
    } catch (apiError) {
      console.error('Anthropic API error:', apiError);
      return Response.json({ 
        error: 'AI service temporarily unavailable',
        details: apiError.message 
      }, { status: 503 });
    }

    // Log the interaction (optional - only if AuditLog exists)
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        organization_id: user.organization_id,
        user_email: user.email,
        action: 'ai_security_assistant_query',
        resource_type: 'security_analysis',
        timestamp: new Date().toISOString(),
        details: {
          query: query.substring(0, 200),
          response_length: assistantResponse.length
        }
      });
    } catch (logError) {
      console.warn('Failed to log audit entry:', logError.message);
    }

    return Response.json({
      response: assistantResponse,
      context_used: {
        alerts_count: securityContext.alerts.length,
        devices_count: securityContext.devices.length,
        threats_count: securityContext.threats.length,
        cases_count: securityContext.cases.length,
        evidence_count: securityContext.evidence.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Security Assistant error:', error);
    return Response.json({ 
      error: 'Failed to process security query',
      details: error.message 
    }, { status: 500 });
  }
});