import assert from "node:assert/strict";
import test from "node:test";
import { incrementUsageCounter } from "../helpers/usage.ts";

test("usage increments are atomic and preserve concurrent metric updates", async () => {
  const usage = { scans_per_month: 2, evidence_mb: 5 };
  const updates = [];
  const userEntity = {
    async update(userId, update) {
      assert.equal(userId, "user-1");
      updates.push(update);
      await new Promise(resolve => setTimeout(resolve, 0));
      for (const [path, amount] of Object.entries(update.$inc)) {
        const metric = path.split(".")[1];
        usage[metric] = (usage[metric] || 0) + amount;
      }
      return { usage_current_period: { ...usage } };
    }
  };

  await Promise.all([
    incrementUsageCounter(userEntity, "user-1", "scans_per_month", 1),
    incrementUsageCounter(userEntity, "user-1", "scans_per_month", 1),
    incrementUsageCounter(userEntity, "user-1", "evidence_mb", 2)
  ]);

  assert.deepEqual(usage, { scans_per_month: 4, evidence_mb: 7 });
  assert.deepEqual(updates, [
    { $inc: { "usage_current_period.scans_per_month": 1 } },
    { $inc: { "usage_current_period.scans_per_month": 1 } },
    { $inc: { "usage_current_period.evidence_mb": 2 } }
  ]);
});
