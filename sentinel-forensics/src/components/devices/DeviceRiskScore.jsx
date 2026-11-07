import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';

export default function DeviceRiskScore({ riskScore, showDetails = false, posture = null }) {
  const getRiskLevel = (score) => {
    if (score >= 75) return { level: 'CRITICAL', color: 'bg-red-500/20 text-red-400', icon: AlertTriangle };
    if (score >= 50) return { level: 'HIGH', color: 'bg-orange-500/20 text-orange-400', icon: AlertTriangle };
    if (score >= 25) return { level: 'MEDIUM', color: 'bg-yellow-500/20 text-yellow-400', icon: Shield };
    return { level: 'LOW', color: 'bg-green-500/20 text-green-400', icon: CheckCircle };
  };

  const risk = getRiskLevel(riskScore);
  const Icon = risk.icon;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs text-slate-400">Risk Score:</span>
        <Badge className={risk.color}>
          {riskScore}/100 ({risk.level})
        </Badge>
      </div>

      {showDetails && posture && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className={posture.firewall_enabled ? 'text-green-400' : 'text-red-400'}>
            <CheckCircle className="w-3 h-3 inline mr-1" />
            Firewall: {posture.firewall_enabled ? 'ON' : 'OFF'}
          </div>
          <div className={posture.antivirus_enabled ? 'text-green-400' : 'text-red-400'}>
            <CheckCircle className="w-3 h-3 inline mr-1" />
            Antivirus: {posture.antivirus_enabled ? 'ON' : 'OFF'}
          </div>
          <div className={posture.encryption_enabled ? 'text-green-400' : 'text-red-400'}>
            <CheckCircle className="w-3 h-3 inline mr-1" />
            Encryption: {posture.encryption_enabled ? 'ON' : 'OFF'}
          </div>
          <div className={posture.auto_updates_enabled ? 'text-green-400' : 'text-red-400'}>
            <CheckCircle className="w-3 h-3 inline mr-1" />
            Updates: {posture.auto_updates_enabled ? 'ON' : 'OFF'}
          </div>
          {posture.known_vulnerabilities > 0 && (
            <div className="col-span-full text-red-400">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {posture.known_vulnerabilities} known vulnerabilities
            </div>
          )}
        </div>
      )}
    </div>
  );
}