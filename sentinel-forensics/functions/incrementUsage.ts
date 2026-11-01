import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import { incrementUsageCounter, isValidUsageIncrement, VALID_USAGE_METRICS } from './helpers/usage.ts';

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

        if (!isValidUsageIncrement(metricType, amount)) {
            return Response.json({
                error: 'Invalid usage increment',
                valid_metrics: VALID_USAGE_METRICS
            }, { status: 400 });
        }

        const newValue = await incrementUsageCounter(
            base44.asServiceRole.entities.User,
            user.id,
            metricType,
            amount
        );

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