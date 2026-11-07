/**
 * RBAC CONFIGURATION
 * Role definitions with granular permissions
 */

export const Roles = {
  ADMIN: 'admin',
  ANALYST: 'analyst',
  AUDITOR: 'auditor',
  VIEWER: 'viewer'
};

export const Permissions = {
  // Case permissions
  CASE_CREATE: 'case:create',
  CASE_READ: 'case:read',
  CASE_UPDATE: 'case:update',
  CASE_DELETE: 'case:delete',
  CASE_ASSIGN: 'case:assign',
  
  // Evidence permissions
  EVIDENCE_CREATE: 'evidence:create',
  EVIDENCE_READ: 'evidence:read',
  EVIDENCE_UPDATE: 'evidence:update',
  EVIDENCE_DELETE: 'evidence:delete',
  EVIDENCE_DOWNLOAD: 'evidence:download',
  EVIDENCE_ANALYZE: 'evidence:analyze',
  
  // Threat intelligence permissions
  THREAT_CREATE: 'threat:create',
  THREAT_READ: 'threat:read',
  THREAT_UPDATE: 'threat:update',
  THREAT_DELETE: 'threat:delete',
  THREAT_ENRICH: 'threat:enrich',
  
  // Alert permissions
  ALERT_CREATE: 'alert:create',
  ALERT_READ: 'alert:read',
  ALERT_UPDATE: 'alert:update',
  ALERT_DELETE: 'alert:delete',
  ALERT_ACKNOWLEDGE: 'alert:acknowledge',
  
  // Device permissions
  DEVICE_READ: 'device:read',
  DEVICE_UPDATE: 'device:update',
  DEVICE_DELETE: 'device:delete',
  DEVICE_SCAN: 'device:scan',
  
  // Admin permissions
  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',
  SETTINGS_MANAGE: 'settings:manage',
  AUDIT_VIEW: 'audit:view',
  SYSTEM_CONFIGURE: 'system:configure',
  
  // Audit permissions
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',
  COMPLIANCE_VIEW: 'compliance:view',
  
  // Report permissions
  REPORT_CREATE: 'report:create',
  REPORT_READ: 'report:read',
  REPORT_EXPORT: 'report:export',
  REPORT_APPROVE: 'report:approve'
};

// Role-Permission mappings
export const RolePermissions = {
  [Roles.ADMIN]: [
    // Full access to everything
    ...Object.values(Permissions)
  ],
  
  [Roles.ANALYST]: [
    // Cases
    Permissions.CASE_CREATE,
    Permissions.CASE_READ,
    Permissions.CASE_UPDATE,
    Permissions.CASE_ASSIGN,
    
    // Evidence
    Permissions.EVIDENCE_CREATE,
    Permissions.EVIDENCE_READ,
    Permissions.EVIDENCE_UPDATE,
    Permissions.EVIDENCE_DOWNLOAD,
    Permissions.EVIDENCE_ANALYZE,
    
    // Threats
    Permissions.THREAT_CREATE,
    Permissions.THREAT_READ,
    Permissions.THREAT_UPDATE,
    Permissions.THREAT_ENRICH,
    
    // Alerts
    Permissions.ALERT_CREATE,
    Permissions.ALERT_READ,
    Permissions.ALERT_UPDATE,
    Permissions.ALERT_ACKNOWLEDGE,
    
    // Devices
    Permissions.DEVICE_READ,
    Permissions.DEVICE_UPDATE,
    Permissions.DEVICE_SCAN,
    
    // Reports
    Permissions.REPORT_CREATE,
    Permissions.REPORT_READ,
    Permissions.REPORT_EXPORT
  ],
  
  [Roles.AUDITOR]: [
    // Read-only access for auditing
    Permissions.CASE_READ,
    Permissions.EVIDENCE_READ,
    Permissions.THREAT_READ,
    Permissions.ALERT_READ,
    Permissions.DEVICE_READ,
    Permissions.AUDIT_READ,
    Permissions.AUDIT_EXPORT,
    Permissions.COMPLIANCE_VIEW,
    Permissions.REPORT_READ,
    Permissions.REPORT_EXPORT
  ],
  
  [Roles.VIEWER]: [
    // Minimal read-only access
    Permissions.CASE_READ,
    Permissions.EVIDENCE_READ,
    Permissions.ALERT_READ,
    Permissions.DEVICE_READ,
    Permissions.REPORT_READ
  ]
};

/**
 * Check if role has permission
 */
export function hasPermission(role, permission) {
  const permissions = RolePermissions[role] || [];
  return permissions.includes(permission);
}

/**
 * Get all permissions for role
 */
export function getRolePermissions(role) {
  return RolePermissions[role] || [];
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role) {
  const names = {
    [Roles.ADMIN]: 'Administrator',
    [Roles.ANALYST]: 'Security Analyst',
    [Roles.AUDITOR]: 'Compliance Auditor',
    [Roles.VIEWER]: 'Viewer'
  };
  return names[role] || role;
}

/**
 * Get role description
 */
export function getRoleDescription(role) {
  const descriptions = {
    [Roles.ADMIN]: 'Full system access with configuration and user management',
    [Roles.ANALYST]: 'Create and manage cases, evidence, and threat intelligence',
    [Roles.AUDITOR]: 'Read-only access to all data with audit and compliance tools',
    [Roles.VIEWER]: 'Limited read-only access to cases and evidence'
  };
  return descriptions[role] || '';
}