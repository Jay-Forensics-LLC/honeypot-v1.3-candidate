import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Handles stale SW and chunk load failures
 */
export function ServiceWorkerManager() {
  const [staleAssets, setStaleAssets] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Check for SW updates
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          registration.update();

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setUpdateAvailable(true);
                }
              });
            }
          });
        }
      });
    }

    // Detect chunk load failures
    const errorHandler = (event) => {
      const target = event.target || event.srcElement;
      
      if (target && target.tagName === 'SCRIPT') {
        const src = target.src || '';
        if (src.includes('/static/') || src.includes('/chunk') || src.includes('.js')) {
          console.error('Chunk load error detected:', src);
          setStaleAssets(true);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('error', errorHandler, true);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', errorHandler, true);
      }
    };
  }, []);

  const handleReloadAssets = async () => {
    try {
      // Clear caches
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      // Unregister SW
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
      }

      // Hard reload
      window.location.reload(true);
    } catch (error) {
      console.error('Cache clear error:', error);
      window.location.reload(true);
    }
  };

  if (!staleAssets && !updateAvailable) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-900/90 backdrop-blur-sm border-b border-yellow-500/50 p-3 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-300" />
          <span className="text-yellow-100 text-sm font-medium">
            {staleAssets ? 'Stale assets detected' : 'App update available'}
          </span>
        </div>
        <Button
          size="sm"
          onClick={handleReloadAssets}
          className="bg-yellow-600 hover:bg-yellow-700 text-white"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Reload Assets
        </Button>
      </div>
    </div>
  );
}