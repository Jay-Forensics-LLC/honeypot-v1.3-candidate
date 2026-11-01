import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { validators, validateRequest } from './validateInput.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validated = validateRequest(body, {
      asset_id: { required: true, validator: 'uuid' }
    });
    const { asset_id } = validated;

    const assets = await base44.entities.Asset.filter({
      id: asset_id,
      organization_id: user.organization_id
    });

    const asset = assets[0];
    if (!asset) {
      return Response.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Fetch historical procurement data
    const existingOrders = await base44.entities.ProcurementOrder.filter({
      organization_id: user.organization_id
    }, '-created_date', 50);

    // Build vendor history
    const vendorHistory = {};
    existingOrders.forEach(order => {
      if (!vendorHistory[order.vendor]) {
        vendorHistory[order.vendor] = { count: 0, total_spent: 0, avg_cost: 0 };
      }
      vendorHistory[order.vendor].count++;
      vendorHistory[order.vendor].total_spent += order.total_amount || 0;
    });

    Object.keys(vendorHistory).forEach(vendor => {
      vendorHistory[vendor].avg_cost = vendorHistory[vendor].total_spent / vendorHistory[vendor].count;
    });

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate an optimal procurement order for replacing this asset.

Asset Details:
- Name: ${asset.asset_name}
- Category: ${asset.category}
- Purchase Price: $${asset.purchase_price}
- Current Value: $${asset.depreciation?.current_value || 'Unknown'}
- EOL Prediction: ${asset.eol_prediction?.predicted_eol_date || 'Not predicted'}

Historical Vendor Data:
${JSON.stringify(vendorHistory, null, 2)}

Replacement Suggestions:
${JSON.stringify(asset.eol_prediction?.replacement_suggestions || [], null, 2)}

Tasks:
1. Recommend the best vendor based on cost-effectiveness and reliability
2. Suggest optimal procurement timing
3. Generate purchase order items with quantities and estimated costs
4. Provide reasoning for vendor selection
5. Calculate total estimated cost`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          recommended_vendor: { type: "string" },
          vendor_score: { 
            type: "number",
            description: "0-100 vendor ranking" 
          },
          vendor_reasoning: { type: "string" },
          optimal_order_date: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_name: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
                total_price: { type: "number" }
              }
            }
          },
          total_amount: { type: "number" },
          procurement_reasoning: { type: "string" }
        }
      }
    });

    const poNumber = `PO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const procurementOrder = await base44.asServiceRole.entities.ProcurementOrder.create({
      organization_id: user.organization_id,
      po_number: poNumber,
      status: 'draft',
      asset_id: asset.id,
      asset_name: asset.asset_name,
      vendor: aiResponse.recommended_vendor,
      vendor_score: aiResponse.vendor_score,
      items: aiResponse.items,
      total_amount: aiResponse.total_amount,
      recommended_by_ai: true,
      procurement_reasoning: aiResponse.procurement_reasoning,
      optimal_order_date: aiResponse.optimal_order_date,
      created_date: new Date().toISOString()
    });

    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'procurement_order_generated',
      severity: 'info',
      description: `AI generated procurement order ${poNumber} for ${asset.asset_name}`,
      user_id: user.email,
      resource_type: 'ProcurementOrder',
      resource_id: procurementOrder.id,
      action_performed: 'generate_po',
      timestamp: new Date().toISOString(),
      blockchain_hash: crypto.randomUUID(),
      metadata: {
        vendor: aiResponse.recommended_vendor,
        total_amount: aiResponse.total_amount
      },
      success: true
    });

    return Response.json({
      success: true,
      order_id: procurementOrder.id,
      po_number: poNumber,
      ...aiResponse
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});