// Resolve the configured "From" header for a given email type.
// Reads from public.email_from_settings (managed in Settings UI).
// Falls back to the provided default if no row exists or the lookup fails.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const FALLBACK_FROM = "Servexa <noreply@vivafire.co.uk>";

function buildFrom(name: string | null | undefined, address: string): string {
  const addr = (address || "").trim();
  const nm = (name || "").trim();
  if (!addr) return FALLBACK_FROM;
  return nm ? `${nm} <${addr}>` : addr;
}

export async function getFromAddress(
  emailType: string,
  fallback: string = FALLBACK_FROM,
  client?: SupabaseClient,
): Promise<string> {
  try {
    const supabase = client ?? createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data } = await supabase
      .from("email_from_settings")
      .select("email_type, from_name, from_address")
      .in("email_type", [emailType, "default"]);

    if (data && data.length) {
      const exact = (data as any[]).find((r) => r.email_type === emailType);
      const def = (data as any[]).find((r) => r.email_type === "default");
      const row = exact ?? def;
      if (row?.from_address) return buildFrom(row.from_name, row.from_address);
    }
  } catch (err) {
    console.error(`[emailFrom] lookup failed for ${emailType}:`, err);
  }
  return fallback;
}
