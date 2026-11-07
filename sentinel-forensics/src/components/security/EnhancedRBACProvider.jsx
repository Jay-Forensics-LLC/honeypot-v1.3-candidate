import React, { createContext, useContext, useEffect } from 'react';
import { useUser } from '../hooks/useUser';
import { hasPermission, getRolePermissions, Roles, Permissions } from './RBACConfig';
import { logForensicEvent, ForensicEventTypes } from '../forensics/ForensicLogger';
import { base44 } from '@/api/base44Client';

const RBACContext = createContext(null);

/**
 * ENHANCED RBAC PROVIDER
 * Production-grade access control with logging
 */
export function EnhancedRBACProvider({ children }) {
  const { data: user, isLoading } = useUser();

  useEffect(() => {
    if (user?.role) {
      // Log role assignment on session start
      logForensicEvent(ForensicEventTypes.USER_LOGIN, {
        userId: user.email,
        role: user.role,
        permissions: getRolePermissions(user.role).length
      });
    }
  }, [user?.role]);

  const checkPermission = async (permission, logAccess = true) => {
    if (!user) return false;

    const allowed = hasPermission(user.role, permission);

    // Log access attempt
    if (logAccess) {
      try {
        await logForensicEvent(ForensicEventTypes.CONFIG_CHANGE, {
          type: 'permission_check',
          permission,
          role: user.role,
          allowed,
          userId: user.email
        });
      } catch (error) {
        console.error('Failed to log permission check:', error);
      }
    }

    return allowed;
  };

  const requirePermission = async (permission) => {
    const allowed = await checkPermission(permission);
    
    if (!allowed) {
      // Log unauthorized access attempt
      await logForensicEvent(ForensicEventTypes.SECURITY_BREACH, {
        type: 'unauthorized_access',
        permission,
        role: user?.role,
        userId: user?.email
      });
      
      throw new Error(`Unauthorized: Missing permission ${permission}`);
    }
    
    return true;
  };

  const hasAnyPermission = async (permissions) => {
    if (!user) return false;
    
    for (const permission of permissions) {
      if (await checkPermission(permission, false)) {
        return true;
      }
    }
    
    return false;
  };

  const hasAllPermissions = async (permissions) => {
    if (!user) return false;
    
    for (const permission of permissions) {
      if (!(await checkPermission(permission, false))) {
        return false;
      }
    }
    
    return true;
  };

  const value = {
    user,
    role: user?.role,
    permissions: user?.role ? getRolePermissions(user.role) : [],
    checkPermission,
    requirePermission,
    hasAnyPermission,
    hasAllPermissions,
    hasPermission: checkPermission, // Alias for compatibility
    isAdmin: user?.role === Roles.ADMIN,
    isAnalyst: user?.role === Roles.ANALYST,
    isAuditor: user?.role === Roles.AUDITOR,
    isViewer: user?.role === Roles.VIEWER
  };

  if (isLoading) {
    return null;
  }

  return (
    <RBACContext.Provider value={value}>
      {children}
    </RBACContext.Provider>
  );
}

export function useRBAC() {
  const context = useContext(RBACContext);
  if (!context) {
    // Return safe defaults instead of throwing during initialization
    console.warn('useRBAC used outside EnhancedRBACProvider, returning defaults');
    return {
      user: null,
      role: 'user',
      permissions: [],
      checkPermission: async () => false,
      requirePermission: async () => false,
      hasAnyPermission: async () => false,
      hasAllPermissions: async () => false,
      hasPermission: async () => false,
      isAdmin: false,
      isAnalyst: false,
      isAuditor: false,
      isViewer: false
    };
  }
  return context;
}

/**
 * Permission Gate Component
 */
export function PermissionGate({ permission, fallback = null, children }) {
  const { checkPermission } = useRBAC();
  const [allowed, setAllowed] = React.useState(false);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    checkPermission(permission).then(result => {
      setAllowed(result);
      setChecking(false);
    });
  }, [permission]);

  if (checking) return null;
  if (!allowed) return fallback;
  return <>{children}</>;
}

/**
 * Role Gate Component
 */
export function RoleGate({ roles, fallback = null, children }) {
  const { role } = useRBAC();
  
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  const allowed = role && allowedRoles.includes(role);
  
  if (!allowed) return fallback;
  return <>{children}</>;
}