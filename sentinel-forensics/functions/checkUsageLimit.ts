import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const TIER_LIMITS = {
  free: {
    max_scans_per_month: 10,
    max_evidence_mb: 100,
    max_devices: 2,
    ai_monitoring: false,
    report_exports: false,
    ble_anomaly_detection: false,
    remote_dashboard: false,
    forensic_encryption: false,
    priority_support: false
  },
  plus: {
    max_scans_per_month: -1, // unlimited
    max_evidence_mb: 1000,
    max_devices: 10,
    ai_monitoring: true,
    report_exports: true,
    ble_anomaly_detection: true,
    remote_dashboard: false,
    forensic_encryption: false,
    priority_support: false
  },
  pro: {
    max_scans_per_month: -1,
    max_evidence_mb: 10000,
    max_devices: -1,
    ai_monitoring: true,
    report_exports: true,
    ble_anomaly_detection: true,
    remote_dashboard: true,
    forensic_encryption: true,
    priority_support: true
  }
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { metricType } = await req.json();

        const tier = user.subscription_tier || 'free';
        const limits = TIER_LIMITS[tier];
        const usage = user.usage_current_period || {};

        const currentUsage = usage[metricType] || 0;
        const limit = limits[`max_${metricType}`] || 0;

        const canUse = limit === -1 || currentUsage < limit;
        const remaining = limit === -1 ? -1 : Math.max(0, limit - currentUsage);

        return Response.json({
            canUse,
            currentUsage,
            limit,
            remaining,
            tier,
            limitExceeded: !canUse
        });

    } catch (error) {
        console.error('Usage check error:', error);
        return Response.json({
            error: 'Failed to check usage',
            message: error.message
        }, { status: 500 });
    }
});