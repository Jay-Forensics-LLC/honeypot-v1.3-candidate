import { isValidUsageIncrement, VALID_USAGE_METRICS } from '../helpers/usage.ts';

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
