import assert from "node:assert/strict";
import test from "node:test";
import { fetchBoundedResponse } from "../helpers/boundedFetch.ts";

test("fetchBoundedResponse aborts a fetch that exceeds its deadline", async () => {
  await assert.rejects(
    fetchBoundedResponse(new URL("https://example.test/evidence"), {
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
