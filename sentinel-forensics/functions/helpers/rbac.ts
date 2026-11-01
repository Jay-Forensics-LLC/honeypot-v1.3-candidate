/**
 * Role-Based Access Control (RBAC) Helper
 * 
 * Centralizes permission logic to avoid scattered role checks.
 * Permissions use "resource:action" format for clarity.
 */

/**
 * Available permissions in the system
 * 
 * To extend:
 * 1. Add new permission string literal below
 * 2. Update getUserPermissions to grant it to appropriate roles
 * 3. Use hasPermission(user, 'resource:action') in endpoints
 */
export type Permission =
  | "device:isolate"
  | "device:action"
  | "evidence:upload"
  | "evidence:download"
  | "admin:settings";

/**
 * Get all permissions for a user based on their role
 * 
 * @param user - User object with role property
 * @returns Set of permissions the user has
 * 
 * Extension points:
 * - Add custom role types beyond 'admin'/'user'
 * - Add permission overrides from user.permissions_override field
 * - Add organization-level permission policies
 */
export function getUserPermissions(user: any): Set<Permission> {
  const permissions = new Set<Permission>();
  
  // Admin users get all permissions
  if (user.role === 'admin') {
    permissions.add('device:isolate');
    permissions.add('device:action');
    permissions.add('evidence:upload');
    permissions.add('evidence:download');
    permissions.add('admin:settings');
    return permissions;
  }
  
  // Regular users get limited permissions
  // Safe defaults: evidence operations only
  permissions.add('evidence:upload');
  permissions.add('evidence:download');
  
  // Future extension: Add custom role mappings here
  // Example:
  // if (user.role === 'investigator') {
  //   permissions.add('device:action');
  // }
  
  // Future extension: Add user-specific overrides
  // Example:
  // if (user.permissions_override) {
  //   user.permissions_override.forEach(p => permissions.add(p));
  // }
  
  return permissions;
}

/**
 * Check if user has a specific permission
 * 
 * @param user - User object
 * @param required - Permission to check
 * @returns true if user has the permission
 * 
 * Usage in endpoints:
 * ```ts
 * if (!hasPermission(user, 'device:isolate')) {
 *   return Response.json({ error: 'Forbidden' }, { status: 403 });
 * }
 * ```
 */
export function hasPermission(user: any, required: Permission): boolean {
  const userPermissions = getUserPermissions(user);
  return userPermissions.has(required);
}