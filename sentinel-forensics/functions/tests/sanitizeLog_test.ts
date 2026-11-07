import { sanitizeForLog } from "../helpers/sanitizeLog.ts";

Deno.test("sanitizeForLog redacts camel-case API keys", () => {
  const sanitized = sanitizeForLog({ apiKey: "sensitive-value" });
  if (sanitized.apiKey !== "[REDACTED]") {
    throw new Error("Camel-case API keys must be redacted");
  }
});
