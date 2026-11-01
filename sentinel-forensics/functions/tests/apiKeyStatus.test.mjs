import assert from "node:assert/strict";
import test from "node:test";
import { getOrganizationApiKeyFilter, getToggleApiKeyStatus } from "../helpers/apiKeyStatus.ts";

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
