// Shared helper to validate required environment variables in edge functions.
// Returns a typed object of values, or throws a descriptive error.
//
// Usage:
//   const { RESEND_API_KEY } = requireEnv(["RESEND_API_KEY"]);
//
// For HTTP handlers, prefer `requireEnvResponse` which returns a Response
// with a clear 503 error and CORS headers when keys are missing.

export class MissingEnvError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
      `Add ${missing.length > 1 ? "them" : "it"} in Lovable Cloud → Settings → Secrets and redeploy this function.`
    );
    this.name = "MissingEnvError";
    this.missing = missing;
  }
}

export function requireEnv<T extends string>(names: readonly T[]): Record<T, string> {
  const missing: string[] = [];
  const out = {} as Record<T, string>;
  for (const n of names) {
    const v = Deno.env.get(n);
    if (!v || v.trim() === "") missing.push(n);
    else out[n] = v;
  }
  if (missing.length) throw new MissingEnvError(missing);
  return out;
}

export function missingEnvResponse(
  err: unknown,
  corsHeaders: Record<string, string> = {}
): Response | null {
  if (!(err instanceof MissingEnvError)) return null;
  return new Response(
    JSON.stringify({
      error: "missing_configuration",
      message: err.message,
      missing: err.missing,
      hint:
        "This edge function cannot send messages until the listed secret(s) are configured. " +
        "Open Lovable Cloud → Settings → Secrets, add the missing key(s), then retry.",
    }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
