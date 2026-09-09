// Shared HMAC-signed OAuth state helpers.
//
// The state parameter must survive a round trip through a third-party
// authorisation server, so it cannot be trusted on the way back unless it is
// signed. We sign a small JSON payload with the provider's client secret and
// verify both the signature and the age on return.

const enc = new TextEncoder();

async function hmacKey(secret: string, usage: "sign" | "verify") {
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signState(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const body = JSON.stringify({ ...payload, ts: Date.now() });
  const key = await hmacKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return btoa(body + "|" + sigB64);
}

export async function verifyState<T = Record<string, unknown>>(
  state: string,
  secret: string,
  maxAgeMs = 15 * 60 * 1000,
): Promise<T> {
  const decoded = atob(state);
  const pipeIdx = decoded.lastIndexOf("|");
  if (pipeIdx === -1) throw new Error("Malformed state");

  const body = decoded.substring(0, pipeIdx);
  const sigB64 = decoded.substring(pipeIdx + 1);

  const key = await hmacKey(secret, "verify");
  const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(body));
  if (!valid) throw new Error("Invalid state signature");

  const parsed = JSON.parse(body);
  if (Date.now() - (parsed.ts || 0) > maxAgeMs) throw new Error("State expired");
  return parsed as T;
}
