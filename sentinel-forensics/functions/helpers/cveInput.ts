const CVE_ID_PATTERN = /^CVE-\d{4}-\d{4,}$/i;
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'unknown']);
const TEXT_LIMITS = {
  title: 256,
  description: 10000,
  cvss_vector: 256,
  affected_component: 512,
  published_date: 64
};

function sanitizeText(value) {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .trim();
}

export function sanitizeCVEInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { sanitized: {}, isValid: false, errors: ['Expected an object'] };
  }

  const sanitized = {};
  const cveId = typeof input.cve_id === 'string' ? input.cve_id.trim().toUpperCase() : '';
  if (!CVE_ID_PATTERN.test(cveId)) {
    errors.push('Invalid CVE identifier');
  } else {
    sanitized.cve_id = cveId;
  }

  for (const [field, maxLength] of Object.entries(TEXT_LIMITS)) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || value.length > maxLength) {
      errors.push(`Invalid ${field}`);
      continue;
    }
    sanitized[field] = sanitizeText(value);
  }

  if (input.severity !== undefined && input.severity !== null) {
    const severity = typeof input.severity === 'string' ? input.severity.toLowerCase() : '';
    if (!SEVERITIES.has(severity)) {
      errors.push('Invalid severity');
    } else {
      sanitized.severity = severity;
    }
  }

  if (input.cvss_score !== undefined && input.cvss_score !== null) {
    if (
      typeof input.cvss_score !== 'number'
      || !Number.isFinite(input.cvss_score)
      || input.cvss_score < 0
      || input.cvss_score > 10
    ) {
      errors.push('Invalid CVSS score');
    } else {
      sanitized.cvss_score = input.cvss_score;
    }
  }

  if (input.references !== undefined && input.references !== null) {
    if (
      !Array.isArray(input.references)
      || input.references.length > 20
      || input.references.some(reference => typeof reference !== 'string' || reference.length > 2048)
    ) {
      errors.push('Invalid references');
    } else {
      sanitized.references = input.references.map(sanitizeText);
    }
  }

  return { sanitized, isValid: errors.length === 0, errors };
}
