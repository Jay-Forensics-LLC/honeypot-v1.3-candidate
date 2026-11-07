

/**
 * SECURITY-HARDENED Real-Time Alert System
 * Only shows real, verified threats - filters out test data
 * CRITICAL: Disabled to prevent network errors during app load
 */
export default function RealTimeAlertSystem({ user }) {
  // TEMPORARY FIX: Disable alert system to prevent network errors
  return null;
  
  /* DISABLED CODE - RE-ENABLE AFTER NETWORK STABILITY IMPROVED
  const [isVisible, setIsVisible] = useState(false);
  const [emailNotificationsSent, setEmailNotificationsSent] = useState(new Set());
  
  const isAdmin = user?.role === 'admin';
  
  const { data: criticalAlerts = [] } = useQuery({
    queryKey: ['critical-alerts-realtime'],
    queryFn: async () => {
      // Only load for admin users
      if (!user || user.role !== 'admin') {
        return [];
      }
      
      try {
        // 5 second timeout
        const data = await Promise.race([
          base44.entities.Alert.filter({ 
            status: 'new',
            severity: { $in: ['critical', 'high'] }
          }, '-detection_timestamp', 5), // Limit to 5 alerts for the API call, then slice further
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);
        
        // Filter out test/demo alerts
        const realAlerts = (data || []).filter(alert => {
          // Exclude alerts from threat hunting playbooks (often contain test data)
          if (alert.source?.includes('Threat Hunt:')) {
            return false;
          }
          // Exclude alerts with test/demo markers
          if (alert.description?.includes('TEST-') || 
              alert.description?.includes('DEMO-') ||
              alert.description?.includes('malware-c2-') ||
              alert.title?.includes('[TEST]')) {
            return false;
          }
          return true;
        });
        
        return realAlerts.slice(0, 3); // Display top 3 real alerts
      } catch (error) {
        console.debug('Critical alerts unavailable (non-critical)');
        return [];
      }
    },
    enabled: isAdmin,
    retry: 0,
    refetchInterval: 60000,
    staleTime: 30000,
    initialData: [],
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (criticalAlerts.length > 0 && isAdmin) {
      setIsVisible(true);
      
      // Send email notifications for new critical alerts
      criticalAlerts.forEach(async (alert) => {
        if (!emailNotificationsSent.has(alert.id)) {
          try {
            // SECURITY: Verify this is a real threat before sending email
            const alertDetails = alert.description || '';
            const isRealThreat = 
              !alertDetails.includes('TEST-') && 
              !alertDetails.includes('DEMO-') &&
              !alertDetails.includes('malware-c2-') &&
              !alert.title?.includes('[TEST]'); // Also check title for [TEST]

            if (isRealThreat) {
              await base44.integrations.Core.SendEmail({
                to: user.email,
                subject: `🚨 CRITICAL ALERT: ${alert.title}`,
                body: `Severity: ${alert.severity}\n\nDescription: ${alert.description}\n\nView in Sentinel: ${window.location.origin}${createPageUrl('Dashboard')}`
              });
            }
            
            setEmailNotificationsSent(prev => new Set([...prev, alert.id]));
            
            // Browser notification (if permitted) - only for real threats
            if (isRealThreat && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('🚨 Critical Security Alert', {
                body: alert.title,
                icon: '/favicon.ico',
                tag: alert.id,
                requireInteraction: true
              });
            }
          } catch (error) {
            console.warn('Failed to send alert notification:', error);
          }
        }
      });
      
      const timer = setTimeout(() => setIsVisible(false), 15000);
      return () => clearTimeout(timer);
    }
  }, [criticalAlerts, isAdmin, user, emailNotificationsSent]);

  // Request notification permission on mount (admin only)
  useEffect(() => {
    if (isAdmin && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isAdmin]);

  if (!isAdmin || criticalAlerts.length === 0 || !isVisible) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-4 right-4 z-50 max-w-md"
        style={{
          top: 'max(1rem, env(safe-area-inset-top))',
          right: 'max(1rem, env(safe-area-inset-right))'
        }}
      >
        <Card className="bg-red-900/95 border-red-500 shadow-2xl backdrop-blur-sm">
          <div className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-red-300 animate-pulse" />
                <h3 className="font-bold text-white">Critical Alerts</h3>
                <Bell className="w-4 h-4 text-red-300" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsVisible(false)}
                className="h-6 w-6 text-red-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-2">
              {criticalAlerts.map(alert => (
                <div key={alert.id} className="bg-black/30 rounded p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-red-200">{alert.title}</p>
                    <Badge className="bg-red-500 text-white text-xs">
                      {alert.severity?.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-red-300/80 mb-2">{alert.description}</p>
                  <Button
                    onClick={() => window.location.href = createPageUrl('Dashboard')}
                    size="sm"
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                  >
                    <ExternalLink className="w-3 h-3 mr-2" />
                    View Details
                  </Button>
                </div>
              ))}
            </div>
            
            <p className="text-xs text-red-200 mt-3 text-center">
              📧 Notification sent
            </p>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
  */
}
