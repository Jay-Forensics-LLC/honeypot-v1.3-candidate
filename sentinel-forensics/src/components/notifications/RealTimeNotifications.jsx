import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Real-Time Notification System - MOBILE-OPTIMIZED
 * Monitors notifications and shows toast alerts
 * CRITICAL FIX: Disabled on mobile to prevent freeze
 */
export default function RealTimeNotifications({ user }) {
  // CRITICAL FIX: Detect mobile and disable polling
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  const { data: unreadNotifications = [] } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      if (!user) return [];
      
      try {
        const notifications = await base44.entities.Notification.filter({
          recipient_email: user.email,
          read: false
        }, '-created_date', 10);
        
        return notifications || [];
      } catch (error) {
        console.debug('Notifications unavailable');
        return [];
      }
    },
    enabled: !!user && !isMobile, // CRITICAL: Disabled on mobile
    refetchInterval: isMobile ? false : 30000, // No polling on mobile
    retry: 0,
    initialData: [],
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    useErrorBoundary: false
  });

  useEffect(() => {
    if (unreadNotifications.length > 0 && !isMobile) {
      // Show toast for new notifications (desktop only)
      unreadNotifications.forEach(notif => {
        const storageKey = `notif_shown_${notif.id}`;
        
        if (!sessionStorage.getItem(storageKey)) {
          toast.info(notif.title, {
            description: notif.message,
            action: notif.link_url ? {
              label: 'View',
              onClick: () => window.location.href = notif.link_url
            } : undefined
          });
          
          sessionStorage.setItem(storageKey, 'true');
        }
      });
    }
  }, [unreadNotifications, isMobile]);

  return null; // No UI, just background notifications
}