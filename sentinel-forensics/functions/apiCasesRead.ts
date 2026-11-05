import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { verifyApiKeyAndAuthorize } from './verifyApiKeyAndAuthorize.js';

/**
 * API ENDPOINT: GET /api/v1/cases
 * Scope: cases:read
 */

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    // Verify API key and authorize
    const authResult = await verifyApiKeyAndAuthorize(req, 'cases:read');
    if (!authResult.authorized) {
      return Response.json({ 
        type: 'https://sentinel.forensics/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: authResult.error
      }, { status: 401 });
    }

    const { apiKey } = authResult;
    const base44 = createClientFromRequest(req);

    // Get cases for organization
    const cases = await base44.asServiceRole.entities.Case.filter({
      organization_id: apiKey.organization_id
    });

    return Response.json({
      cases: cases.map(c => ({
        id: c.id,
        case_number: c.case_number,
        title: c.title,
        status: c.status,
        severity: c.severity,
        created_date: c.created_date,
        updated_date: c.updated_date
      })),
      total: cases.length,
      api_version: 'v1'
    });

  } catch (error) {
    console.error('API cases read failed:', error);
    return Response.json({
      type: 'https://sentinel.forensics/errors/internal',
      title: 'Internal Server Error',
      status: 500,
      detail: error.message
    }, { status: 500 });
  }
});