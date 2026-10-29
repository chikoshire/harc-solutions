import { assertEquals } from "jsr:@std/assert";
import { resolveColdLeadRecipientEmail } from "./contactEmail.ts";

Deno.test("resolveColdLeadRecipientEmail returns trimmed email", () => {
  assertEquals(resolveColdLeadRecipientEmail("  a@b.com  "), "a@b.com");
});

Deno.test("resolveColdLeadRecipientEmail rejects empty and whitespace", () => {
  assertEquals(resolveColdLeadRecipientEmail(""), null);
  assertEquals(resolveColdLeadRecipientEmail("   "), null);
  assertEquals(resolveColdLeadRecipientEmail(null), null);
  assertEquals(resolveColdLeadRecipientEmail(undefined), null);
});
