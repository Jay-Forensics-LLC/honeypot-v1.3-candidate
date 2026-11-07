import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCVEInput } from "../helpers/cveInput.ts";

test("sanitizeCVEInput validates CVE identifiers and whitelists supported fields", () => {
  const result = sanitizeCVEInput({
    cve_id: " cve-2024-12345 ",
    vulnerability_name: "Example vulnerability",
    severity: "HIGH",
    cvss_score: 8.5,
    organization_id: "attacker-org"
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.sanitized, {
    cve_id: "CVE-2024-12345",
    vulnerability_name: "Example vulnerability",
    severity: "high",
    cvss_score: 8.5
  });
});

test("sanitizeCVEInput rejects malformed identifiers, scores, and reference URLs", () => {
  const result = sanitizeCVEInput({
    cve_id: "not-a-cve",
    cvss_score: Infinity,
    references: ["http://example.test"]
  });

  assert.equal(result.isValid, false);
  assert.equal(result.errors.length, 3);
});
