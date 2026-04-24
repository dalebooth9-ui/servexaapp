// Tests for the shared requireEnv / missingEnvResponse helpers used by
// send-whatsapp, whatsapp-webhook, send-engineer-onboarding, send-test-reminder,
// send-weekly-report and test-resend-email edge functions.
//
// These simulate missing TWILIO_ACCOUNT_SID / RESEND_API_KEY and assert that
// the standard error response is HTTP 503 with:
//   { error: "missing_configuration", missing: [...] }

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MissingEnvError,
  missingEnvResponse,
  requireEnv,
} from "./requireEnv.ts";

const TWILIO_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_NUMBER",
] as const;

const RESEND_KEYS = ["RESEND_API_KEY"] as const;

const ALL_KEYS = [...TWILIO_KEYS, ...RESEND_KEYS, "LOVABLE_API_KEY"];

/** Snapshot + clear env vars under test, restore after the test runs. */
function withClearedEnv<T>(keys: string[], fn: () => T | Promise<T>): Promise<T> {
  const snapshot = new Map<string, string | undefined>();
  for (const k of keys) {
    snapshot.set(k, Deno.env.get(k));
    Deno.env.delete(k);
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of snapshot) {
        if (v === undefined) Deno.env.delete(k);
        else Deno.env.set(k, v);
      }
    });
}

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

Deno.test("requireEnv throws MissingEnvError listing TWILIO_ACCOUNT_SID when absent", async () => {
  await withClearedEnv([...ALL_KEYS], () => {
    // Provide the other Twilio creds so only TWILIO_ACCOUNT_SID is missing.
    Deno.env.set("TWILIO_AUTH_TOKEN", "token");
    Deno.env.set("TWILIO_WHATSAPP_NUMBER", "+1234567890");

    let caught: unknown;
    try {
      requireEnv(TWILIO_KEYS);
    } catch (e) {
      caught = e;
    }
    assert(caught instanceof MissingEnvError, "expected MissingEnvError");
    assertEquals((caught as MissingEnvError).missing, ["TWILIO_ACCOUNT_SID"]);
  });
});

Deno.test("missingEnvResponse returns 503 + missing_configuration for missing TWILIO_ACCOUNT_SID", async () => {
  await withClearedEnv([...ALL_KEYS], async () => {
    Deno.env.set("TWILIO_AUTH_TOKEN", "token");
    Deno.env.set("TWILIO_WHATSAPP_NUMBER", "+1234567890");

    let err: unknown;
    try {
      requireEnv(TWILIO_KEYS);
    } catch (e) {
      err = e;
    }
    const res = missingEnvResponse(err, corsHeaders);
    assertExists(res, "expected a Response");
    assertEquals(res!.status, 503);
    assertEquals(res!.headers.get("content-type"), "application/json");
    assertEquals(res!.headers.get("access-control-allow-origin"), "*");

    const body = await res!.json();
    assertEquals(body.error, "missing_configuration");
    assertEquals(body.missing, ["TWILIO_ACCOUNT_SID"]);
  });
});

Deno.test("missingEnvResponse returns 503 + missing_configuration for missing RESEND_API_KEY", async () => {
  await withClearedEnv([...ALL_KEYS], async () => {
    let err: unknown;
    try {
      requireEnv(RESEND_KEYS);
    } catch (e) {
      err = e;
    }
    const res = missingEnvResponse(err, corsHeaders);
    assertExists(res);
    assertEquals(res!.status, 503);

    const body = await res!.json();
    assertEquals(body.error, "missing_configuration");
    assertEquals(body.missing, ["RESEND_API_KEY"]);
  });
});

Deno.test("missingEnvResponse lists ALL missing keys (LOVABLE_API_KEY + RESEND_API_KEY)", async () => {
  await withClearedEnv([...ALL_KEYS], async () => {
    let err: unknown;
    try {
      requireEnv(["LOVABLE_API_KEY", "RESEND_API_KEY"] as const);
    } catch (e) {
      err = e;
    }
    const res = missingEnvResponse(err, corsHeaders);
    assertExists(res);
    assertEquals(res!.status, 503);

    const body = await res!.json();
    assertEquals(body.error, "missing_configuration");
    assertEquals(body.missing, ["LOVABLE_API_KEY", "RESEND_API_KEY"]);
  });
});

Deno.test("missingEnvResponse returns null for non-MissingEnvError", () => {
  const res = missingEnvResponse(new Error("something else"), corsHeaders);
  assertEquals(res, null);
});

Deno.test("requireEnv treats whitespace-only values as missing", async () => {
  await withClearedEnv([...ALL_KEYS], () => {
    Deno.env.set("RESEND_API_KEY", "   ");
    let caught: unknown;
    try {
      requireEnv(RESEND_KEYS);
    } catch (e) {
      caught = e;
    }
    assert(caught instanceof MissingEnvError);
    assertEquals((caught as MissingEnvError).missing, ["RESEND_API_KEY"]);
  });
});
