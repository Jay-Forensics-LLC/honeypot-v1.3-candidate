import assert from "node:assert/strict";
import test from "node:test";
import { parseApiKeyUsageFilters } from "../helpers/apiKeyUsageFilters.ts";

test("API-key usage filters accept function invocation body values", () => {
  assert.deepEqual(
    parseApiKeyUsageFilters(new URLSearchParams(), { apiKeyId: "selected-key" }),
    { apiKeyId: "selected-key", limit: 100 }
  );
});

test("API-key usage filters preserve GET query values and reject invalid IDs", () => {
  assert.deepEqual(
    parseApiKeyUsageFilters(new URLSearchParams("apiKeyId=query-key&statusCode=403"), {}),
    { apiKeyId: "query-key", statusCode: 403, limit: 100 }
  );
  assert.equal(parseApiKeyUsageFilters(new URLSearchParams(), { apiKeyId: {} }), null);
});
