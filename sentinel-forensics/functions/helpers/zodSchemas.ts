/**
 * Zod Validation Schemas
 * Centralized input validation for all endpoints
 */

import { z } from 'npm:zod@3.24.1';

// Authentication schemas
export const LoginSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  mfa_code: z.string().length(6, 'MFA code must be 6 digits').optional()
});

export const MFACodeSchema = z.object({
  phone_number: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid E.164 phone number format'),
  code: z.string().length(6, 'Code must be 6 digits')
});

// Case management schemas
export const CreateCaseSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  case_type: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional()
});

export const UpdateCaseSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'investigating', 'closed', 'archived']).optional(),
  tags: z.array(z.string().max(50)).max(20).optional()
});

// Device action schemas
export const DeviceActionSchema = z.object({
  device_id: z.string().uuid('Invalid device ID'),
  action: z.enum(['isolate', 'scan', 'collect_logs', 'restart', 'wipe']),
  parameters: z.record(z.unknown()).optional(),
  reason: z.string().max(500).optional()
});

// Evidence schemas
export const CreateEvidenceSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  case_id: z.string().uuid('Invalid case ID').optional(),
  evidence_type: z.string().max(100),
  file_hash_sha256: z.string().length(64, 'Invalid SHA-256 hash').optional(),
  tags: z.array(z.string().max(50)).max(20).optional()
});

// User management schemas
export const InviteUserSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  role: z.enum(['admin', 'analyst', 'viewer']),
  message: z.string().max(500).optional()
});

export const UpdateUserRoleSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  role: z.enum(['admin', 'analyst', 'viewer'])
});

// Policy schemas
export const CreatePolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  policy_type: z.enum(['endpoint_security', 'mobile_device', 'network_security', 'custom']),
  payload: z.record(z.unknown()),
  target_devices: z.array(z.string().uuid()).optional()
});

// Finding schemas
export const UpdateFindingSchema = z.object({
  finding_id: z.string().uuid('Invalid finding ID'),
  status: z.enum(['open', 'investigating', 'mitigated', 'false_positive', 'accepted_risk']),
  assigned_to: z.string().email().optional(),
  mitigation_notes: z.string().max(10000).optional()
});

// Generic pagination schema
export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0)
});

// Helper to validate and parse
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return {
      success: false,
      errors: ['Validation failed']
    };
  }
}