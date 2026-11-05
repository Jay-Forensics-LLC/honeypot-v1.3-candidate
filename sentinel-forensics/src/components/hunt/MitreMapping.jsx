import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';

export default function MitreMapping({ findings }) {
  const mitreTactics = {
    'TA0001': { name: 'Initial Access', color: 'bg-red-500/20 text-red-400' },
    'TA0003': { name: 'Persistence', color: 'bg-orange-500/20 text-orange-400' },
    'TA0011': { name: 'Command and Control', color: 'bg-purple-500/20 text-purple-400' },
    'TA0008': { name: 'Lateral Movement', color: 'bg-blue-500/20 text-blue-400' }
  };

  const tacticCounts = findings.reduce((acc, finding) => {
    (finding.mitre_tactics || []).forEach(tactic => {
      acc[tactic] = (acc[tactic] || 0) + 1;
    });
    return acc;
  }, {});

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Target className="w-5 h-5 text-red-400" />
          MITRE ATT&CK Coverage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Object.entries(mitreTactics).map(([id, tactic]) => {
            const count = tacticCounts[id] || 0;
            return (
              <div key={id} className="flex items-center justify-between p-2 bg-slate-800/50 rounded">
                <div className="flex items-center gap-2">
                  <Badge className={tactic.color}>{id}</Badge>
                  <span className="text-sm text-slate-300">{tactic.name}</span>
                </div>
                <Badge className="bg-slate-700 text-white">{count}</Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}