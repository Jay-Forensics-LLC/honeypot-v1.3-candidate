import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Lock, AlertTriangle } from 'lucide-react';
import { useRBAC } from './EnhancedRBACProvider';

/**
 * RBAC GUARD COMPONENT
 * Blocks access to components without required permissions
 */
export function RBACGuard({ permission, permissions, requireAll = false, children, fallback }) {
  const rbac = useRBAC();
  const [allowed, setAllowed] = React.useState(false);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    const check = async () => {
      try {
        let result;
        
        if (permissions) {
          result = requireAll
            ? await rbac.hasAllPermissions(permissions)
            : await rbac.hasAnyPermission(permissions);
        } else if (permission) {
          result = await rbac.checkPermission(permission);
        } else {
          result = true;
        }
        
        setAllowed(result);
      } catch (error) {
        setAllowed(false);
      } finally {
        setChecking(false);
      }
    };

    check();
  }, [permission, permissions, requireAll]);

  if (checking) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-400">Checking permissions...</div>
      </div>
    );
  }

  if (!allowed) {
    if (fallback) {
      return fallback;
    }

    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
        <Card className="bg-red-950/20 border-red-500/50 max-w-md">
          <CardContent className="p-8 text-center">
            <Lock className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
            <p className="text-red-200 mb-4">
              You don't have permission to access this resource.
            </p>
            <p className="text-sm text-red-300 mb-4">
              Required: {permission || permissions?.join(', ')}
            </p>
            <Button
              onClick={() => window.history.back()}
              variant="outline"
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
            >
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Inline Permission Check
 */
export function IfHasPermission({ permission, children, fallback = null }) {
  const rbac = useRBAC();
  const [allowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    rbac.checkPermission(permission, false).then(setAllowed);
  }, [permission]);

  return allowed ? <>{children}</> : fallback;
}

/**
 * Role-based rendering
 */
export function IfHasRole({ role, roles, children, fallback = null }) {
  const rbac = useRBAC();
  
  const allowedRoles = roles || [role];
  const allowed = allowedRoles.includes(rbac.role);
  
  return allowed ? <>{children}</> : fallback;
}

/**
 * Admin-only guard
 */
export function AdminOnly({ children, fallback }) {
  const rbac = useRBAC();
  
  if (!rbac.isAdmin) {
    return fallback || (
      <Card className="bg-yellow-950/20 border-yellow-500/30">
        <CardContent className="p-6 text-center">
          <Shield className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
          <p className="text-yellow-200">Administrator access required</p>
        </CardContent>
      </Card>
    );
  }
  
  return <>{children}</>;
}