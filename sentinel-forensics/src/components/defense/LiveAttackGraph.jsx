import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Server, Globe } from 'lucide-react';

/**
 * LIVE ATTACK GRAPH
 * Visual representation of active threats and affected systems
 */
export default function LiveAttackGraph({ threats = [], devices = [] }) {
  const graphData = useMemo(() => {
    const nodes = [];
    const edges = [];
    
    // Add threat nodes
    threats.forEach((threat, idx) => {
      nodes.push({
        id: `threat-${threat.id}`,
        type: 'threat',
        label: threat.title?.substring(0, 30) || 'Threat',
        severity: threat.severity,
        x: 150 + (idx % 3) * 200,
        y: 100 + Math.floor(idx / 3) * 150
      });

      // Add device nodes from affected_systems
      threat.affected_systems?.forEach((system, sIdx) => {
        const deviceId = `device-${system}`;
        
        if (!nodes.find(n => n.id === deviceId)) {
          nodes.push({
            id: deviceId,
            type: 'device',
            label: system,
            x: 100 + (sIdx % 4) * 150,
            y: 300 + Math.floor(sIdx / 4) * 100
          });
        }

        // Create edge from threat to device
        edges.push({
          from: `threat-${threat.id}`,
          to: deviceId,
          type: 'affects'
        });
      });
    });

    return { nodes, edges };
  }, [threats, devices]);

  if (graphData.nodes.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-400" />
            Attack Topology
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-slate-400">
            <Globe className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p>No active threats to visualize</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-400" />
          Attack Topology ({threats.length} Active)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <svg 
          viewBox="0 0 800 500" 
          className="w-full h-auto bg-slate-950/50 rounded-lg border border-slate-800"
        >
          {/* Render edges first (behind nodes) */}
          {graphData.edges.map((edge, idx) => {
            const fromNode = graphData.nodes.find(n => n.id === edge.from);
            const toNode = graphData.nodes.find(n => n.id === edge.to);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <line
                key={idx}
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={
                  fromNode.severity === 'critical' ? '#ef4444' :
                  fromNode.severity === 'high' ? '#f97316' :
                  '#64748b'
                }
                strokeWidth="2"
                strokeDasharray={edge.type === 'affects' ? '5,5' : '0'}
                opacity="0.6"
              />
            );
          })}

          {/* Render nodes */}
          {graphData.nodes.map(node => {
            const isThreat = node.type === 'threat';
            const color = isThreat 
              ? (node.severity === 'critical' ? '#ef4444' : 
                 node.severity === 'high' ? '#f97316' : '#eab308')
              : '#3b82f6';
            
            return (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isThreat ? 30 : 20}
                  fill={color}
                  opacity={isThreat ? 0.3 : 0.2}
                  stroke={color}
                  strokeWidth="2"
                />
                
                {isThreat ? (
                  <svg x={node.x - 10} y={node.y - 10} width="20" height="20">
                    <path
                      d="M10 2L12 8L18 9L14 13L15 19L10 16L5 19L6 13L2 9L8 8Z"
                      fill={color}
                    />
                  </svg>
                ) : (
                  <rect
                    x={node.x - 8}
                    y={node.y - 8}
                    width="16"
                    height="16"
                    fill={color}
                    rx="2"
                  />
                )}
                
                <text
                  x={node.x}
                  y={node.y + 35}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="11"
                  fontWeight="500"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500/30 border-2 border-red-500" />
            <span>Critical Threat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-orange-500/30 border-2 border-orange-500" />
            <span>High Threat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500/30 border-2 border-blue-500" />
            <span>Affected System</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}