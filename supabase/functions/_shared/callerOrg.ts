// Resolves the signed-in caller and their company for service-role functions.
import { createClient } from "npm:@supabase/supabase-js@2";

export type Caller = { userId: string; orgId: string; isAdmin: boolean; admin: any };

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
  // Admin rights count only inside the caller's own company.
  const { data: roleRow } = await (admin as any).from("user_roles").select("role").eq("user_id", userId).eq("org_id", orgId).eq("role", "admin").maybeSingle();
  const { data: owner } = await (admin as any).from("organisation_members").select("role").eq("user_id", userId).eq("org_id", orgId).in("role", ["owner", "admin"]).eq("status", "active").maybeSingle();
  return { userId, orgId: orgId as string, isAdmin: !!roleRow || !!owner, admin };
}

/** True when the record exists and belongs to the caller's company. */
export async function ownsRecord(c: Caller, table: string, id: unknown): Promise<boolean> {
  if (typeof id !== "string" || !id) return false;
  const { data } = await (c.admin as any).from(table).select("org_id").eq("id", id).maybeSingle();
  return !!data && data.org_id === c.orgId;
}

/** True when the user is a member of the caller's company. */
export async function sharesCompany(c: Caller, userId: unknown): Promise<boolean> {
  if (typeof userId !== "string" || !userId) return false;
  const { data } = await (c.admin as any).from("profiles").select("org_id").eq("user_id", userId).maybeSingle();
  if (data?.org_id === c.orgId) return true;
  const { data: m } = await (c.admin as any).from("organisation_members").select("org_id").eq("user_id", userId).eq("org_id", c.orgId).maybeSingle();
  return !!m;
}
