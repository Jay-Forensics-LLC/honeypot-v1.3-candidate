import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { checkRateLimit as checkThreatIngestRateLimit } from './securityMiddleware.ts';
import { requireAuth, requireOrg, safeJson } from './helpers/security.ts';
import { applySecurityHeaders } from './helpers/securityHeaders.ts';
import { sanitizeCVEInput } from './helpers/cveInput.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    const organizationId = requireOrg(user);
    try {
      await checkThreatIngestRateLimit(
        base44,
        `secureThreatIngest:${organizationId}:${user.id || user.email || 'unknown'}`,
        100,
        60000
      );
    } catch (error) {
      if (error.message !== 'Rate limit exceeded') throw error;
      return applySecurityHeaders(Response.json({
        error: 'Rate limit exceeded',
      }, { status: 429 }));
    }

    const payload = await safeJson(req);
    const { sanitized, isValid, errors } = sanitizeCVEInput(payload);
    if (!isValid) {
      return applySecurityHeaders(Response.json({
        error: 'Input validation failed',
        details: errors
      }, { status: 400 }));
    }

    sanitized.organization_id = organizationId;
    const vulnerability = await base44.entities.VulnerabilityAssessment.create(sanitized);
    await base44.entities.AuditLog.create({
      organization_id: organizationId,
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
    return applySecurityHeaders(Response.json({ success: true, vulnerability }));
  } catch (error) {
    if (error instanceof Response) {
      return applySecurityHeaders(error);
    }
    console.error('Threat ingestion failed:', error);
    return applySecurityHeaders(Response.json({ error: 'Threat ingestion failed' }, { status: 500 }));
  }
});