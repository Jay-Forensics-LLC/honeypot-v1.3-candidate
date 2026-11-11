import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Increment usage counter for current period
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { metricType, amount = 1 } = await req.json();

        if (!metricType) {
            return Response.json({ error: 'Metric type required' }, { status: 400 });
        }

        const currentUsage = user.usage_current_period || {};
        const newValue = (currentUsage[metricType] || 0) + amount;

        await base44.auth.updateMe({
            usage_current_period: {
                ...currentUsage,
                [metricType]: newValue
            }
        });

        return Response.json({
            success: true,
            metricType,
            newValue
        });

    } catch (error) {
        console.error('Usage increment error:', error);
        return Response.json({
            error: 'Failed to increment usage',
            message: error.message
        }, { status: 500 });
    }
});