import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, AlertTriangle, Shield, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

/**
 * MOBILE-OPTIMIZED Real-Time Alert Monitor
 * Fixes mobile freeze issues with:
 * - Disabled on mobile by default
 * - Longer intervals on slow connections
 * - Graceful degradation
 */

export default function RealTimeAlertMonitor({ user }) {
  const [lastCheckTime, setLastCheckTime] = useState(new Date());
  const [shownAlertIds, setShownAlertIds] = useState(new Set());
  const queryClient = useQueryClient();

  // CRITICAL FIX: Detect mobile and disable aggressive polling
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isSlowConnection = navigator.connection?.effectiveType === '2g' || 
                          navigator.connection?.effectiveType === 'slow-2g';

  // MOBILE FIX: Disable polling on mobile to prevent freeze
  const pollingEnabled = !isMobile && !!user;
  const pollingInterval = isSlowConnection ? 30000 : 10000; // 30s on slow, 10s on fast

  // Poll for new alerts - DISABLED ON MOBILE
  const { data: recentAlerts = [] } = useQuery({
    queryKey: ['recent-alerts', user?.email],
    queryFn: async () => {
      try {
        const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        
        // 5 second timeout for mobile
        const data = await Promise.race([
          base44.entities.Alert.filter({
            detection_timestamp: { $gte: cutoff },
            status: 'new'
          }, '-detection_timestamp', 20),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);
        
        return data || [];
      } catch (error) {
        console.debug('Alert polling failed (non-critical):', error.message);
        return [];
      }
    },
    enabled: pollingEnabled, // CRITICAL: Disabled on mobile
    refetchInterval: pollingEnabled ? pollingInterval : false,
    staleTime: 5000,
    retry: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    useErrorBoundary: false
  });

  useEffect(() => {
    if (!recentAlerts || recentAlerts.length === 0) return;

    // Show toast for new alerts
    recentAlerts.forEach(alert => {
      if (!shownAlertIds.has(alert.id)) {
        showAlertToast(alert);
        setShownAlertIds(prev => new Set([...prev, alert.id]));
      }
    });
  }, [recentAlerts]);

  const showAlertToast = (alert) => {
    const severityConfig = {
      critical: { icon: AlertTriangle, className: 'bg-red-900 border-red-500 text-red-100' },
      high: { icon: Shield, className: 'bg-orange-900 border-orange-500 text-orange-100' },
      medium: { icon: Bell, className: 'bg-yellow-900 border-yellow-500 text-yellow-100' },
      low: { icon: Bell, className: 'bg-blue-900 border-blue-500 text-blue-100' }
    };

    const config = severityConfig[alert.severity] || severityConfig.low;
    const Icon = config.icon;

    toast.custom(
      (t) => (
        <div className={`${config.className} p-4 rounded-lg border-2 shadow-xl max-w-md`}>
          <div className="flex items-start gap-3">
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-bold">Security Alert</p>
                <Badge className="bg-black/20">
                  {alert.severity.toUpperCase()}
                </Badge>
              </div>
              <p className="font-semibold mb-1">{alert.title}</p>
              <p className="text-sm opacity-90 mb-3">{alert.description}</p>
              
              <div className="flex gap-2">
                <Link to={createPageUrl('Dashboard')}>
                  <Button
                    size="sm"
                    className="bg-white/20 hover:bg-white/30 text-white h-8"
                  >
                    View Details
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toast.dismiss(t)}
                  className="hover:bg-white/10 text-white h-8"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        duration: alert.severity === 'critical' ? 0 : 10000,
        position: 'top-right'
      }
    );
  };

  // Show banner on mobile indicating polling is disabled
  if (isMobile && user) {
    return (
      <div className="fixed bottom-4 left-4 right-4 bg-blue-900/95 border border-blue-500/50 rounded-lg p-3 text-xs text-blue-200 z-30" style={{
        bottom: 'max(1rem, env(safe-area-inset-bottom))'
      }}>
        <p className="font-semibold mb-1">ℹ️ Mobile Mode</p>
        <p className="opacity-90">Real-time alerts disabled to improve performance. Refresh Dashboard to check for new alerts.</p>
      </div>
    );
  }

  return null;
}