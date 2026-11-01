import assert from "node:assert/strict";
import test from "node:test";
import { findApiKeyInOrganization, getApiKeyToggleStatus } from "../helpers/apiKeyScope.ts";
import { readApiKeyUsageFilters } from "../helpers/apiKeyUsage.ts";
import { serializeCsv } from "../helpers/csv.ts";
import { sanitizeCVEInput } from "../helpers/cveInput.ts";
import { fetchBoundedResponse, readBoundedResponse, ResponseTooLargeError } from "../helpers/boundedFetch.ts";

test("API key lookup always scopes by the authenticated organization", async () => {
  let filter;
  const base44 = {
    asServiceRole: {
      entities: {
        ApiKey: {
          filter: async (value) => {
            filter = value;
            return [{ id: "key-1", organization_id: "org-1", status: "active" }];
          }
        }
      }
    }
  };

  const key = await findApiKeyInOrganization(base44, "key-1", "org-1");
  assert.equal(key.organization_id, "org-1");
  assert.deepEqual(filter, { id: "key-1", organization_id: "org-1" });
  assert.equal(getApiKeyToggleStatus(key, false), "disabled");
  assert.equal(getApiKeyToggleStatus({ status: "revoked" }, true), null);
});

test("API key usage filters accept function invocation bodies", async () => {
  const req = new Request("https://example.test/functions/getApiKeyUsage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKeyId: "key-1" })
  });

  assert.deepEqual(await readApiKeyUsageFilters(req), {
    apiKeyId: "key-1",
    statusCode: null,
    rateLimitAction: null,
    limit: "100"
  });
});

test("CSV output quotes commas, quotes, and embedded newlines", () => {
  assert.equal(
    serializeCsv([["Type", "Description"], ["note", 'a, "quoted"\nline']]),
    '"Type","Description"\r\n"note","a, ""quoted""\nline"'
  );
});

test("CVE input is validated, whitelisted, and sanitized", () => {
  const result = sanitizeCVEInput({
    cve_id: "cve-2025-12345",
    severity: "HIGH",
    cvss_score: 9.1,
    description: "<script>alert(1)</script>Reviewed finding",
    organization_id: "attacker-org"
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.sanitized, {
    cve_id: "CVE-2025-12345",
    severity: "high",
    cvss_score: 9.1,
    description: "Reviewed finding"
  });
  assert.equal(sanitizeCVEInput({ cve_id: "not-a-cve" }).isValid, false);
  assert.equal(sanitizeCVEInput({ cve_id: "CVE-2025-12345", cvss_score: 11 }).isValid, false);
});

test("bounded response reader rejects oversized and accepts bounded bodies", async () => {
  const oversized = new Response(new Uint8Array([1, 2, 3]));
  await assert.rejects(readBoundedResponse(oversized, 2), ResponseTooLargeError);

  const valid = await readBoundedResponse(new Response(new Uint8Array([1, 2])), 2);
  assert.deepEqual([...valid], [1, 2]);
});

test("bounded fetch applies an abort deadline", async () => {
  await assert.rejects(
    fetchBoundedResponse("https://example.test/file", {
      maxBytes: 10,
      timeoutMs: 1,
      fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      })
    }),
    { name: "AbortError" }
  );
});
