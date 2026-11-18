import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { findLookAlike, normaliseName } from "@/lib/similarName";
import { loadSiteNamesForCheck } from "@/lib/quickAddSite";

export type LookAlikeKind = "customer" | "site";
export type NamedRow = { id: string; name: string };

/** Existing customers or sites to compare a typed name against (RLS keeps it to the user's company). */
export async function loadNamesForCheck(kind: LookAlikeKind): Promise<NamedRow[]> {
  if (kind === "site") return loadSiteNamesForCheck(null);
  const out: NamedRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("customers").select("id, name").order("name").range(from, from + 999);
    out.push(...((data || []) as NamedRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Final safety-net check used on Create. */
export async function findExistingLookAlike(kind: LookAlikeKind, name: string): Promise<NamedRow | null> {
  if (normaliseName(name).replace(/ /g, "").length < 3) return null;
  return findLookAlike(name, await loadNamesForCheck(kind));
}

/** Live check while typing (after 3 characters). Never merges anything. */
export function useLookAlike(kind: LookAlikeKind, name: string, enabled = true) {
  const [rows, setRows] = useState<NamedRow[] | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || rows) return;
    let live = true;
    loadNamesForCheck(kind).then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, [enabled, kind, rows]);
  const ready = enabled && rows && normaliseName(name).replace(/ /g, "").length >= 3;
  const match = ready ? findLookAlike(name, rows!) : null;
  return {
    match: match && match.id !== dismissed ? match : null,
    dismiss: (id: string) => setDismissed(id),
    reset: () => { setDismissed(null); setRows(null); },
    isDismissed: (id: string) => dismissed === id,
  };
}

export function LookAlikeNotice({ match, onUse, onDifferent }: { match: NamedRow; onUse: () => void; onDifferent: () => void }) {
  return (
    <div role="alert" className="mt-2 space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="text-sm font-medium">This looks like “{match.name}”. Use that one?</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onUse}>Use “{match.name}”</Button>
        <Button type="button" size="sm" variant="outline" onClick={onDifferent}>No, this is different</Button>
      </div>
    </div>
  );
}
