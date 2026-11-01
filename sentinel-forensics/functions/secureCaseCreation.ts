import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { withRateLimit, applySecurityHeaders } from './securityMiddleware.js';

/**
 * SECURE CASE CREATION
 * Rate-limited, validated case creation endpoint
 */

Deno.serve(async (req) => {
  try {
    return await withRateLimit(req, async (base44, user) => {
      const payload = await req.json();
      
      // Input validation
      if (!payload.title || payload.title.length < 3) {
        return Response.json({ 
          error: 'Case title must be at least 3 characters' 
        }, { status: 400 });
      }
      
      if (payload.title.length > 200) {
        return Response.json({ 
          error: 'Case title too long (max 200 characters)' 
        }, { status: 400 });
      }
      
      // Sanitize input
      const sanitizedTitle = payload.title
        .replace(/<[^>]*>/g, '')
        .trim();
        
      const sanitizedDescription = payload.description
        ? payload.description.replace(/<script[^>]*>.*?<\/script>/gi, '').substring(0, 10000)
        : '';
      
      // Create case
      const caseData = await base44.entities.Case.create({
        organization_id: user.organization_id,
        title: sanitizedTitle,
        description: sanitizedDescription,
        status: payload.status || 'open',
        priority: payload.priority || 'medium',
        assigned_to: payload.assigned_to || user.email
      });
      
      // Log creation
      await base44.entities.AuditLog.create({
        organization_id: user.organization_id,
        user_email: user.email,
        action: 'case_created',
        resource_type: 'case',
        resource_id: caseData.id,
        severity: 'info',
        details: {
          title: sanitizedTitle,
          priority: caseData.priority
        }
      });
      
      const response = Response.json({ 
        success: true, 
        case: caseData 
      });
      
      return applySecurityHeaders(response);
      
    }, { limit: 30, windowMs: 60000 }); // 30 cases per minute
    
  } catch (error) {
    console.error('Case creation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});