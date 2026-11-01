import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, TrendingUp, Shield, AlertTriangle } from 'lucide-react';

export default function HuntMetrics({ findings = [], runs = [] }) {
  const totalFindings = findings.length;
  const criticalFindings = findings.filter(f => f.severity === 'critical').length;
  const activeFindings = findings.filter(f => f.status === 'new' || f.status === 'investigating').length;
  const containedFindings = findings.filter(f => f.status === 'contained').length;
  
  const completedRuns = runs.filter(r => r.status === 'completed').length;
  const avgFindingsPerRun = completedRuns > 0 
    ? Math.round(findings.length / completedRuns) 
    : 0;

  const metrics = [
    {
      label: 'Total Findings',
      value: totalFindings,
      icon: Target,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10'
    },
    {
      label: 'Critical',
      value: criticalFindings,
      icon: AlertTriangle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10'
    },
    {
      label: 'Active Investigations',
      value: activeFindings,
      icon: Shield,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10'
    },
    {
      label: 'Contained',
      value: containedFindings,
      icon: Shield,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.label} className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-lg ${metric.bgColor} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${metric.color}`} />
              </div>
              <p className="text-2xl font-bold text-white mb-1">{metric.value}</p>
              <p className="text-xs text-slate-400">{metric.label}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}