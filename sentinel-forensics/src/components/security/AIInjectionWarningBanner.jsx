import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldAlert, AlertTriangle, Info, Shield } from 'lucide-react';

/**
 * AI INJECTION WARNING BANNER
 * Reusable alert component for showing injection detection results
 */
export default function AIInjectionWarningBanner({ 
  report, 
  onProceedSafeMode, 
  onCancel,
  className = '' 
}) {
  if (!report || report.action === 'allow') return null;

  const getSeverityConfig = (severity) => {
    const configs = {
      critical: {
        icon: ShieldAlert,
        color: 'bg-red-500/10 border-red-500/30',
        iconColor: 'text-red-400',
        textColor: 'text-red-300',
        badgeColor: 'bg-red-500/20 text-red-400'
      },
      high: {
        icon: AlertTriangle,
        color: 'bg-orange-500/10 border-orange-500/30',
        iconColor: 'text-orange-400',
        textColor: 'text-orange-300',
        badgeColor: 'bg-orange-500/20 text-orange-400'
      },
      medium: {
        icon: AlertTriangle,
        color: 'bg-yellow-500/10 border-yellow-500/30',
        iconColor: 'text-yellow-400',
        textColor: 'text-yellow-300',
        badgeColor: 'bg-yellow-500/20 text-yellow-400'
      },
      low: {
        icon: Info,
        color: 'bg-blue-500/10 border-blue-500/30',
        iconColor: 'text-blue-400',
        textColor: 'text-blue-300',
        badgeColor: 'bg-blue-500/20 text-blue-400'
      }
    };
    return configs[severity] || configs.low;
  };

  const config = getSeverityConfig(report.severity);
  const Icon = config.icon;

  const getMessage = () => {
    if (report.action === 'block') {
      return {
        title: 'Analysis Blocked: Suspected Prompt Injection',
        description: 'The input contains patterns that resemble an attempt to override AI behavior or extract sensitive information. For security, this request cannot be processed.',
        canProceed: false
      };
    }
    
    if (report.action === 'challenge') {
      return {
        title: 'Security Warning: Unusual Input Detected',
        description: 'The input contains instruction-like patterns that may be attempting to manipulate AI behavior. You can proceed in Safe Mode (limited functionality, no tool actions) or cancel.',
        canProceed: true
      };
    }

    return {
      title: 'Input Sanitized',
      description: 'Potentially risky patterns were detected and neutralized. Analysis will proceed with additional safeguards.',
      canProceed: true
    };
  };

  const message = getMessage();

  return (
    <Alert className={`${config.color} ${className}`}>
      <Icon className={`h-5 w-5 ${config.iconColor}`} />
      <AlertTitle className={`${config.textColor} font-semibold flex items-center gap-2`}>
        {message.title}
        <Badge className={config.badgeColor}>
          Score: {report.score}/100
        </Badge>
      </AlertTitle>
      <AlertDescription className={config.textColor}>
        <p className="mb-3">{message.description}</p>

        {report.indicators && report.indicators.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold mb-2">Detected patterns:</p>
            <div className="space-y-1">
              {report.indicators.slice(0, 3).map((ind, idx) => (
                <div key={idx} className="text-xs bg-slate-900/50 p-2 rounded">
                  <span className="font-mono">{ind.category}</span>: {ind.snippet}
                </div>
              ))}
              {report.indicators.length > 3 && (
                <p className="text-xs">+ {report.indicators.length - 3} more patterns</p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          {message.canProceed && onProceedSafeMode && (
            <Button
              onClick={onProceedSafeMode}
              size="sm"
              variant="outline"
              className="border-slate-600"
            >
              <Shield className="w-4 h-4 mr-2" />
              Proceed in Safe Mode
            </Button>
          )}
          {onCancel && (
            <Button
              onClick={onCancel}
              size="sm"
              variant="outline"
              className="border-slate-600"
            >
              Cancel
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}