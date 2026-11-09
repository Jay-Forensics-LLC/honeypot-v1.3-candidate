import assert from "node:assert/strict";
import test from "node:test";
import { encodeCsvRow } from "../helpers/csv.ts";

test("encodeCsvRow quotes commas, quotes, and embedded newlines", () => {
  assert.equal(encodeCsvRow(["plain", 'two, "quoted"\nlines']), 'plain,"two, ""quoted""\nlines"');
});
