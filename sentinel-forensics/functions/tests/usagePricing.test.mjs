import assert from "node:assert/strict";
import test from "node:test";
import { getSafeUsageCostCents } from "../helpers/usagePricing.ts";

test("usage charges are rounded only when the result is a safe integer", () => {
  assert.equal(getSafeUsageCostCents(2, 500), 1000);
  assert.equal(getSafeUsageCostCents(Number.MAX_VALUE, 2500), null);
});
