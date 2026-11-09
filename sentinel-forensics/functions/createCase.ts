import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { createErrorResponse, ErrorCodes, AppError } from './errorHandler.js';
import { validateRequest } from './validateInput.js';

/**
 * Create Case - BACKEND ONLY
 * Includes validation, rate limiting, and audit logging
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.organization_id) {
      throw new AppError('User missing organization_id', ErrorCodes.INVALID_INPUT.code, 400);
    }

    const payload = await req.json();

    // Rate limiting check
    const rateLimitResult = await checkRateLimit(base44, user.email, user.organization_id);
    if (!rateLimitResult.allowed) {
      throw new AppError(
        `Rate limit exceeded. Max ${rateLimitResult.limit} cases per ${rateLimitResult.window_minutes} minutes`,
        ErrorCodes.RATE_LIMIT_EXCEEDED.code,
        429,
        { retry_after: rateLimitResult.retry_after }
      );
    }

    // Validate case_number format
    const case_number = payload.case_number;
    if (!case_number || !/^[A-Z0-9-]{4,32}$/.test(case_number)) {
      throw new AppError(
        'Invalid case_number format. Must be 4-32 characters: A-Z, 0-9, dash only',
        ErrorCodes.INVALID_INPUT.code,
        400
      );
    }

    // Check uniqueness
    const existingCases = await base44.asServiceRole.entities.Case.filter({
      organization_id: user.organization_id,
      case_number: case_number
    });

    if (existingCases?.length > 0) {
      throw new AppError('Case number already exists', ErrorCodes.ALREADY_EXISTS.code, 409);
    }

    // Validate tags
    const tags = payload.tags || [];
    if (tags.length > 20) {
      throw new AppError('Maximum 20 tags allowed', ErrorCodes.INVALID_INPUT.code, 400);
    }

    const tagPattern = /^[a-zA-Z0-9_-]{1,30}$/;
    for (const tag of tags) {
      if (!tagPattern.test(tag)) {
        throw new AppError(`Invalid tag format: ${tag}`, ErrorCodes.INVALID_INPUT.code, 400);
      }
    }

    // Validate required fields
    if (!payload.title || payload.title.length < 3) {
      throw new AppError('Title must be at least 3 characters', ErrorCodes.INVALID_INPUT.code, 400);
    }

    if (!payload.case_type) {
      throw new AppError('case_type is required', ErrorCodes.MISSING_FIELD.code, 400);
    }

    // Build case data
    const timestamp = new Date().toISOString();

    const caseData = {
      organization_id: user.organization_id,
      case_number: case_number,
      title: payload.title,
      description: payload.description || '',
      case_type: payload.case_type,
      priority: payload.priority || 'medium',
      status: 'open',
      assigned_investigator: payload.assigned_investigator || user.email,
      team_members: payload.team_members || [],
      start_date: payload.start_date || new Date().toISOString().split('T')[0],
      tags: tags,
      findings_public: payload.findings_public || '',
      findings_sensitive: payload.findings_sensitive || '',
      privacy_level: payload.privacy_level || 'confidential',
      evidence_count: 0,
      last_modified_by: user.email,
      last_modified_at: timestamp,
      legal_hold: false
    };

    // Create case
    const newCase = await base44.asServiceRole.entities.Case.create(caseData);

    // Create audit log
    try {
      await base44.functions.invoke('createAuditLog', {
        event_type: 'case_created',
        severity: 'info',
        description: `Case created: ${newCase.title}`,
        resource_type: 'Case',
        resource_id: newCase.id,
        case_id: newCase.id,
        action_performed: 'create'
      });
    } catch (auditError) {
      console.warn('Audit log failed:', auditError);
    }

    return Response.json({ 
      success: true,
      case_id: newCase.id,
      case_number: newCase.case_number,
      message: 'Case created successfully'
    });

  } catch (error) {
    console.error('Case creation failed:', error);
    return createErrorResponse(error);
  }
});

async function checkRateLimit(base44, userEmail, organizationId) {
  const windowMinutes = 60;
  const userLimit = 10;
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  try {
    const userCases = await base44.asServiceRole.entities.Case.filter({
      created_by: userEmail,
      created_date: { $gte: windowStart }
    });

    if (userCases && userCases.length >= userLimit) {
      return {
        allowed: false,
        limit: userLimit,
        window_minutes: windowMinutes,
        retry_after: 60
      };
    }
  } catch (error) {
    console.warn('Rate limit check failed:', error);
  }

  return { allowed: true };
}