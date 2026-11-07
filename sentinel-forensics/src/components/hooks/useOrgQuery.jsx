import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from './useUser';

/**
 * ORGANIZATION-SCOPED QUERY HOOK
 * 
 * Automatically injects organization_id into all entity queries
 * to enforce multi-tenant isolation.
 * 
 * CRITICAL FIX: Uses useUser hook instead of calling base44.auth.me()
 * synchronously to prevent React suspension errors.
 */

export function useOrgQuery(
  entityName, 
  filters = {}, 
  sort = '-created_date', 
  limit = 100,
  options = {}
) {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ['org-query', entityName, filters, sort, limit, user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) {
        return [];
      }
      
      const orgScopedFilters = {
        ...filters,
        organization_id: user.organization_id
      };
      
      try {
        const results = await base44.entities[entityName].filter(
          orgScopedFilters,
          sort,
          limit
        );
        return results || [];
      } catch (error) {
        console.error(`Failed to query ${entityName}:`, error.message);
        throw error;
      }
    },
    enabled: !!user?.organization_id && (options.enabled !== undefined ? options.enabled : true),
    staleTime: options.staleTime || 60000,
    retry: options.retry !== undefined ? options.retry : 1,
    suspense: false,
    useErrorBoundary: false,
    ...options
  });
}

/**
 * Simpler list version with org scoping
 */
export function useOrgList(entityName, sort = '-created_date', limit = 100, options = {}) {
  return useOrgQuery(entityName, {}, sort, limit, options);
}