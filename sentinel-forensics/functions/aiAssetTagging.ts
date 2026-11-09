import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { asset_id } = await req.json();

    // Fetch asset
    const assets = await base44.entities.Asset.filter({
      id: asset_id,
      organization_id: user.organization_id
    });

    const asset = assets[0];
    if (!asset) {
      return Response.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Fetch all assets for relationship detection
    const allAssets = await base44.entities.Asset.filter({
      organization_id: user.organization_id
    });

    // Build context for AI
    const context = `
Asset Details:
- Name: ${asset.asset_name}
- Type: ${asset.asset_type}
- Category: ${asset.category}
- Serial: ${asset.serial_number || 'N/A'}
- Notes: ${asset.notes || 'None'}
- Location: ${asset.location || 'N/A'}
- Owner: ${asset.current_owner || 'N/A'}

Other Assets in Organization (for relationship detection):
${allAssets.filter(a => a.id !== asset_id).slice(0, 20).map(a => 
  `- ${a.asset_name} (${a.category}, ${a.asset_type})`
).join('\n')}
`;

    // Call AI for tagging
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this asset and suggest relevant tags and relationships.

${context}

Provide:
1. Relevant tags (e.g., critical, customer-facing, legacy, high-value, backup, production, development)
2. Detected relationships with other assets (e.g., software licenses for hardware, backup systems, dependencies)

Be specific and practical. Focus on operational and security-relevant tags.`,
      response_json_schema: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Suggested tags"
          },
          relationships: {
            type: "array",
            items: {
              type: "object",
              properties: {
                related_asset_name: { type: "string" },
                relationship_type: { type: "string" },
                reason: { type: "string" }
              }
            }
          },
          categorization_reasoning: {
            type: "string",
            description: "Brief explanation of tagging logic"
          }
        }
      }
    });

    // Map asset names to IDs for relationships
    const relationships = aiResponse.relationships.map(rel => {
      const relatedAsset = allAssets.find(a => 
        a.asset_name.toLowerCase().includes(rel.related_asset_name.toLowerCase())
      );
      return relatedAsset ? {
        related_asset_id: relatedAsset.id,
        relationship_type: rel.relationship_type,
        confidence: 0.85
      } : null;
    }).filter(Boolean);

    // Update asset with AI suggestions
    await base44.entities.Asset.update(asset_id, {
      ai_suggested_tags: aiResponse.tags,
      relationships: relationships
    });

    return Response.json({
      success: true,
      tags: aiResponse.tags,
      relationships: relationships,
      reasoning: aiResponse.categorization_reasoning
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});