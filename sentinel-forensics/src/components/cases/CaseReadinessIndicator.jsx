import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function CaseReadinessIndicator({ caseData, evidenceCount = 0 }) {
  const calculateReadiness = () => {
    let score = 0;
    let issues = [];

    // Gate checks
    if (caseData.stabilization_acknowledged) score += 25;
    else issues.push('Stabilization not acknowledged');

    if (caseData.evidence_context_declared) score += 25;
    else if (evidenceCount > 0) issues.push('Evidence context missing');

    if (evidenceCount > 0) score += 25;
    else issues.push('No evidence collected');

    if (caseData.case_purpose) score += 25;
    else issues.push('Case purpose not set');

    if (score >= 75 && evidenceCount > 0 && caseData.evidence_context_declared) {
      return { level: 'ready', color: 'green', icon: CheckCircle2, label: 'Context documented; evidence collected' };
    }
    if (score >= 50) return { level: 'partial', color: 'yellow', icon: AlertTriangle, label: 'Readiness checks incomplete' };
    return { level: 'minimal', color: 'red', icon: Shield, label: 'Minimal context only' };
  };

  const readiness = calculateReadiness();
  const Icon = readiness.icon;

  const colorClasses = {
    green: 'bg-green-500/20 text-green-300 border-green-500/50',
    yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    red: 'bg-red-500/20 text-red-300 border-red-500/50'
  };

  return (
    <Badge className={`${colorClasses[readiness.color]} flex items-center gap-1.5`}>
      <Icon className="w-3 h-3" />
      <span className="text-xs">{readiness.label}</span>
    </Badge>
  );
}