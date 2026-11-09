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

test("API-key usage filters reject incomplete, non-positive, and unsafe limits", () => {
  for (const limit of [-1, 0, "not-a-number", "25junk", "1.5", 1.5, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseApiKeyUsageFilters(new URLSearchParams(), { limit }), null);
  }

  assert.deepEqual(
    parseApiKeyUsageFilters(new URLSearchParams("limit=25"), {}),
    { limit: 25 }
  );
  assert.deepEqual(
    parseApiKeyUsageFilters(new URLSearchParams(), { limit: Number.MAX_SAFE_INTEGER }),
    { limit: Number.MAX_SAFE_INTEGER }
  );
});
