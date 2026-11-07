import assert from "node:assert/strict";
import test from "node:test";
import { createOrgFilter } from "../helpers/orgContext.ts";

test("createOrgFilter keeps the authenticated organization when filters override it", () => {
  const filter = createOrgFilter(
    { organization_id: "authenticated-org" },
    { organization_id: "other-org", status: "active" }
  );

  assert.deepEqual(filter, {
    organization_id: "authenticated-org",
    status: "active"
  });
});
