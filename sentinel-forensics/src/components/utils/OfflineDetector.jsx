import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Offline Detector - Shows banner when internet connection is lost
 * Queues operations and retries when connection is restored
 */
export default function OfflineDetector() {
  const [isOnline, setIsOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setTimeout(() => setShowBanner(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);
    setShowBanner(!navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] p-4"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))'
          }}
        >
          <Alert className={isOnline ? 'bg-green-900/90 border-green-500/50' : 'bg-red-900/90 border-red-500/50'}>
            <div className="flex items-center gap-3">
              {isOnline ? (
                <Wifi className="w-5 h-5 text-green-300" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-300" />
              )}
              <AlertDescription className={isOnline ? 'text-green-100' : 'text-red-100'}>
                {isOnline ? (
                  <strong>Connection Restored</strong>
                ) : (
                  <>
                    <strong>No Internet Connection</strong>
                    <span className="ml-2">• Operations queued for retry when online</span>
                  </>
                )}
              </AlertDescription>
            </div>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}