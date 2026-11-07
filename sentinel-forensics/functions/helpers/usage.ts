export const VALID_USAGE_METRICS = ['scans_per_month', 'evidence_mb', 'devices'] as const;

// Entity.update() is a field PUT. Mongo operators such as $inc are applied only
// by updateMany, which the Base44 SDK provides from 0.8.30.
export const ATOMIC_ENTITY_SDK = '0.8.30';

export function isValidUsageIncrement(metricType: unknown, amount: unknown): boolean {
    return typeof metricType === 'string'
        && (VALID_USAGE_METRICS as readonly string[]).includes(metricType)
        && typeof amount === 'number'
        && Number.isFinite(amount)
        && amount > 0;
}

export function usageIncrementOperators(metricType: string, amount: number) {
    return { $inc: { [`usage_current_period.${metricType}`]: amount } };
}

export function conditionalWriteCount(result: unknown): number | null {
    if (Array.isArray(result)) {
        return result.length;
    }
    if (!result || typeof result !== 'object') {
        return null;
    }
    const record = result as Record<string, unknown>;
    for (const key of ['updatedCount', 'modifiedCount', 'nModified']) {
        if (typeof record[key] === 'number') {
            return record[key] as number;
        }
    }
    return null;
}

export async function incrementUsageCounter(userEntity, userId, metricType, amount) {
    if (typeof userEntity?.updateMany !== 'function') {
        throw new Error('Usage increments require atomic updateMany');
    }
    const result = await userEntity.updateMany(
        { id: userId },
        usageIncrementOperators(metricType, amount)
    );
    if (conditionalWriteCount(result) !== 1) {
        throw new Error('Usage increment did not update exactly one user record');
    }
    const updatedUser = await userEntity.get(userId);
    return updatedUser?.usage_current_period?.[metricType];
}
