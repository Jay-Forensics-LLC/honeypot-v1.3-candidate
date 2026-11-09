import React, { useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Network } from 'lucide-react';

/**
 * INDICATOR NETWORK GRAPH
 * Visualizes relationships between indicators, actors, and hosts
 * Every node/edge includes traceability (sourceEventIds/sourceArtifactIds)
 */

export default function IndicatorNetworkGraph({ indicators, events }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !indicators || !events) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Build graph data
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    // Add indicator nodes
    indicators.forEach((ind, idx) => {
      const node = {
        id: ind.id,
        label: ind.value.substring(0, 15),
        type: ind.indicator_type,
        x: 0,
        y: 0,
        sourceEventIds: ind.derived_from?.source_event_ids || [],
        sourceArtifactIds: ind.derived_from?.source_artifact_ids || []
      };
      nodes.push(node);
      nodeMap.set(ind.id, node);
    });

    // Add actor nodes and edges
    const actors = new Set();
    const hosts = new Set();

    events.forEach(event => {
      if (event.actor_user) actors.add(event.actor_user);
      if (event.host_id) hosts.add(event.host_id);

      // Link indicators to events
      indicators.forEach(ind => {
        const isRelated = 
          (ind.indicator_type === 'ip' && (event.src_ip === ind.value || event.dst_ip === ind.value)) ||
          (ind.indicator_type === 'email' && event.actor_user === ind.value) ||
          (ind.indicator_type === 'domain' && event.domain === ind.value);

        if (isRelated && nodeMap.has(ind.id)) {
          // Create edge
          edges.push({
            from: ind.id,
            to: `event_${event.id}`,
            label: 'seen_in',
            sourceEventIds: [event.id]
          });
        }
      });
    });

    // Circular layout
    const radius = Math.min(width, height) * 0.35;
    const centerX = width / 2;
    const centerY = height / 2;

    nodes.forEach((node, idx) => {
      const angle = (idx / nodes.length) * 2 * Math.PI;
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });

    // Draw edges
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    edges.forEach(edge => {
      const fromNode = nodeMap.get(edge.from);
      if (!fromNode) return;

      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      // Simplified - just draw to center
      ctx.lineTo(centerX, centerY);
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(node => {
      const colors = {
        ip: '#EF4444',
        email: '#F59E0B',
        domain: '#10B981',
        hash_sha256: '#8B5CF6'
      };
      const color = colors[node.type] || '#6B7280';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
      ctx.fill();

      // Label
      ctx.fillStyle = '#E5E7EB';
      ctx.font = '10px monospace';
      ctx.fillText(node.label, node.x + 12, node.y + 4);
    });

  }, [indicators, events]);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Network className="w-5 h-5 text-[#EF4444]" />
          Indicator Network ({indicators?.length || 0} nodes)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <canvas
          ref={canvasRef}
          width={800}
          height={500}
          className="w-full bg-slate-950 rounded-lg"
        />
        <div className="flex gap-4 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-slate-400">IP</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-slate-400">Email</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-slate-400">Domain</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}