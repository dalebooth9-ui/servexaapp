// Resolves the signed-in caller and their company for service-role functions.
import { createClient } from "npm:@supabase/supabase-js@2";

export type Caller = { userId: string; orgId: string; isAdmin: boolean; admin: ReturnType<typeof createClient> };

export async function resolveCaller(req: Request): Promise<Caller | { error: string; status: number }> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { error: "Sign in required", status: 401 };
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getClaims(auth.slice(7));
  const userId = data?.claims?.sub as string | undefined;
  if (error || !userId || data?.claims?.role !== "authenticated") return { error: "Sign in required", status: 401 };
  const { data: orgId } = await userClient.rpc("get_user_org_id");
  if (!orgId) return { error: "Your account is not part of a company", status: 403 };
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  return { userId, orgId: orgId as string, isAdmin: !!isAdmin, admin };
}
