import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ATOMIC_ENTITY_SDK, incrementUsageCounter } from "../helpers/usage.ts";

function sdkAtLeast(specifier, minimum) {
  const match = specifier.match(/npm:@base44\/sdk@(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, specifier);
  const actual = match.slice(1).map(Number);
  const required = minimum.split(".").map(Number);
  for (let index = 0; index < required.length; index += 1) {
    if (actual[index] > required[index]) return;
    assert.ok(actual[index] >= required[index], `${specifier} is older than ${minimum}`);
  }
}

test("usage increments apply through atomic updateMany operators", async () => {
  const usage = { scans_per_month: 2, evidence_mb: 5 };
  const calls = [];
  const userEntity = {
    async update() {
      throw new Error("plain update must not replace the usage snapshot");
    },
    async updateMany(query, update) {
      calls.push({ query, update });
      for (const [path, amount] of Object.entries(update.$inc)) {
        const metric = path.split(".")[1];
        usage[metric] = (usage[metric] || 0) + amount;
      }
      return { updatedCount: 1 };
    },
    async get(userId) {
      assert.equal(userId, "user-1");
      return { id: userId, usage_current_period: { ...usage } };
    }
  };

  await Promise.all([
    incrementUsageCounter(userEntity, "user-1", "scans_per_month", 1),
    incrementUsageCounter(userEntity, "user-1", "scans_per_month", 1),
    incrementUsageCounter(userEntity, "user-1", "evidence_mb", 2)
  ]);

  assert.deepEqual(usage, { scans_per_month: 4, evidence_mb: 7 });
  assert.deepEqual(calls.map(call => call.update), [
    { $inc: { "usage_current_period.scans_per_month": 1 } },
    { $inc: { "usage_current_period.scans_per_month": 1 } },
    { $inc: { "usage_current_period.evidence_mb": 2 } }
  ]);
  assert.ok(calls.every(call => call.query.id === "user-1" && !("usage_current_period" in call.query)));
});

test("usage increment fails closed without an atomic writer", async () => {
  await assert.rejects(
    () => incrementUsageCounter({ async update() { return {}; } }, "user-1", "scans_per_month", 1),
    /atomic updateMany/
  );
  await assert.rejects(
    () => incrementUsageCounter({
      async updateMany() { return { updatedCount: 0 }; },
      async get() { throw new Error("must not read after a missed write"); }
    }, "user-1", "scans_per_month", 1),
    /exactly one user record/
  );
});

test("usage endpoint loads an SDK that can apply Mongo operators", () => {
  const source = readFileSync(new URL("../incrementUsage.ts", import.meta.url), "utf8");
  const specifier = source.match(/from '([^']+)'/)[1];
  sdkAtLeast(specifier, ATOMIC_ENTITY_SDK);
});
