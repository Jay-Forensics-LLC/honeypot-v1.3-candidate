import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Monitor, Users, Network } from 'lucide-react';

export default function BlastRadiusViz({ finding }) {
  if (!finding?.blast_radius) return null;

  const { count, entity_refs = [] } = finding.blast_radius;

  const getImpactLevel = (count) => {
    if (count >= 10) return { level: 'critical', color: 'text-red-400 bg-red-500/20', icon: Zap };
    if (count >= 5) return { level: 'high', color: 'text-orange-400 bg-orange-500/20', icon: Network };
    if (count >= 2) return { level: 'medium', color: 'text-yellow-400 bg-yellow-500/20', icon: Users };
    return { level: 'low', color: 'text-blue-400 bg-blue-500/20', icon: Monitor };
  };

  const impact = getImpactLevel(count);
  const Icon = impact.icon;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Icon className={`w-5 h-5 ${impact.color.split(' ')[0]}`} />
          Blast Radius
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className={`p-4 rounded-lg ${impact.color}`}>
            <p className="text-3xl font-bold mb-2">{count}</p>
            <p className="text-sm">Affected {finding.primary_entity_type}s</p>
            <Badge className="mt-2">{impact.level} impact</Badge>
          </div>
          
          {entity_refs.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-2">Affected entities:</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {entity_refs.slice(0, 10).map((ref, idx) => (
                  <p key={idx} className="text-xs text-slate-300 font-mono p-1 bg-slate-800/50 rounded">
                    {ref}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}