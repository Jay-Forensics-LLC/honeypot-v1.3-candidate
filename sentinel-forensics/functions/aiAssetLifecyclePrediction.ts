import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI-POWERED ASSET LIFECYCLE PREDICTION
 * Predicts asset lifecycle and recommends refresh/decommissioning
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !user.organization_id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { asset_id } = await req.json();

    if (!asset_id) {
      return Response.json({ error: 'asset_id required' }, { status: 400 });
    }

    // Fetch asset
    const assets = await base44.entities.Asset.filter({
      organization_id: user.organization_id,
      id: asset_id
    });

    if (!assets || assets.length === 0) {
      return Response.json({ error: 'Asset not found' }, { status: 404 });
    }

    const asset = assets[0];

    // Calculate age
    const purchaseDate = asset.purchase_date ? new Date(asset.purchase_date) : null;
    const ageInDays = purchaseDate ? Math.floor((Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

    const prompt = `You are a forensic asset lifecycle analyst. Predict the lifecycle and recommend refresh/decommissioning.

Asset Information:
- Name: ${asset.asset_name}
- Type: ${asset.asset_type} (${asset.asset_subtype || 'N/A'})
- Manufacturer: ${asset.manufacturer || 'Unknown'}
- Model: ${asset.model || 'Unknown'}
- Status: ${asset.status}
- Purchase Date: ${asset.purchase_date || 'Unknown'}
- Age: ${ageInDays ? `${ageInDays} days (~${Math.round(ageInDays / 365)} years)` : 'Unknown'}
- Warranty Expiry: ${asset.warranty_expiry_date || 'Unknown'}
- Last Maintenance: ${asset.last_maintenance_date || 'Never'}
- Cost: $${asset.purchase_cost || 'Unknown'}
- Location: ${asset.location || 'Unknown'}
- Assigned To: ${asset.assigned_to || 'Unassigned'}

Usage Metrics:
- CPU Usage: ${asset.performance_metrics?.cpu_usage || 'N/A'}%
- Memory Usage: ${asset.performance_metrics?.memory_usage || 'N/A'}%
- Disk Usage: ${asset.performance_metrics?.disk_usage || 'N/A'}%
- Uptime: ${asset.performance_metrics?.uptime_days || 'N/A'} days
- Incidents: ${asset.incident_count || 0}

Maintenance History:
${asset.maintenance_history?.slice(0, 5).map(m => `- ${m.date}: ${m.description}`).join('\n') || 'No records'}

Predict lifecycle:
1. current_lifecycle_stage: (new/active/mature/aging/end_of_life)
2. expected_eol_date: Predicted end-of-life date
3. remaining_useful_life: Months until replacement needed
4. refresh_recommendation: (keep/monitor/plan_replacement/replace_urgently)
5. decommission_timeline: Recommended timeline with phases
6. financial_analysis: Cost analysis (TCO, depreciation, replacement cost)
7. risk_assessment: Risks of continuing to use vs replacing
8. recommended_actions: Specific actions with priorities

Consider: typical lifespan for asset type, usage patterns, maintenance history, technological obsolescence, security risks.`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: {
        type: "object",
        properties: {
          current_lifecycle_stage: { 
            type: "string", 
            enum: ["new", "active", "mature", "aging", "end_of_life"] 
          },
          expected_eol_date: { type: "string" },
          remaining_useful_life_months: { type: "number" },
          refresh_recommendation: { 
            type: "string", 
            enum: ["keep", "monitor", "plan_replacement", "replace_urgently"] 
          },
          decommission_timeline: {
            type: "object",
            properties: {
              phase_1_assessment: { type: "string" },
              phase_2_procurement: { type: "string" },
              phase_3_migration: { type: "string" },
              phase_4_decommission: { type: "string" }
            }
          },
          financial_analysis: {
            type: "object",
            properties: {
              total_cost_of_ownership: { type: "number" },
              current_value: { type: "number" },
              estimated_replacement_cost: { type: "number" },
              roi_of_replacement: { type: "string" }
            }
          },
          risk_assessment: {
            type: "object",
            properties: {
              continue_use_risks: { type: "array", items: { type: "string" } },
              replacement_risks: { type: "array", items: { type: "string" } },
              overall_risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] }
            }
          },
          recommended_actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" },
                priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                timeframe: { type: "string" },
                estimated_cost: { type: "number" },
                impact: { type: "string" }
              }
            }
          },
          summary: { type: "string" }
        }
      }
    });

    // Update asset with prediction
    await base44.entities.Asset.update(asset.id, {
      lifecycle_prediction: aiResponse,
      last_lifecycle_analysis: new Date().toISOString()
    });

    // Audit log
    await base44.asServiceRole.functions.invoke('createSecureAuditLog', {
      event_type: 'ai_lifecycle_prediction',
      severity: 'info',
      description: `Lifecycle prediction for asset ${asset.asset_name}: ${aiResponse.refresh_recommendation}`,
      metadata: {
        asset_id: asset.id,
        asset_name: asset.asset_name,
        lifecycle_stage: aiResponse.current_lifecycle_stage,
        recommendation: aiResponse.refresh_recommendation,
        remaining_months: aiResponse.remaining_useful_life_months
      }
    });

    return Response.json({
      asset_id: asset.id,
      prediction: aiResponse,
      analyzed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI lifecycle prediction error:', error);
    return Response.json({ 
      error: 'Lifecycle prediction failed', 
      details: error.message 
    }, { status: 500 });
  }
});