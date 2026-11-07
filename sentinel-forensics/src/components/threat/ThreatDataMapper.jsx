/**
 * THREAT DATA MAPPER
 * Normalizes threat intelligence from different providers
 */

/**
 * Map threat data to normalized format
 */
export function mapThreatData(data) {
  const normalized = {
    indicator: data.ip || data.domain || data.hash,
    indicatorType: data.ip ? 'ip' : data.domain ? 'domain' : 'hash',
    timestamp: data.timestamp || Date.now(),
    threatScore: data.threatScore || 0,
    malicious: false,
    sources: [],
    confidence: 'unknown',
    severity: 'unknown',
    tags: [],
    metadata: {}
  };

  // Process sources
  if (data.sources) {
    for (const [provider, sourceData] of Object.entries(data.sources)) {
      const mappedSource = mapSource(provider, sourceData);
      normalized.sources.push(mappedSource);

      // Update malicious flag
      if (mappedSource.malicious) {
        normalized.malicious = true;
      }
    }
  }

  // Calculate confidence
  normalized.confidence = calculateConfidence(normalized.sources);

  // Calculate severity
  normalized.severity = calculateSeverity(normalized.threatScore);

  // Extract tags
  normalized.tags = extractTags(normalized);

  // Add metadata
  normalized.metadata = {
    sourceCount: normalized.sources.length,
    validationErrors: data._validationErrors || [],
    validated: data._validated || false
  };

  return normalized;
}

/**
 * Map source-specific data
 */
function mapSource(provider, data) {
  const mapped = {
    provider,
    malicious: data.malicious || false,
    score: data.score || 0,
    confidence: 0,
    details: {}
  };

  switch (provider.toLowerCase()) {
    case 'abuseipdb':
      mapped.confidence = data.score > 80 ? 'high' : data.score > 50 ? 'medium' : 'low';
      mapped.details = {
        reports: data.reports,
        abuseScore: data.score
      };
      break;

    case 'virustotal':
      if (data.total > 0) {
        const ratio = data.positives / data.total;
        mapped.confidence = ratio > 0.5 ? 'high' : ratio > 0.2 ? 'medium' : 'low';
      }
      mapped.details = {
        positives: data.positives,
        total: data.total
      };
      break;

    case 'alienvault otx':
      mapped.confidence = data.pulseCount > 5 ? 'high' : data.pulseCount > 0 ? 'medium' : 'low';
      mapped.details = {
        pulseCount: data.pulseCount
      };
      break;

    case 'urlscan':
      mapped.confidence = data.malicious ? 'high' : 'low';
      mapped.details = {
        verdict: data.malicious ? 'malicious' : 'clean'
      };
      break;

    default:
      mapped.confidence = 'unknown';
  }

  if (data.error) {
    mapped.error = data.error;
    mapped.confidence = 'unknown';
  }

  return mapped;
}

/**
 * Calculate aggregate confidence
 */
function calculateConfidence(sources) {
  if (sources.length === 0) return 'unknown';

  const confidenceLevels = {
    'high': 3,
    'medium': 2,
    'low': 1,
    'unknown': 0
  };

  const scores = sources
    .map(s => confidenceLevels[s.confidence] || 0)
    .filter(s => s > 0);

  if (scores.length === 0) return 'unknown';

  const average = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (average >= 2.5) return 'high';
  if (average >= 1.5) return 'medium';
  return 'low';
}

/**
 * Calculate severity based on threat score
 */
function calculateSeverity(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'info';
}

/**
 * Extract tags from threat data
 */
function extractTags(data) {
  const tags = [];

  if (data.malicious) tags.push('malicious');
  if (data.threatScore > 70) tags.push('high-risk');
  if (data.confidence === 'high') tags.push('verified');
  
  // Add severity tag
  tags.push(data.severity);

  return [...new Set(tags)];
}

/**
 * Format for evidence creation
 */
export function formatForEvidence(threatData) {
  return {
    evidenceType: 'threat_intelligence',
    name: `Threat: ${threatData.indicator}`,
    description: `Threat intelligence for ${threatData.indicatorType} with score ${threatData.threatScore}/100`,
    severity: threatData.severity,
    metadata: {
      indicator: threatData.indicator,
      indicatorType: threatData.indicatorType,
      threatScore: threatData.threatScore,
      malicious: threatData.malicious,
      confidence: threatData.confidence,
      sources: threatData.sources.map(s => s.provider),
      tags: threatData.tags,
      timestamp: new Date(threatData.timestamp).toISOString()
    },
    threat_classification: threatData.severity,
    analyzed: true
  };
}