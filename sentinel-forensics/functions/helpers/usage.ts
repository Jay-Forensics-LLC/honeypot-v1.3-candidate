export const VALID_USAGE_METRICS = ['scans_per_month', 'evidence_mb', 'devices'] as const;

export function isValidUsageIncrement(metricType: unknown, amount: unknown): boolean {
    return typeof metricType === 'string'
        && VALID_USAGE_METRICS.includes(metricType as typeof VALID_USAGE_METRICS[number])
        && typeof amount === 'number'
        && Number.isFinite(amount)
        && amount > 0;
}

export async function incrementUsageCounter(userEntity, userId, metricType, amount) {
    const updatedUser = await userEntity.update(userId, {
        $inc: { [`usage_current_period.${metricType}`]: amount }
    });
    return updatedUser.usage_current_period?.[metricType];
}
