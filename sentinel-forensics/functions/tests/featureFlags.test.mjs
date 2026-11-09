import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_USER, FEATURE_FLAGS, getDemoMessage } from "../../src/components/config/featureFlags.js";

test("demo compatibility exports default to authentication-safe settings", () => {
  assert.equal(FEATURE_FLAGS.PUBLIC_DEMO_MODE, false);
  assert.equal(FEATURE_FLAGS.STRIPE_STUBS, false);
  assert.equal(DEMO_USER.role, "user");
  assert.equal(getDemoMessage(), null);
});
