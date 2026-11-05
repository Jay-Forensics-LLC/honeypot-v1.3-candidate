import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network } from 'lucide-react';

export default function IOCCorrelationGraph({ correlations }) {
  const graphData = useMemo(() => {
    const nodes = new Map();
    const edges = [];

    correlations.forEach(corr => {
      // Add threat intel node
      if (!nodes.has(corr.threat_intel_id)) {
        nodes.set(corr.threat_intel_id, {
          id: corr.threat_intel_id,
          type: 'threat_intel',
          label: corr.match_details?.ioc_value || 'IOC',
          threat_score: corr.confidence_score
        });
      }

      // Add SIEM log node
      if (corr.siem_log_id && !nodes.has(corr.siem_log_id)) {
        nodes.set(corr.siem_log_id, {
          id: corr.siem_log_id,
          type: 'siem_log',
          label: corr.match_details?.log_value || 'Event',
          threat_score: 50
        });
      }

      // Add edge
      if (corr.siem_log_id) {
        edges.push({
          source: corr.threat_intel_id,
          target: corr.siem_log_id,
          confidence: corr.confidence_score,
          type: corr.correlation_type
        });
      }
    });

    return {
      nodes: Array.from(nodes.values()),
      edges
    };
  }, [correlations]);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Network className="w-5 h-5 text-purple-400" />
          IOC Correlation Network
        </CardTitle>
      </CardHeader>
      <CardContent>
        {graphData.nodes.length === 0 ? (
          <div className="text-center py-12">
            <Network className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No correlations to visualize</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                <p className="text-sm text-purple-300 mb-1">Nodes</p>
                <p className="text-3xl font-bold text-purple-400">{graphData.nodes.length}</p>
              </div>
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-300 mb-1">Connections</p>
                <p className="text-3xl font-bold text-blue-400">{graphData.edges.length}</p>
              </div>
            </div>

            {/* Simplified graph visualization */}
            <div className="space-y-2">
              {graphData.edges.map((edge, idx) => {
                const sourceNode = graphData.nodes.find(n => n.id === edge.source);
                const targetNode = graphData.nodes.find(n => n.id === edge.target);
                
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg"
                  >
                    <Badge className="bg-purple-500/20 text-purple-300 flex-shrink-0">
                      IOC
                    </Badge>
                    <div className="flex-1 text-sm text-slate-300 truncate">
                      {sourceNode?.label}
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="w-16 bg-slate-700 rounded-full h-1">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-blue-500 h-1 rounded-full"
                          style={{ width: `${edge.confidence}%` }}
                        />
                      </div>
                      <Badge className="bg-blue-500/20 text-blue-300 text-xs">
                        {edge.confidence}%
                      </Badge>
                    </div>
                    
                    <div className="flex-1 text-sm text-slate-300 text-right truncate">
                      {targetNode?.label}
                    </div>
                    <Badge className="bg-green-500/20 text-green-300 flex-shrink-0">
                      LOG
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}