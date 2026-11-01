export const VALID_USAGE_METRICS = ['scans_per_month', 'evidence_mb', 'devices'] as const;

export function isValidUsageIncrement(metricType: unknown, amount: unknown): boolean {
    return typeof metricType === 'string'
        && VALID_USAGE_METRICS.includes(metricType as typeof VALID_USAGE_METRICS[number])
        && typeof amount === 'number'
        && Number.isFinite(amount)
        && amount > 0;
}
