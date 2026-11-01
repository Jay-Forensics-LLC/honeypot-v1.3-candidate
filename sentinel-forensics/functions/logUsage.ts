import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { case_id, usage_type, quantity, unit, metadata } = await req.json();

    if (!case_id || !usage_type || !quantity || !unit) {
      return Response.json({ 
        error: 'Missing required fields: case_id, usage_type, quantity, unit' 
      }, { status: 400 });
    }

    // Calculate cost based on usage type (simplified pricing model)
    const costMap = {
      storage: 1, // $0.01 per GB/month, stored in cents
      export: 500, // $5.00 per export
      certified_export: 2500, // $25.00 per certified export
      api_call: 10, // $0.10 per API call
      analysis: 1000, // $10.00 per AI analysis
      report_generation: 500 // $5.00 per report
    };

    const unitCost = costMap[usage_type] || 0;
    const costCents = Math.round(quantity * unitCost);

    const usageLog = await base44.asServiceRole.entities.UsageLog.create({
      organization_id: user.organization_id,
      case_id,
      usage_type,
      quantity,
      unit,
      cost_cents: costCents,
      user_email: user.email,
      metadata: metadata || {},
      timestamp: new Date().toISOString()
    });

    return Response.json({ 
      success: true, 
      usage_log_id: usageLog.id,
      cost_cents: costCents,
      message: 'Usage logged successfully'
    });

  } catch (error) {
    console.error('Usage logging error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});