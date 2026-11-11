import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Target } from 'lucide-react';

export default function IOCMatchBadge({ log, compact = false }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!log?.threat_indicators || log.threat_indicators.length === 0) {
    return null;
  }

  const matchCount = log.threat_indicators.length;
  const maxThreatScore = Math.max(...log.threat_indicators.map(t => t.threat_score || 0));
  
  const getSeverityColor = (score) => {
    if (score >= 90) return 'bg-red-500/20 text-red-400 border-red-500/50';
    if (score >= 70) return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
    if (score >= 50) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
  };

  const getIcon = (score) => {
    if (score >= 90) return AlertTriangle;
    if (score >= 70) return Target;
    return Shield;
  };

  const Icon = getIcon(maxThreatScore);

  if (compact) {
    return (
      <div 
        className="relative inline-block"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Badge className={`${getSeverityColor(maxThreatScore)} text-[10px] px-2 py-0.5 cursor-help`}>
          <Target className="w-3 h-3 mr-1" />
          IOC
        </Badge>
        
        {showTooltip && (
          <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3">
            <div className="space-y-1">
              <p className="font-semibold text-white text-xs">{matchCount} IOC Match{matchCount > 1 ? 'es' : ''}</p>
              {log.threat_indicators.slice(0, 3).map((ti, idx) => (
                <p key={idx} className="text-xs text-slate-300">
                  • {ti.matched_field}: {ti.ioc_value}
                </p>
              ))}
              {matchCount > 3 && (
                <p className="text-xs text-slate-400">+ {matchCount - 3} more</p>
              )}
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800" />
          </div>
        )}
      </div>
    );
  }

  return (
    <Badge className={`${getSeverityColor(maxThreatScore)} flex items-center gap-1`}>
      <Icon className="w-3 h-3" />
      <span>{matchCount} IOC Match{matchCount > 1 ? 'es' : ''}</span>
      <span className="ml-1 opacity-70">({maxThreatScore})</span>
    </Badge>
  );
}