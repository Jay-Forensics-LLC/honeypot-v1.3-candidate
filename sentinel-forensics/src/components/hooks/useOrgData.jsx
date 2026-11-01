import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from './useUser';

/**
 * PRODUCTION: Centralized organization data hooks
 * Standardized query keys and caching strategy
 */

export function useOrgCases() {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ['org-data', 'cases', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Case.filter(
        { organization_id: user.organization_id },
        '-created_date',
        500
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 2 * 60 * 1000,
    retry: 1
  });
}

export function useOrgEvidence() {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ['org-data', 'evidence', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.EvidenceV2.filter(
        { organization_id: user.organization_id },
        '-collection_timestamp',
        500
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 60 * 1000,
    retry: 1
  });
}

export function useOrgAlerts() {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ['org-data', 'alerts', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Alert.filter(
        { organization_id: user.organization_id },
        '-detection_timestamp',
        200
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 30 * 1000,
    retry: 1,
    refetchInterval: 60 * 1000 // Auto-refresh alerts every minute
  });
}

export function useOrgDevices() {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ['org-data', 'devices', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Device.filter(
        { organization_id: user.organization_id },
        '-last_seen_at',
        200
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 2 * 60 * 1000,
    retry: 1
  });
}

export function useOrgAssets() {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ['org-data', 'assets', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Asset.filter(
        { organization_id: user.organization_id },
        '-created_date',
        500
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });
}

export function useOrgReports() {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ['org-data', 'reports', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Report.filter(
        { organization_id: user.organization_id },
        '-generated_date',
        100
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });
}