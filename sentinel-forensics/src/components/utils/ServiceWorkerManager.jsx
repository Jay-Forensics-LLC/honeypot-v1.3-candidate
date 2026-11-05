import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw } from 'lucide-react';
import { bootDiag } from '../diagnostics/BootDiagnostics';

/**
 * Service Worker Update Manager
 * Detects stale SW and prompts user to reload
 */
export function ServiceWorkerManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      bootDiag.checkpoint('SW_CHECK_START');
      
      navigator.serviceWorker.ready
        .then(reg => {
          setRegistration(reg);
          bootDiag.checkpoint('SW_READY');
          
          // Check for updates
          reg.update().catch(err => {
            console.warn('SW update check failed:', err);
          });
        })
        .catch(err => {
          console.warn('SW not available:', err);
          bootDiag.error('SW error', err);
        });

      // Listen for updates
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 Service Worker updated');
        bootDiag.checkpoint('SW_UPDATED');
        setUpdateAvailable(true);
      });

      // Listen for waiting SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
          console.log('🔄 SW update available');
          setUpdateAvailable(true);
        }
      });
    }
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full px-4">
      <Alert className="bg-blue-900/90 border-blue-500/50 backdrop-blur-sm">
        <RefreshCw className="h-5 w-5 text-blue-400" />
        <AlertDescription className="text-blue-200">
          <strong>Update Available</strong>
          <p className="text-sm mt-1">A new version of the app is ready.</p>
          <Button
            onClick={handleUpdate}
            size="sm"
            className="mt-3 bg-blue-600 hover:bg-blue-700"
          >
            Update Now
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * Chunk Load Error Recovery
 * Handles dynamic import failures
 */
export function setupChunkErrorRecovery() {
  let chunkRetries = 0;
  const MAX_RETRIES = 2;

  window.addEventListener('error', (event) => {
    const isChunkError = event.message?.includes('Loading chunk') || 
                        event.message?.includes('Failed to fetch dynamically imported');
    
    if (isChunkError && chunkRetries < MAX_RETRIES) {
      console.warn(`🔄 Chunk load error - retry ${chunkRetries + 1}/${MAX_RETRIES}`);
      bootDiag.chunkError(event.filename, event.error);
      
      chunkRetries++;
      event.preventDefault();
      
      // Retry after delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else if (isChunkError) {
      console.error('🚨 Chunk load failed after retries');
      bootDiag.error('Chunk load failure', new Error('Max retries exceeded'));
      
      // Show recovery UI
      document.body.innerHTML = `
        <div style="min-height: 100vh; background: #0B0B0C; display: flex; align-items: center; justify-content: center; padding: 24px;">
          <div style="max-width: 500px; text-align: center;">
            <h2 style="color: white; font-size: 24px; margin-bottom: 16px;">
              Update Required
            </h2>
            <p style="color: #94a3b8; margin-bottom: 24px;">
              The app needs to reload to fetch updated files. This usually happens after a new release.
            </p>
            <button 
              onclick="caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))).then(() => window.location.reload())"
              style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 16px;"
            >
              Clear Cache & Reload
            </button>
          </div>
        </div>
      `;
    }
  });

  bootDiag.checkpoint('CHUNK_ERROR_RECOVERY_READY');
}

export default ServiceWorkerManager;