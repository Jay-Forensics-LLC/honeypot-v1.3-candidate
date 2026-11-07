
import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const RBACContext = createContext(null);

const TIER_HIERARCHY = {
  free: 0,
  plus: 1,
  pro: 2
};

const FEATURE_PERMISSIONS = {
  // Free tier features
  'dashboard': { minTier: 'free', adminOnly: false },
  'cases': { minTier: 'free', adminOnly: false },
  'evidence': { minTier: 'free', adminOnly: false },
  'basic_reports': { minTier: 'free', adminOnly: false },
  
  // Plus tier features
  'threat_intelligence': { minTier: 'plus', adminOnly: false },
  'threat_hunting': { minTier: 'plus', adminOnly: false },
  'pegasus_defense': { minTier: 'plus', adminOnly: false },
  'ioc_extraction': { minTier: 'plus', adminOnly: false },
  'automated_scanning': { minTier: 'plus', adminOnly: false },
  
  // Pro tier features (formerly enterprise)
  'covert_operations': { minTier: 'pro', adminOnly: false },
  'honeypots': { minTier: 'pro', adminOnly: false },
  'correlation_engine': { minTier: 'pro', adminOnly: false },
  'advanced_analytics': { minTier: 'pro', adminOnly: false },
  'api_access': { minTier: 'pro', adminOnly: false },
  'zero_day_protection': { minTier: 'pro', adminOnly: false },
  'autonomous_response': { minTier: 'pro', adminOnly: false },
  'blockchain_evidence': { minTier: 'pro', adminOnly: false },
  
  // Admin-only features
  'audit_log': { minTier: 'free', adminOnly: true },
  'user_management': { minTier: 'free', adminOnly: true },
  'api_keys': { minTier: 'free', adminOnly: true },
  'system_settings': { minTier: 'free', adminOnly: true },
  'integration_management': { minTier: 'free', adminOnly: true }
};

export function RBACProvider({ children }) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    staleTime: 60000,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const rbac = useMemo(() => {
    if (!user) {
      return {
        user: null,
        isLoading,
        isAdmin: false,
        tier: 'free',
        tierLevel: 0,
        canAccess: () => false,
        canAccessFeature: () => false,
        requiresUpgrade: () => true,
        hasPermission: () => false,
        getMissingFeatures: () => []
      };
    }

    const tier = user.subscription_tier || 'free';
    const tierLevel = TIER_HIERARCHY[tier] || 0;
    const isAdmin = user.role === 'admin';

    return {
      user,
      isLoading,
      isAdmin,
      tier,
      tierLevel,

      // Check if user can access a specific tier
      canAccess: (requiredTier) => {
        const requiredLevel = TIER_HIERARCHY[requiredTier] || 0;
        return isAdmin || tierLevel >= requiredLevel;
      },

      // Check if user can access a specific feature
      canAccessFeature: (featureName) => {
        const permission = FEATURE_PERMISSIONS[featureName];
        if (!permission) return true; // Allow access if feature not in permissions list

        // Admin-only check
        if (permission.adminOnly && !isAdmin) {
          return false;
        }

        // Tier check
        const requiredLevel = TIER_HIERARCHY[permission.minTier] || 0;
        return isAdmin || tierLevel >= requiredLevel;
      },

      // Check if feature requires upgrade
      requiresUpgrade: (featureName) => {
        if (isAdmin) return false;
        
        const permission = FEATURE_PERMISSIONS[featureName];
        if (!permission) return false;

        const requiredLevel = TIER_HIERARCHY[permission.minTier] || 0;
        return tierLevel < requiredLevel;
      },

      // Generic permission check
      hasPermission: (action, resource) => {
        // Admin has all permissions
        if (isAdmin) return true;

        // Define permission matrix
        const permissions = {
          'view': ['cases', 'evidence', 'reports', 'dashboard', 'threat_intelligence'],
          'create': ['cases', 'evidence', 'threat_intelligence'],
          'edit': ['cases', 'evidence', 'threat_intelligence'],
          'delete': tierLevel >= TIER_HIERARCHY.plus ? 
            ['cases', 'evidence', 'threat_intelligence'] : [],
          'export': tierLevel >= TIER_HIERARCHY.plus ? 
            ['reports', 'evidence', 'threat_intelligence'] : []
        };

        return permissions[action]?.includes(resource) || false;
      },

      // Get missing features for current tier
      getMissingFeatures: () => {
        if (isAdmin) return [];
        
        const missing = [];
        Object.entries(FEATURE_PERMISSIONS).forEach(([feature, permission]) => {
          const requiredLevel = TIER_HIERARCHY[permission.minTier] || 0;
          if (tierLevel < requiredLevel && !permission.adminOnly) {
            missing.push({
              feature,
              requiredTier: permission.minTier
            });
          }
        });
        return missing;
      }
    };
  }, [user, isLoading]);

  return (
    <RBACContext.Provider value={rbac}>
      {children}
    </RBACContext.Provider>
  );
}

export function useRBAC() {
  const context = useContext(RBACContext);
  if (!context) {
    throw new Error('useRBAC must be used within RBACProvider');
  }
  return context;
}

// HOC for protected routes
export function withRBAC(Component, options = {}) {
  return function ProtectedComponent(props) {
    const rbac = useRBAC();
    const { requiredTier, requiredFeature, adminOnly } = options;

    if (rbac.isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      );
    }

    // Admin-only check
    if (adminOnly && !rbac.isAdmin) {
      return (
        <div className="p-6">
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-8 text-center">
            <h2 className="text-xl font-bold text-red-300 mb-2">Access Denied</h2>
            <p className="text-red-200">This feature is only accessible to administrators.</p>
          </div>
        </div>
      );
    }

    // Tier check
    if (requiredTier && !rbac.canAccess(requiredTier)) {
      return (
        <div className="p-6">
          <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-8 text-center">
            <h2 className="text-xl font-bold text-orange-300 mb-2">Upgrade Required</h2>
            <p className="text-orange-200 mb-4">
              This feature requires a {requiredTier} subscription or higher.
            </p>
            <p className="text-sm text-orange-300">
              Current tier: {rbac.tier}
            </p>
          </div>
        </div>
      );
    }

    // Feature check
    if (requiredFeature && !rbac.canAccessFeature(requiredFeature)) {
      return (
        <div className="p-6">
          <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-8 text-center">
            <h2 className="text-xl font-bold text-orange-300 mb-2">Feature Locked</h2>
            <p className="text-orange-200">
              You don't have access to this feature.
            </p>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
