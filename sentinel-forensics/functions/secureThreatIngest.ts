import { checkRateLimit, requireOrganization, sanitizeInput } from './securityMiddleware.ts';
import { applySecurityHeaders } from './helpers/securityHeaders.ts';
import { sanitizeCVEInput } from './helpers/cveInput.ts';

/**
 * SECURE THREAT INTELLIGENCE INGESTION
 * Rate-limited, sanitized CVE/threat data ingestion
 */

Deno.serve(async (req) => {
  try {
    const { user, base44 } = await requireOrganization(req);
    await checkRateLimit(base44, user.organization_id, 100, 60000);

    const payload = await req.json();
    const { sanitized, isValid, errors } = sanitizeCVEInput(payload);

    if (!isValid) {
      return Response.json({
        error: 'Input validation failed',
        details: errors
      }, { status: 400 });
    }

    for (const field of ['vulnerability_name', 'description', 'severity', 'exploitation_status']) {
      if (typeof sanitized[field] === 'string') {
        sanitized[field] = sanitizeInput(sanitized[field]);
      }
    }

    sanitized.organization_id = user.organization_id;

    const vulnerability = await base44.entities.VulnerabilityAssessment.create(sanitized);
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

    return applySecurityHeaders(Response.json({
      success: true,
      vulnerability
    }));
  } catch (error) {
    console.error('Threat ingestion error:', error);
    const status = error.message === 'Rate limit exceeded' ? 429
      : error.message?.startsWith('Unauthorized') ? 401
      : error.message?.startsWith('Forbidden') ? 403
      : 500;
    return Response.json({ error: error.message }, { status });
  }
});