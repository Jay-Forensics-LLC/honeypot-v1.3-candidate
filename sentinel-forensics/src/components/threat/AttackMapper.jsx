import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ExternalLink } from 'lucide-react';

/**
 * MITRE ATT&CK MAPPING COMPONENT
 * 
 * Displays threat actor TTPs mapped to MITRE ATT&CK framework
 */
export default function AttackMapper({ ttps = [] }) {
  if (ttps.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-8 text-center">
          <Shield className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No ATT&CK TTPs mapped</p>
        </CardContent>
      </Card>
    );
  }

  // Group by tactic
  const grouped = ttps.reduce((acc, ttp) => {
    const tactic = ttp.tactic || 'Unknown';
    if (!acc[tactic]) acc[tactic] = [];
    acc[tactic].push(ttp);
    return acc;
  }, {});

  const tacticColors = {
    'Initial Access': 'bg-red-500/20 text-red-400',
    'Execution': 'bg-orange-500/20 text-orange-400',
    'Persistence': 'bg-yellow-500/20 text-yellow-400',
    'Privilege Escalation': 'bg-purple-500/20 text-purple-400',
    'Defense Evasion': 'bg-pink-500/20 text-pink-400',
    'Credential Access': 'bg-indigo-500/20 text-indigo-400',
    'Discovery': 'bg-blue-500/20 text-blue-400',
    'Lateral Movement': 'bg-cyan-500/20 text-cyan-400',
    'Collection': 'bg-teal-500/20 text-teal-400',
    'Command and Control': 'bg-green-500/20 text-green-400',
    'Exfiltration': 'bg-lime-500/20 text-lime-400',
    'Impact': 'bg-red-600/20 text-red-400'
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-400" />
          MITRE ATT&CK Mapping ({ttps.length} TTPs)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(grouped).map(([tactic, techniques]) => (
          <div key={tactic}>
            <div className="flex items-center gap-2 mb-2">
              <Badge className={tacticColors[tactic] || 'bg-slate-500/20 text-slate-400'}>
                {tactic}
              </Badge>
              <span className="text-xs text-slate-500">({techniques.length})</span>
            </div>
            <div className="space-y-2 ml-4">
              {techniques.map((tech, idx) => (
                <div key={idx} className="flex items-start justify-between p-2 bg-slate-800/50 rounded">
                  <div>
                    <p className="text-white text-sm font-mono">{tech.technique_id}</p>
                    <p className="text-slate-400 text-xs">{tech.technique_name}</p>
                  </div>
                  <a
                    href={`https://attack.mitre.org/techniques/${tech.technique_id}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}