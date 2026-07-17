import { supabase } from "@/integrations/supabase/client";

export type IntakeMisdropInput = {
  source: "po_import" | "scan_paper_report";
  detected_kind: "purchase_order" | "job_sheet" | "unknown";
  action: "redirected" | "continued" | "dismissed";
  file_name?: string | null;
  reason?: string | null;
};

/**
 * Best-effort logging of a document intake misdrop (a PO dropped on the scan
 * intake or a completed job sheet dropped on the PO intake). Never throws —
 * intake flows must never break because of the log.
 */
export async function logIntakeMisdrop(input: IntakeMisdropInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const orgId = (profile as any)?.org_id;
    if (!orgId) return;
    await supabase.from("intake_misdrop_log" as any).insert({
      org_id: orgId,
      user_id: user.id,
      source: input.source,
      detected_kind: input.detected_kind,
      action: input.action,
      file_name: input.file_name ?? null,
      reason: input.reason ?? null,
    });
  } catch (err) {
    console.warn("logIntakeMisdrop failed", err);
  }
}
