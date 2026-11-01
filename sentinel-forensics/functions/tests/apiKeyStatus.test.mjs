import assert from "node:assert/strict";
import test from "node:test";
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
