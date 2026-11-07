import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { withRateLimit, applySecurityHeaders, sanitizeCVEInput } from './securityMiddleware.js';

/**
 * SECURE THREAT INTELLIGENCE INGESTION
 * Rate-limited, sanitized CVE/threat data ingestion
 */

Deno.serve(async (req) => {
  try {
    return await withRateLimit(req, async (base44, user) => {
      const payload = await req.json();
      
      // Sanitize CVE data
      const { sanitized, isValid, errors } = sanitizeCVEInput(payload);
      
      if (!isValid) {
        return Response.json({ 
          error: 'Input validation failed', 
          details: errors 
        }, { status: 400 });
      }
      
      // Inject organization context
      sanitized.organization_id = user.organization_id;
      
      // Create vulnerability assessment
      const vulnerability = await base44.entities.VulnerabilityAssessment.create(sanitized);
      
      // Log ingestion
      await base44.entities.AuditLog.create({
        organization_id: user.organization_id,
        user_email: user.email,
        action: 'threat_ingested',
        resource_type: 'vulnerability',
        resource_id: vulnerability.id,
        severity: vulnerability.severity === 'critical' ? 'high' : 'info',
        details: {
          cve_id: sanitized.cve_id,
          severity: sanitized.severity,
          cvss_score: sanitized.cvss_score
        }
      });
      
      const response = Response.json({ 
        success: true, 
        vulnerability 
      });
      
      return applySecurityHeaders(response);
      
    }, { limit: 100, windowMs: 60000 }); // 100 ingestions per minute
    
  } catch (error) {
    console.error('Threat ingestion error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});