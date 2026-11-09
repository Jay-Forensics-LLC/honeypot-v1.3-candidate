import React, { useEffect, useState, startTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Shield, X, ChevronDown, ChevronUp } from 'lucide-react';
import { deviceIntegrityChecker } from './DeviceIntegrityChecker';

/**
 * DEVICE INTEGRITY ALERT
 * Shows security alerts from device integrity checks
 */
export default function DeviceIntegrityAlert() {
  const [results, setResults] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Listen for integrity check results
    const checkResults = localStorage.getItem('device_integrity_results');
    if (checkResults) {
      try {
        const parsed = JSON.parse(checkResults);
        if (parsed.alerts && parsed.alerts.length > 0) {
          startTransition(() => {
            setResults(parsed);
          });
        }
      } catch (error) {
        console.error('Failed to parse integrity results:', error);
      }
    }

    // Poll for updates
    const interval = setInterval(() => {
      const updated = localStorage.getItem('device_integrity_results');
      if (updated) {
        try {
          const parsed = JSON.parse(updated);
          if (parsed.alerts && parsed.alerts.length > 0) {
            startTransition(() => {
              setResults(parsed);
            });
          }
        } catch (error) {
          // Ignore
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  if (!results || dismissed || results.alerts.length === 0) {
    return null;
  }

  const criticalAlerts = results.alerts.filter(a => a.severity === 'critical');
  const highAlerts = results.alerts.filter(a => a.severity === 'high');

  return (
    <Alert className="bg-red-950/30 border-red-500/50 relative">
      <AlertTriangle className="h-5 w-5 text-red-400" />
      <AlertDescription>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <p className="font-semibold text-red-300">
                Security Alert: Device Integrity Issues Detected
              </p>
              {criticalAlerts.length > 0 && (
                <Badge className="bg-red-500/20 text-red-300 border-red-500/50">
                  {criticalAlerts.length} Critical
                </Badge>
              )}
              {highAlerts.length > 0 && (
                <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/50">
                  {highAlerts.length} High
                </Badge>
              )}
            </div>
            
            <div className="space-y-2">
              {results.alerts.slice(0, expanded ? undefined : 2).map((alert, idx) => (
                <div key={idx} className="text-sm text-red-200 flex items-start gap-2">
                  <span className="text-red-400 font-bold">•</span>
                  <div>
                    <span className="font-semibold">{alert.type}:</span> {alert.message}
                  </div>
                </div>
              ))}
              
              {results.alerts.length > 2 && !expanded && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => setExpanded(true)}
                  className="text-red-300 hover:text-red-200 p-0 h-auto"
                >
                  <ChevronDown className="w-4 h-4 mr-1" />
                  Show {results.alerts.length - 2} more alerts
                </Button>
              )}
              
              {expanded && results.alerts.length > 2 && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => setExpanded(false)}
                  className="text-red-300 hover:text-red-200 p-0 h-auto"
                >
                  <ChevronUp className="w-4 h-4 mr-1" />
                  Show less
                </Button>
              )}
            </div>

            <div className="mt-4 p-3 bg-orange-950/30 border border-orange-500/30 rounded">
              <p className="text-xs font-semibold text-orange-300 mb-2">Recommended Actions:</p>
              <ol className="text-xs text-orange-200 space-y-1 ml-4 list-decimal">
                <li>Review device fingerprint for anomalies</li>
                <li>Verify device has not been cloned or compromised</li>
                <li>Run full system security scan</li>
                <li>Check for unauthorized software or modifications</li>
                <li>Document findings in a security incident report</li>
              </ol>
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissed(true)}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}