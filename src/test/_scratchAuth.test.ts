import { describe, it, expect } from "vitest";
import { supabase } from "@/integrations/supabase/client";

const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url");
const mk = (sub: string) => {
  const iat = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, aud: "authenticated", role: "authenticated", iat, exp: iat + 3600 })}.sig`;
};

describe("scratch", () => {
  it("seeds a session", async () => {
    const { error } = await supabase.auth.setSession({
      access_token: mk("00000000-0000-0000-0000-000000000001"),
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "refresh",
    } as any);
    console.log("SETERR>>", JSON.stringify(error));
    const { data, error: e2 } = await supabase.auth.getUser();
    console.log("GETUSER>>", JSON.stringify(e2), "uid:", data?.user?.id);
    expect(true).toBe(true);
  });
});
