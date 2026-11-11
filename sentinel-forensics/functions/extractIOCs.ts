import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fe80:/i
];

const BENIGN_DOMAINS = [
  'google.com', 'googleapis.com', 'gstatic.com',
  'microsoft.com', 'windows.com', 'live.com',
  'apple.com', 'icloud.com', 'cdn.apple.com',
  'amazonaws.com', 'cloudfront.net',
  'facebook.com', 'fbcdn.net',
  'mozilla.org', 'firefox.com'
];

const PATTERNS = {
  ipv4: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
  ipv6: /\b(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\b/g,
  domain: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi,
  url: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  md5: /\b[a-fA-F0-9]{32}\b/g,
  sha1: /\b[a-fA-F0-9]{40}\b/g,
  sha256: /\b[a-fA-F0-9]{64}\b/g,
  registry_path: /HKEY_[A-Z_]+\\[^\s]+/g,
  mutex: /\b(?:Global|Local)\\[A-Za-z0-9_-]+/g,
  user_agent: /Mozilla\/[^\n\r]+/g
};

function isPrivateIP(ip) {
  return PRIVATE_RANGES.some(pattern => pattern.test(ip));
}

function isBenignDomain(domain) {
  const lower = domain.toLowerCase();
  return BENIGN_DOMAINS.some(benign => lower.endsWith(benign) || lower === benign);
}

function normalizeIndicator(type, value) {
  try {
    switch (type) {
      case 'domain':
        return value.toLowerCase().replace(/\.$/, '');
      case 'url':
        try {
          const url = new URL(value);
          url.protocol = url.protocol.toLowerCase();
          url.hostname = url.hostname.toLowerCase();
          return url.toString();
        } catch {
          return value.toLowerCase();
        }
      case 'email':
        return value.toLowerCase();
      case 'md5':
      case 'sha1':
      case 'sha256':
        return value.toLowerCase();
      case 'ipv4':
      case 'ipv6':
        return value;
      default:
        return value;
    }
  } catch {
    return value;
  }
}

function extractIndicators(content, evidenceId) {
  const indicators = [];
  const seen = new Set();

  Object.entries(PATTERNS).forEach(([type, pattern]) => {
    const matches = [...content.matchAll(pattern)];
    
    matches.forEach(match => {
      const rawValue = match[0];
      const normalizedValue = normalizeIndicator(type, rawValue);
      const key = `${type}:${normalizedValue}`;
      
      if (seen.has(key)) return;
      seen.add(key);

      const index = match.index;
      const start = Math.max(0, index - 200);
      const end = Math.min(content.length, index + rawValue.length + 200);
      const context_window = content.substring(start, end);

      let is_local = false;
      let is_allowlisted = false;
      let confidence = 0.8;

      if (type === 'ipv4' || type === 'ipv6') {
        is_local = isPrivateIP(normalizedValue);
        if (is_local) confidence = 0.3;
      }

      if (type === 'domain') {
        is_allowlisted = isBenignDomain(normalizedValue);
        if (is_allowlisted) confidence = 0.2;
      }

      let indicator_type = type;
      if (type === 'ipv4' || type === 'ipv6') indicator_type = 'ip';

      indicators.push({
        indicator_id: `IOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        evidence_id: evidenceId,
        indicator_type,
        value: normalizedValue,
        confidence,
        extraction_method: 'regex',
        context: {
          char_offset: index,
          context_window,
          line_number: content.substring(0, index).split('\n').length
        },
        is_local,
        is_allowlisted,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        status: is_allowlisted ? 'benign' : 'new'
      });
    });
  });

  return indicators;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evidence_id, content, case_id } = await req.json();

    if (!evidence_id || !content) {
      return Response.json({ 
        error: 'evidence_id and content required' 
      }, { status: 400 });
    }

    // SECURITY FIX: Verify user has access to this evidence using user-scoped client (RLS enforced)
    const userEvidence = await base44.entities.EvidenceV2.filter({ id: evidence_id });
    
    if (!userEvidence || userEvidence.length === 0) {
      await base44.entities.AuditLog.create({
        organization_id: user.organization_id,
        event_type: 'unauthorized_access_attempt',
        severity: 'warning',
        description: `User attempted to extract IOCs from evidence they don't have access to`,
        user_id: user.email,
        timestamp: new Date().toISOString(),
        success: false,
        metadata: {
          evidence_id,
          reason: 'rls_denied'
        }
      }).catch(() => {});
      
      return Response.json({ 
        error: 'Forbidden',
        message: 'You do not have access to this evidence'
      }, { status: 403 });
    }

    // If case_id provided, verify access to case using user-scoped client (RLS enforced)
    if (case_id) {
      const userCases = await base44.entities.Case.filter({ id: case_id });
      
      if (!userCases || userCases.length === 0) {
        return Response.json({ 
          error: 'Forbidden',
          message: 'You do not have access to this case'
        }, { status: 403 });
      }
    }

    // Extract indicators
    const indicators = extractIndicators(content, evidence_id);

    // SECURITY FIX: Save to database using user-scoped client (RLS enforced)
    const saved = [];
    for (const indicator of indicators) {
      try {
        const created = await base44.entities.IOCIndicator.create({
          ...indicator,
          case_id: case_id || null
        });
        saved.push(created);
      } catch (createError) {
        console.error('Failed to create indicator:', createError);
      }
    }

    // SECURITY FIX: Audit log with organization isolation
    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'ioc_extraction_completed',
      severity: 'info',
      description: `Extracted ${saved.length} IOCs from evidence`,
      user_id: user.email,
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        evidence_id,
        case_id,
        indicators_extracted: saved.length
      }
    }).catch((err) => console.warn('Audit log failed:', err));

    return Response.json({
      success: true,
      indicators: saved,
      count: saved.length,
      summary: {
        total: saved.length,
        by_type: saved.reduce((acc, ind) => {
          acc[ind.indicator_type] = (acc[ind.indicator_type] || 0) + 1;
          return acc;
        }, {}),
        local: saved.filter(i => i.is_local).length,
        allowlisted: saved.filter(i => i.is_allowlisted).length
      }
    });

  } catch (error) {
    console.error('IOC extraction error:', error);
    return Response.json({ 
      error: 'Extraction failed', 
      message: error.message 
    }, { status: 500 });
  }
});