/**
 * Authentication & Authorization Helpers
 * Centralized guards for Deno functions
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { errorJson } from './http.ts';
import { hasPermission, type Permission } from './rbac.ts';

/**
 * Creates Base44 client from request
 * @param req - Incoming HTTP request
 * @returns Initialized Base44 client
 */
export function getBase44Client(req: Request) {
  return createClientFromRequest(req);
}

/**
 * Requires authenticated user
 * @param req - Incoming HTTP request
 * @returns { base44, user } or throws 401 Response
 */
export async function requireUser(req: Request) {
  const base44 = getBase44Client(req);
  
  try {
    const user = await base44.auth.me();
    
    if (!user || !user.email) {
      throw new Error('Not authenticated');
    }
    
    return { base44, user };
  } catch {
    throw errorJson(401, 'Authentication required');
  }
}

/**
 * Requires admin role
 * @param user - User object from requireUser
 * @throws 403 Response if not admin
 */
export function requireAdmin(user: { role?: string; email?: string }) {
  if (user.role !== 'admin') {
    throw errorJson(403, 'Admin access required');
  }
}

/**
 * Requires organization context
 * @param user - User object from requireUser
 * @throws 403 Response if organization_id missing
 */
export function requireOrgContext(user: { organization_id?: string; email?: string }) {
  if (!user.organization_id) {
    throw errorJson(403, 'Organization context required');
  }
}

/**
 * Requires user to have a specific permission
 * @param user - User object
 * @param permission - Required permission
 * @throws 403 Response if permission not granted
 */
export function requirePermission(
  user: { role: string; email: string } | null,
  permission: Permission
): void {
  if (!user) {
    throw errorJson(403, 'Authentication required');
  }
  
  if (!hasPermission(user, permission)) {
    throw errorJson(403, 'Insufficient permissions');
  }
}