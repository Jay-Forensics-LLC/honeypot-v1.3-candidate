import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Generate Provenance Graph for Evidence
 * Tracks lineage: source → transformations → outputs
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { evidence_id } = await req.json();

        if (!evidence_id) {
            return Response.json({ error: 'evidence_id required' }, { status: 400 });
        }

        // Fetch all provenance nodes for this evidence
        const nodes = await base44.entities.ProvenanceNode.filter({ evidence_id }, '-timestamp');

        // Build graph structure
        const graph = {
            nodes: [],
            edges: []
        };

        nodes.forEach(node => {
            graph.nodes.push({
                id: node.node_id,
                type: node.node_type,
                label: node.transformation_type || 'Source',
                hash: node.output_hash,
                timestamp: node.timestamp,
                actor: node.actor
            });

            // Create edges from parents
            if (node.parent_node_ids && node.parent_node_ids.length > 0) {
                node.parent_node_ids.forEach(parentId => {
                    graph.edges.push({
                        source: parentId,
                        target: node.node_id,
                        type: node.transformation_type
                    });
                });
            }
        });

        return Response.json({
            success: true,
            evidence_id,
            graph,
            node_count: nodes.length
        });

    } catch (error) {
        console.error('Provenance graph error:', error);
        return Response.json({
            error: 'Failed to generate graph',
            message: error.message
        }, { status: 500 });
    }
});