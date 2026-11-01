import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ATOMIC_ENTITY_SDK } from "../helpers/usage.ts";
import {
  getApiKeyStatusTransitionFilter,
  getOrganizationApiKeyFilter,
  getToggleApiKeyStatus,
  transitionApiKeyStatus
} from "../helpers/apiKeyStatus.ts";

test("API key lookups include the authenticated organization", () => {
  assert.deepEqual(
    getOrganizationApiKeyFilter({ organization_id: "org-a" }, "key-1"),
    { id: "key-1", organization_id: "org-a" }
  );
  assert.equal(getOrganizationApiKeyFilter({}, "key-1"), null);
});

test("API keys can transition only between active and disabled", () => {
  assert.equal(getToggleApiKeyStatus("active", false), "disabled");
  assert.equal(getToggleApiKeyStatus("disabled", true), "active");
  assert.equal(getToggleApiKeyStatus("revoked", true), null);
  assert.equal(getToggleApiKeyStatus("expired", true), null);
});

test("API key status transitions compare the organization and observed status", () => {
  assert.deepEqual(
    getApiKeyStatusTransitionFilter({ id: "key-1", organization_id: "org-a" }, "disabled"),
    { id: "key-1", organization_id: "org-a", status: "disabled" }
  );
});

test("a stale enable cannot overwrite a revoked key", async () => {
  const key = { id: "key-1", organization_id: "org-a", status: "disabled" };
  const entity = {
    async updateMany(filter, update) {
      if (filter.id !== key.id
        || filter.organization_id !== key.organization_id
        || filter.status !== key.status) {
        return { updatedCount: 0 };
      }
      key.status = update.$set.status;
      return { updatedCount: 1 };
    }
  };
  const observedStatus = key.status;
  key.status = "revoked";

  assert.equal(
    await transitionApiKeyStatus(
      entity,
      { id: key.id, organization_id: key.organization_id },
      observedStatus,
      "active"
    ),
    false
  );
  assert.equal(key.status, "revoked");
});

test("status transitions accept a Mongo modifiedCount of one", async () => {
  let writes = 0;
  const applied = await transitionApiKeyStatus({
    async updateMany() {
      writes += 1;
      return { matchedCount: 1, modifiedCount: 1 };
    }
  }, { id: "key-1", organization_id: "org-a" }, "disabled", "active");
  assert.equal(applied, true);
  assert.equal(writes, 1);
  const missed = await transitionApiKeyStatus({
    async updateMany() {
      return { matchedCount: 0, modifiedCount: 0 };
    }
  }, { id: "key-1", organization_id: "org-a" }, "disabled", "active");
  assert.equal(missed, false);
});

test("status transitions fail closed without atomic updateMany", async () => {
  await assert.rejects(
    () => transitionApiKeyStatus(
      { async update() { throw new Error("must not use unconditional update"); } },
      { id: "key-1", organization_id: "org-a" },
      "disabled",
      "active"
    ),
    /atomic updateMany/
  );
});

test("toggle endpoint loads an SDK that provides conditional updates", () => {
  const source = readFileSync(new URL("../toggleApiKey.ts", import.meta.url), "utf8");
  const specifier = source.match(/from '([^']+)'/)[1];
  const match = specifier.match(/npm:@base44\/sdk@(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, specifier);
  const actual = match.slice(1).map(Number);
  const required = ATOMIC_ENTITY_SDK.split(".").map(Number);
  for (let index = 0; index < required.length; index += 1) {
    if (actual[index] > required[index]) return;
    assert.ok(actual[index] >= required[index], `${specifier} is older than ${ATOMIC_ENTITY_SDK}`);
  }
});
