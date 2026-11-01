import {
    incrementUsageCounter,
    isValidUsageIncrement,
    VALID_USAGE_METRICS
} from '../helpers/usage.ts';

Deno.test('usage increments accept supported counters and positive finite numbers', () => {
    for (const metric of VALID_USAGE_METRICS) {
        if (!isValidUsageIncrement(metric, 1) || !isValidUsageIncrement(metric, 0.25)) {
            throw new Error(`Expected ${metric} to accept positive finite increments`);
        }
    }
});

Deno.test('usage increments reject unsupported counters and invalid amounts', () => {
    for (const metric of ['unknown', '__proto__', 'toString', '', null, {}]) {
        if (isValidUsageIncrement(metric, 1)) {
            throw new Error(`Expected unsupported metric ${String(metric)} to be rejected`);
        }
    }

    for (const amount of [0, -1, NaN, Infinity, -Infinity, '1', null, undefined]) {
        if (isValidUsageIncrement('scans_per_month', amount)) {
            throw new Error(`Expected invalid amount ${String(amount)} to be rejected`);
        }
    }
});

Deno.test('usage increments use atomic updateMany operators for each metric', async () => {
    const user = { usage_current_period: { scans_per_month: 2, evidence_mb: 5 } };
    const updates = [];
    const userEntity = {
        async update() {
            throw new Error('plain update must not replace the usage snapshot');
        },
        async updateMany(query, update) {
            if (query.id !== 'user-1') throw new Error('Unexpected user ID');
            updates.push(update);
            for (const [path, amount] of Object.entries(update.$inc)) {
                const [, metric] = path.split('.');
                user.usage_current_period[metric] =
                    (user.usage_current_period[metric] || 0) + amount;
            }
            return { updatedCount: 1 };
        },
        async get(userId) {
            if (userId !== 'user-1') throw new Error('Unexpected user ID');
            return structuredClone(user);
        }
    };

    await Promise.all([
        incrementUsageCounter(userEntity, 'user-1', 'scans_per_month', 1),
        incrementUsageCounter(userEntity, 'user-1', 'scans_per_month', 1),
        incrementUsageCounter(userEntity, 'user-1', 'evidence_mb', 2)
    ]);

    if (user.usage_current_period.scans_per_month !== 4
        || user.usage_current_period.evidence_mb !== 7
        || updates.some(update => !update.$inc || update.usage_current_period)) {
        throw new Error('Expected atomic counter updates without replacing the usage snapshot');
    }
});
