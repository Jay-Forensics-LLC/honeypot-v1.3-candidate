import assert from "node:assert/strict";
import test from "node:test";
import { findGuardianTokens, parseGuardianTokenInput } from "../helpers/guardianTokenInput.ts";

test("guardian token input rejects invalid values before entity access", async () => {
  let calls = 0;
  const entity = {
    async filter() {
      calls += 1;
      return [];
    }
  };
  for (const value of [
    null,
    [],
    { token: { $ne: null }, case_id: "case-1" },
    { token: ["token"], case_id: "case-1" },
    { token: "token", case_id: { $ne: null } },
    { token: "token", case_id: ["case-1"] },
    { token: 123, case_id: "case-1" },
    { token: "token", case_id: 123 },
    { token: "", case_id: "case-1" },
    { token: "token", case_id: "   " }
  ]) {
    assert.equal(parseGuardianTokenInput(value), null);
    assert.equal(await findGuardianTokens(value, entity), null);
  }
  assert.equal(calls, 0);
});

test("guardian token input preserves exact valid strings", () => {
  assert.deepEqual(
    parseGuardianTokenInput({ token: "token-1", case_id: "case-1" }),
    { token: "token-1", case_id: "case-1" }
  );
});

test("guardian token lookup uses exact capability values", async () => {
  let query;
  const result = await findGuardianTokens(
    { token: "token-1", case_id: "case-1" },
    {
      async filter(value) {
        query = value;
        return [];
      }
    }
  );

  assert.deepEqual(query, { token_hash: "token-1", case_id: "case-1", revoked: false });
  assert.deepEqual(result.input, { token: "token-1", case_id: "case-1" });
});
