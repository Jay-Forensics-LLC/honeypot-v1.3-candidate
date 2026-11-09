import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../sendNotification.ts", import.meta.url), "utf8");

function createHandler(user, recipients) {
  let handler;
  const calls = { filters: [], notifications: [] };
  const base44 = {
    auth: { me: async () => user },
    asServiceRole: {
      entities: {
        User: {
          async filter(filter) {
            calls.filters.push(filter);
            return recipients;
          }
        },
        Notification: {
          async create(notification) {
            calls.notifications.push(notification);
            return { id: "notification-1" };
          }
        },
        AuditLog: { async create() {} }
      }
    }
  };

  vm.runInNewContext(
    source.replace(/^import .*;\s*/m, ""),
    {
      Deno: { serve: callback => { handler = callback; } },
      Response,
      crypto: globalThis.crypto,
      createClientFromRequest: () => base44
    }
  );

  return {
    calls,
    invoke: body => handler({
      json: async () => body,
      headers: { get: () => null }
    })
  };
}

test("sendNotification requires organization context and a recipient before lookup", async () => {
  const noOrganization = createHandler({ email: "sender@example.com" }, []);
  const organizationResponse = await noOrganization.invoke({ userEmail: "recipient@example.com" });
  assert.equal(organizationResponse.status, 403);
  assert.equal(noOrganization.calls.filters.length, 0);

  const noRecipient = createHandler({ organization_id: "org-1" }, []);
  const recipientResponse = await noRecipient.invoke({ userEmail: { $ne: null } });
  assert.equal(recipientResponse.status, 400);
  assert.equal(noRecipient.calls.filters.length, 0);
});

test("sendNotification rejects a recipient outside the authenticated organization", async () => {
  const { calls, invoke } = createHandler(
    { organization_id: "org-1" },
    [{ email: "recipient@example.com", organization_id: "org-2" }]
  );
  const response = await invoke({ userEmail: "recipient@example.com" });

  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.filters)), [{
    email: "recipient@example.com",
    organization_id: "org-1"
  }]);
  assert.equal(calls.notifications.length, 0);
});

test("sendNotification creates a notification for a same-organization recipient", async () => {
  const { calls, invoke } = createHandler(
    { organization_id: "org-1" },
    [{ email: "recipient@example.com", organization_id: "org-1" }]
  );
  const response = await invoke({ userEmail: "recipient@example.com", title: "Test" });

  assert.equal(response.status, 200);
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].user_email, "recipient@example.com");
  assert.equal(calls.notifications[0].organization_id, "org-1");
});
