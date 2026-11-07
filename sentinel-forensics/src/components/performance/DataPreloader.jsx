import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetch } from '../lib/APIClient';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { logger } from '../utils/logger';

/**
 * DATA PRELOADER
 * Prefetches critical data on app mount
 */
export function DataPreloader() {
  const queryClient = useQueryClient();
  const { data: user } = useUser();

  useEffect(() => {
    if (!user?.organization_id) return;

    const preloadData = async () => {
      logger.info('Starting data preload');

      try {
        // Prefetch cases (most accessed)
        await prefetch(
          ['cases', user.organization_id],
          () => base44.entities.Case.filter(
            { organization_id: user.organization_id },
            '-created_date',
            50
          ),
          600000 // 10 min cache
        );

        // Prefetch evidence
        await prefetch(
          ['evidence', user.organization_id],
          () => base44.entities.EvidenceV2.filter(
            { organization_id: user.organization_id },
            '-created_date',
            100
          ),
          600000
        );

        // Prefetch alerts
        await prefetch(
          ['alerts', user.organization_id],
          () => base44.entities.Alert.filter(
            { organization_id: user.organization_id },
            '-detection_timestamp',
            50
          ),
          300000 // 5 min cache
        );

        logger.info('Data preload completed');
      } catch (error) {
        logger.error('Data preload failed', { error });
      }
    };

    // Delay preload to not block initial render
    const timeout = setTimeout(preloadData, 1000);
    return () => clearTimeout(timeout);
  }, [user?.organization_id]);

  return null; // No UI
}