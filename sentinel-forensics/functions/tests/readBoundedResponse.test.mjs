import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedResponse } from "../helpers/readBoundedResponse.ts";

test("readBoundedResponse accepts a response within the limit", async () => {
  const bytes = await readBoundedResponse(new Response("safe"), 4);
  assert.equal(new TextDecoder().decode(bytes), "safe");
});

test("readBoundedResponse rejects oversized content-length", async () => {
  const response = new Response("too long", {
    headers: { "content-length": "8" }
  });

  await assert.rejects(readBoundedResponse(response, 4), /maximum allowed size/);
});

test("readBoundedResponse rejects streams that exceed the limit", async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.enqueue(new Uint8Array([4, 5, 6]));
      controller.close();
    }
  }));

  await assert.rejects(readBoundedResponse(response, 4), /maximum allowed size/);
});
