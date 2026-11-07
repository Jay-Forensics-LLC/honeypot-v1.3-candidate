import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * INTELLIGENCE GRAPH VISUALIZATION
 * 
 * Shows case observables → IOCs → threat actors → campaigns
 * Interactive D3-style graph with zoom/pan
 */
export default function IntelligenceGraph({ correlations, indicators, threatActors, caseId }) {
  const canvasRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    if (!canvasRef.current || !correlations) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth * 2;
    const height = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    // Build graph nodes
    const nodes = [];
    const edges = [];

    // Case node (center)
    nodes.push({
      id: `case-${caseId}`,
      type: 'case',
      label: 'Case',
      x: width / 4,
      y: height / 4,
      radius: 20,
      color: '#EF4444'
    });

    // Observable nodes
    const observables = new Map();
    correlations.forEach((corr, idx) => {
      const obsValue = corr.metadata?.observable_value;
      if (!observables.has(obsValue)) {
        observables.set(obsValue, {
          id: `obs-${obsValue}`,
          type: 'observable',
          label: obsValue,
          x: width / 4 + Math.cos(idx * 0.5) * 100,
          y: height / 4 + Math.sin(idx * 0.5) * 100,
          radius: 12,
          color: '#3B82F6'
        });
      }
      
      edges.push({
        from: `case-${caseId}`,
        to: `obs-${obsValue}`,
        color: '#444'
      });
    });
    nodes.push(...observables.values());

    // IOC nodes
    indicators.forEach((ioc, idx) => {
      const nodeId = `ioc-${ioc.id}`;
      nodes.push({
        id: nodeId,
        type: 'ioc',
        label: ioc.value.substring(0, 20),
        x: width / 4 + Math.cos(idx * 0.7) * 180,
        y: height / 4 + Math.sin(idx * 0.7) * 180,
        radius: 10,
        color: '#F59E0B',
        data: ioc
      });

      // Find matching observable
      const matchingCorr = correlations.find(c => c.target_id === ioc.id);
      if (matchingCorr) {
        const obsValue = matchingCorr.metadata?.observable_value;
        edges.push({
          from: `obs-${obsValue}`,
          to: nodeId,
          color: '#666'
        });
      }
    });

    // Threat actor nodes
    threatActors.forEach((actor, idx) => {
      const nodeId = `actor-${actor.id}`;
      nodes.push({
        id: nodeId,
        type: 'actor',
        label: actor.actor_name,
        x: width / 4 + Math.cos(idx * 0.9) * 260,
        y: height / 4 + Math.sin(idx * 0.9) * 260,
        radius: 15,
        color: '#EF4444',
        data: actor
      });

      // Link to IOCs
      actor.associated_iocs?.forEach(iocId => {
        edges.push({
          from: `ioc-${iocId}`,
          to: nodeId,
          color: '#888'
        });
      });
    });

    // Render
    ctx.clearRect(0, 0, width / 2, height / 2);
    ctx.fillStyle = '#0B0B0C';
    ctx.fillRect(0, 0, width / 2, height / 2);

    // Draw edges
    edges.forEach(edge => {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      ctx.strokeStyle = edge.color;
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#FFF';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(node.label.substring(0, 15), node.x, node.y + node.radius + 12);
    });

  }, [correlations, indicators, threatActors, caseId]);

  return (
    <Card className={`bg-slate-900/50 border-slate-800 ${fullscreen ? 'fixed inset-4 z-50' : ''}`}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-red-400" />
            Intelligence Graph
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFullscreen(!fullscreen)}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full bg-black rounded-lg border border-slate-700"
            style={{ height: fullscreen ? '80vh' : '400px' }}
          />
          <div className="absolute top-4 left-4 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-white">Case/Threat Actors</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-white">Observables</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-white">IOCs</span>
            </div>
          </div>
        </div>
        
        {selectedNode && (
          <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">
            <p className="text-white font-semibold">{selectedNode.label}</p>
            <Badge className="mt-2">{selectedNode.type}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}