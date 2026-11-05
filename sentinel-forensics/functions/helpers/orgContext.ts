/**
 * ORGANIZATION CONTEXT HELPER
 * 
 * Enforces multi-tenant isolation by validating organization context.
 * Use in all backend functions to prevent cross-tenant data leakage.
 */

export function requireOrgContext(user) {
  if (!user) {
    throw new Error('User authentication required');
  }

  if (!user.organization_id) {
    throw new Error('User must be assigned to an organization');
  }

  return user.organization_id;
}

export function createOrgFilter(user, additionalFilters = {}) {
  const orgId = requireOrgContext(user);
  
  return {
    organization_id: orgId,
    ...additionalFilters
  };
}

export function validateOrgAccess(user, resource) {
  const orgId = requireOrgContext(user);
  
  if (resource.organization_id !== orgId) {
    throw new Error('Access denied: Resource belongs to different organization');
  }
  
  return true;
}