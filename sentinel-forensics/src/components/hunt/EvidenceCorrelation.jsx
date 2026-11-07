import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Shield, AlertTriangle, Network } from 'lucide-react';
import { format } from 'date-fns';

export default function EvidenceCorrelation({ findingId }) {
  const { data: evidence = [] } = useQuery({
    queryKey: ['hunt-evidence', findingId],
    queryFn: async () => {
      const items = await base44.entities.HuntEvidence.filter({ finding_id: findingId });
      return items;
    },
    enabled: !!findingId
  });

  const getTypeIcon = (type) => {
    switch (type) {
      case 'alert': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'device_health': return <Shield className="w-4 h-4 text-blue-400" />;
      case 'network_scan': return <Network className="w-4 h-4 text-purple-400" />;
      default: return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white">Correlated Evidence</CardTitle>
      </CardHeader>
      <CardContent>
        {evidence.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No evidence linked yet
          </div>
        ) : (
          <div className="space-y-2">
            {evidence.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(item.type)}
                    <Badge className="text-xs">{item.type}</Badge>
                  </div>
                  <span className="text-xs text-slate-500">
                    {format(new Date(item.timestamp), 'MMM d, h:mm a')}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mb-2">{item.summary}</p>
                {item.score_contribution && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Risk contribution:</span>
                    <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                      +{item.score_contribution}
                    </Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}