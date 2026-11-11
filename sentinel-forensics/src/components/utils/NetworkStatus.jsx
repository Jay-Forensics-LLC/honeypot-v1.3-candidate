import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';

export default function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        toast.success('Connection restored', {
          description: 'Back online',
          style: {
            background: '#14532D',
            border: '1px solid #16A34A',
            color: '#D1FAE5'
          }
        });
        setWasOffline(false);
        // Reload the page to restore state
        setTimeout(() => window.location.reload(), 1000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      toast.error('Connection lost', {
        description: 'Check your internet connection',
        duration: Infinity,
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check network connectivity periodically
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch('https://www.google.com/favicon.ico', {
          mode: 'no-cors',
          cache: 'no-store'
        });
        if (!isOnline) {
          handleOnline();
        }
      } catch (error) {
        if (isOnline) {
          handleOffline();
        }
      }
    }, 30000); // Check every 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(checkInterval);
    };
  }, [isOnline, wasOffline]);

  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50">
        <Alert className="bg-red-900/90 border-red-500 rounded-none">
          <WifiOff className="h-4 w-4 text-red-200" />
          <AlertDescription className="text-red-200 font-medium">
            No internet connection - Some features may be unavailable
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}