/**
 * SCHEMA VALIDATOR
 * Centralized validation for all enrichment entities
 * Enforces strict schema compliance with additionalProperties: false
 */

export class SchemaValidator {
  static schemas = {
    Indicator: {
      required: ['organization_id', 'case_id', 'indicator_type', 'value', 'schema_version'],
      properties: [
        'organization_id', 'case_id', 'schema_version', 'prompt_version',
        'indicator_type', 'value', 'labels', 'notes', 'first_seen_at',
        'last_seen_at', 'derived_from', 'id', 'created_date', 'updated_date', 'created_by'
      ]
    },
    EnrichmentRun: {
      required: ['organization_id', 'case_id', 'schema_version', 'run_type', 'provider', 'input_indicator_ids'],
      properties: [
        'organization_id', 'case_id', 'schema_version', 'prompt_version',
        'run_type', 'status', 'provider', 'started_at', 'finished_at',
        'parameters_json', 'input_indicator_ids', 'court_admissible_mode',
        'run_fingerprint', 'raw_provider_refs', 'error_message',
        'id', 'created_date', 'updated_date', 'created_by'
      ]
    },
    EnrichmentResult: {
      required: ['organization_id', 'case_id', 'schema_version', 'enrichment_run_id', 'indicator_id', 'provider', 'normalized_json', 'confidence'],
      properties: [
        'organization_id', 'case_id', 'schema_version', 'prompt_version',
        'enrichment_run_id', 'indicator_id', 'provider', 'expires_at',
        'raw_json_ref', 'raw_json_sha256', 'normalized_json', 'risk_score',
        'confidence', 'tags', 'summary', 'traceability',
        'id', 'created_date', 'updated_date', 'created_by'
      ]
    },
    CompositeRiskFinding: {
      required: ['organization_id', 'case_id', 'schema_version', 'enrichment_run_id', 'finding_type', 'title', 'severity', 'risk_score', 'confidence', 'evidence_refs'],
      properties: [
        'organization_id', 'case_id', 'schema_version', 'prompt_version',
        'enrichment_run_id', 'finding_type', 'title', 'description',
        'severity', 'risk_score', 'confidence', 'confidence_explain',
        'rationale', 'recommended_actions', 'evidence_refs',
        'reviewed_status', 'analyst_notes',
        'id', 'created_date', 'updated_date', 'created_by'
      ]
    }
  };

  static validate(schemaId, payload) {
    const schema = this.schemas[schemaId];
    if (!schema) {
      throw new Error(`Unknown schema: ${schemaId}`);
    }

    const errors = [];

    // Check required fields
    for (const field of schema.required) {
      if (!(field in payload)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check for additional properties
    for (const key of Object.keys(payload)) {
      if (!schema.properties.includes(key)) {
        errors.push(`Additional property not allowed: ${key}`);
      }
    }

    // Validate specific constraints
    if (payload.confidence !== undefined && (payload.confidence < 0 || payload.confidence > 1)) {
      errors.push('confidence must be between 0 and 1');
    }

    if (payload.risk_score !== undefined && (payload.risk_score < 0 || payload.risk_score > 100)) {
      errors.push('risk_score must be between 0 and 100');
    }

    if (errors.length > 0) {
      throw new ValidationError(schemaId, errors);
    }

    return true;
  }

  static validateTraceability(traceability) {
    const errors = [];

    if (!traceability) {
      errors.push('traceability object required');
      throw new ValidationError('Traceability', errors);
    }

    if (!traceability.source_event_ids && !traceability.event_query_ref) {
      errors.push('Either source_event_ids or event_query_ref required');
    }

    if (traceability.source_event_ids && !Array.isArray(traceability.source_event_ids)) {
      errors.push('source_event_ids must be array');
    }

    if (traceability.fields_used && !Array.isArray(traceability.fields_used)) {
      errors.push('fields_used must be array');
    }

    if (errors.length > 0) {
      throw new ValidationError('Traceability', errors);
    }

    return true;
  }
}

export class ValidationError extends Error {
  constructor(schemaId, errors) {
    super(`Validation failed for ${schemaId}: ${errors.join(', ')}`);
    this.schemaId = schemaId;
    this.errors = errors;
  }
}

/**
 * Validate enrichment result with full traceability checks
 */
export function validateEnrichmentResult(result) {
  SchemaValidator.validate('EnrichmentResult', result);
  SchemaValidator.validateTraceability(result.traceability);
  return true;
}

/**
 * Validate composite risk finding
 */
export function validateCompositeRiskFinding(finding) {
  SchemaValidator.validate('CompositeRiskFinding', finding);
  SchemaValidator.validateTraceability(finding.evidence_refs);
  return true;
}