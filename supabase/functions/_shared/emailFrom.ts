// Resolve the configured "From" header for a given email type.
// Reads from public.email_from_settings (managed in Settings UI).
// Falls back to the provided default if no row exists or the lookup fails.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const FALLBACK_FROM = "Servexa <noreply@vivafire.co.uk>";

function buildFrom(name: string | null | undefined, address: string): string {
  const cleanAddr = (address || "").trim();
  const cleanName = (name || "").trim();
  if (!cleanAddr) return FALLBACK_FROM;
  if (!cleanName) return cleanAddr;
  return `${cleanName} <${cleanAddr}>`;
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
      .select("from_name, from_address")
      .in("email_type", [emailType, "default"]);

    if (data && data.length) {
      const match = data.find((r: any) => r.email_type === emailType) ?? data[0];
      // The .in() loses ordering; re-find explicitly:
      const exact = (data as any[]).find((r) => true && r.from_address);
      const row = (data as any[]).find((r) => r) && (
        (data as any[]).find((r: any) => r.from_address && (r.email_type === emailType)) ||
        (data as any[]).find((r: any) => r.from_address)
      );
      if (row) return buildFrom(row.from_name, row.from_address);
      if (match) return buildFrom(match.from_name, match.from_address);
      if (exact) return buildFrom(exact.from_name, exact.from_address);
    }
  } catch (err) {
    console.error(`[emailFrom] lookup failed for ${emailType}:`, err);
  }
  return fallback;
}
