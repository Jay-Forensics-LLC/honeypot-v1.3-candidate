import { z } from 'zod';

/**
 * CENTRALIZED API SCHEMA VALIDATION
 * Zod schemas for all API requests/responses
 */

// ============= CASE SCHEMAS =============
export const CaseSchema = z.object({
  id: z.string().uuid().optional(),
  case_number: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  case_type: z.enum([
    'network_intrusion',
    'device_compromise',
    'data_breach',
    'malware_analysis',
    'surveillance_detection',
    'other'
  ]),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['open', 'active', 'under_review', 'closed', 'archived']),
  assigned_investigator: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  created_date: z.string().datetime().optional(),
  updated_date: z.string().datetime().optional(),
  organization_id: z.string().uuid().optional()
});

export const CreateCaseSchema = CaseSchema.omit({
  id: true,
  case_number: true,
  created_date: true,
  updated_date: true
});

export const UpdateCaseSchema = CaseSchema.partial().omit({
  id: true,
  case_number: true,
  created_date: true
});

// ============= EVIDENCE SCHEMAS =============
export const EvidenceSchema = z.object({
  id: z.string().uuid().optional(),
  case_id: z.string().uuid(),
  evidence_number: z.string().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  evidence_type: z.enum([
    'file',
    'network_capture',
    'device_log',
    'screenshot',
    'metadata',
    'forensic_image',
    'memory_dump',
    'other'
  ]),
  file_name: z.string().optional(),
  file_size: z.number().optional(),
  file_hash_sha256: z.string().optional(),
  file_url: z.string().url().optional(),
  collection_timestamp: z.string().datetime().optional(),
  is_verified: z.boolean().default(false),
  verification_status: z.enum(['pending', 'verified', 'failed', 'tampered']).optional(),
  threat_classification: z.enum(['clean', 'suspicious', 'malicious', 'unknown']).optional(),
  risk_score: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  chain_of_custody: z.array(z.any()).optional(),
  organization_id: z.string().uuid().optional()
});

export const CreateEvidenceSchema = EvidenceSchema.omit({
  id: true,
  evidence_number: true,
  created_date: true
});

// ============= ALERT SCHEMAS =============
export const AlertSchema = z.object({
  id: z.string().uuid().optional(),
  alert_type: z.enum([
    'network_anomaly',
    'device_tampering',
    'malware_detected',
    'surveillance_detected',
    'unauthorized_access',
    'data_exfiltration',
    'system_compromise'
  ]),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  title: z.string().min(1),
  description: z.string(),
  source: z.string(),
  detection_timestamp: z.string().datetime().optional(),
  status: z.enum(['new', 'investigating', 'confirmed', 'resolved', 'false_positive']),
  threat_score: z.number().min(0).max(100).optional(),
  recommended_actions: z.array(z.string()).optional(),
  affected_systems: z.array(z.string()).optional(),
  organization_id: z.string().uuid().optional()
});

// ============= AI ORCHESTRATION SCHEMAS =============
export const AITaskSchema = z.object({
  orgId: z.string().uuid().optional(),
  userId: z.string().email().optional(),
  taskType: z.enum([
    'forensic_report',
    'executive_summary',
    'legal_document',
    'threat_analysis',
    'ioc_scoring',
    'quick_summary',
    'timeline_analysis',
    'incident_response',
    'compliance_audit',
    'evidence_suggestion'
  ]),
  sensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
  costTier: z.enum(['free', 'professional', 'enterprise', 'forensic_suite']).optional(),
  latencyToleranceMs: z.number().min(1000).max(60000).default(10000),
  input: z.object({
    prompt: z.string().min(1),
    context: z.record(z.any()).optional(),
    rawDataRefs: z.array(z.string().uuid()).optional()
  }),
  response_json_schema: z.record(z.any()).optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional()
});

// ============= TRIAGE SCHEMAS =============
export const TriageRequestSchema = z.object({
  caseId: z.string().uuid()
});

export const TriageResponseSchema = z.object({
  success: z.boolean(),
  triage: z.object({
    priority: z.enum(['high', 'medium', 'low']),
    priority_justification: z.string(),
    threat_assessment: z.object({
      primary_threats: z.array(z.string()),
      attack_vectors: z.array(z.string()),
      potential_actors: z.array(z.string()),
      scope: z.string()
    }).optional(),
    investigation_path: z.object({
      immediate_actions: z.array(z.string()),
      evidence_to_collect: z.array(z.string()),
      systems_to_examine: z.array(z.string()),
      experts_needed: z.array(z.string())
    }).optional(),
    risk_factors: z.object({
      data_exposure: z.string(),
      legal_compliance: z.string(),
      operational_impact: z.string(),
      escalation_triggers: z.array(z.string())
    }).optional(),
    keywords: z.array(z.string()),
    confidence_score: z.number().min(0).max(1),
    recommended_investigator_type: z.string().optional()
  }),
  metadata: z.record(z.any()).optional()
});

// ============= AUDIT LOG SCHEMAS =============
export const AuditLogSchema = z.object({
  organization_id: z.string().uuid(),
  event_type: z.string(),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  description: z.string(),
  user_id: z.string().email(),
  timestamp: z.string().datetime(),
  success: z.boolean().default(true),
  resource_type: z.string().optional(),
  resource_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  evidence_id: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
  blockchain_hash: z.string().regex(/^[a-f0-9]{64}$/)
});

// ============= VALIDATION HELPERS =============
export function validateOrThrow(schema, data) {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formatted = error.errors.map(e => 
        `${e.path.join('.')}: ${e.message}`
      ).join(', ');
      throw new Error(`Validation failed: ${formatted}`);
    }
    throw error;
  }
}

export function validateSafe(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors,
      data: null
    };
  }
  return {
    valid: true,
    errors: [],
    data: result.data
  };
}