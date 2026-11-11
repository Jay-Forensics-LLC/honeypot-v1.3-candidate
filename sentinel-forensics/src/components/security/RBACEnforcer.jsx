import { useRBAC } from './RBACProvider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '../utils';

/**
 * RBAC Enforcer - Stricter access control wrapper
 * Prevents unauthorized access to protected features
 */
export function RBACEnforcer({ 
  children, 
  requiredTier, 
  requiredFeature, 
  adminOnly,
  fallbackMessage 
}) {
  const rbac = useRBAC();

  if (rbac.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-slate-900/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  // Admin-only check
  if (adminOnly && !rbac.isAdmin) {
    return (
      <div className="p-6">
        <Alert className="bg-red-900/20 border-red-500/30">
          <Lock className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-300">
            <strong>Access Denied</strong>
            <p className="mt-2 text-sm text-red-200">
              {fallbackMessage || 'This feature is only accessible to administrators.'}
            </p>
            <p className="mt-2 text-xs text-red-400">
              Current role: {rbac.user?.role || 'viewer'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.history.back()}
              className="mt-4 border-red-500/50 text-red-300 hover:bg-red-500/10"
            >
              Go Back
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Tier check
  if (requiredTier && !rbac.canAccess(requiredTier)) {
    return (
      <div className="p-6">
        <Alert className="bg-orange-900/20 border-orange-500/30">
          <Shield className="h-4 w-4 text-orange-400" />
          <AlertDescription className="text-orange-300">
            <strong>Upgrade Required</strong>
            <p className="mt-2 text-sm text-orange-200">
              {fallbackMessage || `This feature requires a ${requiredTier} subscription or higher.`}
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs">
              <span className="text-orange-400">Current tier: <strong>{rbac.tier}</strong></span>
              <span className="text-orange-400">Required: <strong>{requiredTier}</strong></span>
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = createPageUrl('Subscription')}
                className="border-orange-500/50 text-orange-300 hover:bg-orange-500/10"
              >
                View Plans
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.history.back()}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Go Back
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Feature check
  if (requiredFeature && !rbac.canAccessFeature(requiredFeature)) {
    return (
      <div className="p-6">
        <Alert className="bg-orange-900/20 border-orange-500/30">
          <Lock className="h-4 w-4 text-orange-400" />
          <AlertDescription className="text-orange-300">
            <strong>Feature Locked</strong>
            <p className="mt-2 text-sm text-orange-200">
              {fallbackMessage || 'You don\'t have access to this feature.'}
            </p>
            <p className="mt-2 text-xs text-orange-400">
              This feature is available in higher subscription tiers.
            </p>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = createPageUrl('Subscription')}
                className="border-orange-500/50 text-orange-300 hover:bg-orange-500/10"
              >
                Upgrade
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.history.back()}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Go Back
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}

export default RBACEnforcer;