import assert from "node:assert/strict";
import test from "node:test";
import { isCaseLinkedToLegalMatter } from "../helpers/disclosure.ts";

test("disclosure evidence must belong to a linked forensic case", () => {
  const legalCase = { forensic_case_ids: ["case-1", "case-2"] };

  assert.equal(isCaseLinkedToLegalMatter(legalCase, "case-1"), true);
  assert.equal(isCaseLinkedToLegalMatter(legalCase, "case-other"), false);
  assert.equal(isCaseLinkedToLegalMatter({}, "case-1"), false);
});
