import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Generic hook for entity list with pagination and filtering
 * @param {string} entityName - Name of the entity
 * @param {Object} options - Query options
 * @returns {Object} Query result
 */
export function useEntityList(entityName, options = {}) {
  const {
    filter = {},
    orderBy = '-created_date',
    limit = 20,
    offset = 0,
    enabled = true
  } = options;

  return useQuery({
    queryKey: [entityName, 'list', filter, orderBy, limit, offset],
    queryFn: () => base44.entities[entityName].filter(filter, orderBy, limit, offset),
    staleTime: 30000,
    cacheTime: 300000,
    keepPreviousData: true,
    enabled,
    onError: (error) => {
      console.error(`Error fetching ${entityName}:`, error);
      toast.error(`Failed to load ${entityName}`, {
        description: error.message
      });
    }
  });
}

/**
 * Generic hook for creating entity records
 * @param {string} entityName - Name of the entity
 * @param {Object} options - Mutation options
 * @returns {Object} Mutation result
 */
export function useCreateEntity(entityName, options = {}) {
  const queryClient = useQueryClient();
  const { onSuccess, onError, invalidateQueries = true } = options;

  return useMutation({
    mutationFn: (data) => base44.entities[entityName].create(data),
    onSuccess: (data) => {
      if (invalidateQueries) {
        queryClient.invalidateQueries({ queryKey: [entityName] });
      }
      toast.success(`${entityName} created successfully`);
      onSuccess?.(data);
    },
    onError: (error) => {
      console.error(`Error creating ${entityName}:`, error);
      toast.error(`Failed to create ${entityName}`, {
        description: error.message
      });
      onError?.(error);
    }
  });
}

/**
 * Generic hook for updating entity records
 * @param {string} entityName - Name of the entity
 * @param {Object} options - Mutation options
 * @returns {Object} Mutation result
 */
export function useUpdateEntity(entityName, options = {}) {
  const queryClient = useQueryClient();
  const { onSuccess, onError, invalidateQueries = true } = options;

  return useMutation({
    mutationFn: ({ id, data }) => base44.entities[entityName].update(id, data),
    onSuccess: (data) => {
      if (invalidateQueries) {
        queryClient.invalidateQueries({ queryKey: [entityName] });
      }
      toast.success(`${entityName} updated successfully`);
      onSuccess?.(data);
    },
    onError: (error) => {
      console.error(`Error updating ${entityName}:`, error);
      toast.error(`Failed to update ${entityName}`, {
        description: error.message
      });
      onError?.(error);
    }
  });
}

/**
 * Generic hook for deleting entity records
 * @param {string} entityName - Name of the entity
 * @param {Object} options - Mutation options
 * @returns {Object} Mutation result
 */
export function useDeleteEntity(entityName, options = {}) {
  const queryClient = useQueryClient();
  const { onSuccess, onError, invalidateQueries = true } = options;

  return useMutation({
    mutationFn: (id) => base44.entities[entityName].delete(id),
    onSuccess: () => {
      if (invalidateQueries) {
        queryClient.invalidateQueries({ queryKey: [entityName] });
      }
      toast.success(`${entityName} deleted successfully`);
      onSuccess?.();
    },
    onError: (error) => {
      console.error(`Error deleting ${entityName}:`, error);
      toast.error(`Failed to delete ${entityName}`, {
        description: error.message
      });
      onError?.(error);
    }
  });
}