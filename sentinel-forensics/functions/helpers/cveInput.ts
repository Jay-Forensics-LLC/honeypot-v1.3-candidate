const CVE_ID_PATTERN = /^CVE-\d{4}-\d{4,}$/i;
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info', 'unknown'];
const EXPLOITATION_STATUSES = ['zero_day', 'actively_exploited', 'poc_exists', 'not_exploited'];

export function sanitizeCVEInput(payload: unknown): {
  sanitized: Record<string, unknown>;
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { sanitized: {}, isValid: false, errors: ['Expected a CVE object'] };
  }

  const input = payload as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  const cveId = typeof input.cve_id === 'string' ? input.cve_id.trim().toUpperCase() : '';
  if (!CVE_ID_PATTERN.test(cveId)) {
    errors.push('cve_id must be a valid CVE identifier');
  } else {
    sanitized.cve_id = cveId;
  }

  const textFields = {
    vulnerability_name: 255,
    description: 10_000
  };
  for (const [field, maxLength] of Object.entries(textFields)) {
    const value = input[field];
    if (value !== undefined) {
      if (typeof value !== 'string' || value.length > maxLength) {
        errors.push(`${field} must be a string of at most ${maxLength} characters`);
      } else {
        sanitized[field] = value.trim();
      }
    }
  }

  if (input.severity !== undefined) {
    if (typeof input.severity !== 'string' || !SEVERITIES.includes(input.severity.toLowerCase())) {
      errors.push('severity is invalid');
    } else {
      sanitized.severity = input.severity.toLowerCase();
    }
  }

  if (input.cvss_score !== undefined) {
    if (typeof input.cvss_score !== 'number' || !Number.isFinite(input.cvss_score)
      || input.cvss_score < 0 || input.cvss_score > 10) {
      errors.push('cvss_score must be a finite number between 0 and 10');
    } else {
      sanitized.cvss_score = input.cvss_score;
    }
  }

  if (input.exploitation_status !== undefined) {
    if (typeof input.exploitation_status !== 'string'
      || !EXPLOITATION_STATUSES.includes(input.exploitation_status)) {
      errors.push('exploitation_status is invalid');
    } else {
      sanitized.exploitation_status = input.exploitation_status;
    }
  }

  if (input.references !== undefined) {
    if (!Array.isArray(input.references) || input.references.length > 20
      || !input.references.every(reference => {
        if (typeof reference !== 'string') return false;
        try {
          return new URL(reference).protocol === 'https:';
        } catch {
          return false;
        }
      })) {
      errors.push('references must contain at most 20 HTTPS URLs');
    } else {
      sanitized.references = input.references;
    }
  }

  return { sanitized, isValid: errors.length === 0, errors };
}
