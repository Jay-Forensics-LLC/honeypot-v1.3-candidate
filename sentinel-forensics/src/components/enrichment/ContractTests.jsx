/**
 * CONTRACT TESTS
 * Validates enrichment system invariants
 */

export class ContractTests {
  /**
   * Validate that normalizedJson has no additionalProperties leakage
   */
  static validateNormalizedJson(normalizedJson, schemaProperties) {
    const allowedKeys = new Set(Object.keys(schemaProperties));
    const actualKeys = Object.keys(normalizedJson);
    
    const unexpectedKeys = actualKeys.filter(key => !allowedKeys.has(key));
    
    if (unexpectedKeys.length > 0) {
      throw new Error(`Additional properties detected: ${unexpectedKeys.join(', ')}`);
    }
    
    return true;
  }

  /**
   * Validate traceability invariants
   */
  static validateTraceability(evidenceRefs) {
    if (!evidenceRefs) {
      throw new Error('Evidence refs required');
    }

    if (!evidenceRefs.event_ids || !Array.isArray(evidenceRefs.event_ids)) {
      throw new Error('event_ids must be array');
    }

    if (!evidenceRefs.fields_used || !Array.isArray(evidenceRefs.fields_used)) {
      throw new Error('fields_used must be array');
    }

    if (evidenceRefs.fields_used.length === 0) {
      throw new Error('fields_used cannot be empty');
    }

    return true;
  }

  /**
   * Validate enrichment result schema
   */
  static validateEnrichmentResult(result) {
    const required = [
      'organization_id',
      'case_id',
      'schema_version',
      'enrichment_run_id',
      'indicator_id',
      'provider',
      'normalized_json',
      'confidence'
    ];

    for (const field of required) {
      if (!(field in result)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate confidence range
    if (result.confidence < 0 || result.confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }

    // Validate risk score if present
    if (result.risk_score !== null && result.risk_score !== undefined) {
      if (result.risk_score < 0 || result.risk_score > 100) {
        throw new Error('Risk score must be between 0 and 100');
      }
    }

    return true;
  }

  /**
   * Validate CompositeRiskFinding schema
   */
  static validateCompositeRiskFinding(finding) {
    const required = [
      'organization_id',
      'case_id',
      'schema_version',
      'enrichment_run_id',
      'finding_type',
      'title',
      'severity',
      'risk_score',
      'confidence',
      'evidence_refs'
    ];

    for (const field of required) {
      if (!(field in finding)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate traceability
    this.validateTraceability(finding.evidence_refs);

    // Validate risk score
    if (finding.risk_score < 0 || finding.risk_score > 100) {
      throw new Error('Risk score must be between 0 and 100');
    }

    // Validate confidence
    if (finding.confidence < 0 || finding.confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }

    return true;
  }

  /**
   * Run all contract tests
   */
  static runAll(testData) {
    const results = [];

    try {
      if (testData.enrichmentResult) {
        this.validateEnrichmentResult(testData.enrichmentResult);
        results.push({ test: 'EnrichmentResult schema', status: 'PASS' });
      }
    } catch (error) {
      results.push({ test: 'EnrichmentResult schema', status: 'FAIL', error: error.message });
    }

    try {
      if (testData.compositeRiskFinding) {
        this.validateCompositeRiskFinding(testData.compositeRiskFinding);
        results.push({ test: 'CompositeRiskFinding schema', status: 'PASS' });
      }
    } catch (error) {
      results.push({ test: 'CompositeRiskFinding schema', status: 'FAIL', error: error.message });
    }

    try {
      if (testData.traceability) {
        this.validateTraceability(testData.traceability);
        results.push({ test: 'Traceability invariants', status: 'PASS' });
      }
    } catch (error) {
      results.push({ test: 'Traceability invariants', status: 'FAIL', error: error.message });
    }

    return results;
  }
}

/**
 * Sample test data for validation
 */
export const sampleTestData = {
  enrichmentResult: {
    organization_id: 'test-org',
    case_id: 'test-case',
    schema_version: '1.0.0',
    enrichment_run_id: 'test-run',
    indicator_id: 'test-indicator',
    provider: 'internal',
    normalized_json: {
      ip: '192.168.1.1',
      riskScore: 75,
      confidence: 0.85
    },
    risk_score: 75,
    confidence: 0.85,
    tags: ['test'],
    summary: 'Test summary'
  },
  compositeRiskFinding: {
    organization_id: 'test-org',
    case_id: 'test-case',
    schema_version: '1.0.0',
    enrichment_run_id: 'test-run',
    finding_type: 'user_risk',
    title: 'Test Finding',
    severity: 'high',
    risk_score: 80,
    confidence: 0.9,
    evidence_refs: {
      event_ids: ['event-1'],
      fields_used: ['actor_user', 'src_ip']
    }
  },
  traceability: {
    event_ids: ['event-1', 'event-2'],
    fields_used: ['src_ip', 'dst_ip'],
    time_range: {
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-02T00:00:00Z'
    }
  }
};