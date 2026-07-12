import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ImportEntity, ENTITY_SCHEMAS } from "./schemas";
import { transformRows } from "@/lib/importMapping";
import { fuzzyScore } from "@/lib/fuzzyMatch";
import type { ParsedFile } from "@/lib/importMapping";

export type RowAction = "create" | "merge" | "skip";
export interface ReviewRow {
  values: Record<string, string>;
  action: RowAction;
  mergeTargetId?: string | null;
  parentMatchId?: string | null;
  parentMatchName?: string;
  parentCandidates?: { id: string; name: string; extra?: string }[];
  problems: string[];
  duplicateOfExistingId?: string | null;
  duplicateOfName?: string;
}

interface ExistingRecord { id: string; name: string; postcode?: string; address?: string; }

export default function StepReview({
  entity,
  parsed,
  mapping,
  reviewRows,
  setReviewRows,
}: {
  entity: ImportEntity;
  parsed: ParsedFile;
  mapping: Record<string, string | null>;
  reviewRows: ReviewRow[];
  setReviewRows: (r: ReviewRow[]) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<ExistingRecord[]>([]);
  const [parents, setParents] = useState<ExistingRecord[]>([]);
  const schema = ENTITY_SCHEMAS[entity];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Fetch existing records of this entity for duplicate detection.
      const cols = entity === "sites" ? "id,name,postcode,address" : entity === "assets" ? "id,name,asset_tag" : "id,name";
      const { data: existingData } = await supabase.from(entity).select(cols as any).limit(10000);
      // Parents: sites need customers; assets need sites.
      let parentData: any[] = [];
      if (entity === "sites") {
        const { data } = await supabase.from("customers").select("id,name").limit(10000);
        parentData = data || [];
      } else if (entity === "assets") {
        const { data } = await supabase.from("sites").select("id,name,address,postcode").limit(10000);
        parentData = data || [];
      }
      if (cancelled) return;
      setExisting((existingData || []) as any);
      setParents(parentData as any);
      buildReview((existingData || []) as any, parentData as any);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildReview(existingList: ExistingRecord[], parentList: ExistingRecord[]) {
    const transformed = transformRows(parsed.headers, parsed.rows, mapping);
    const seen = new Map<string, number>(); // dedupe within file
    const out: ReviewRow[] = [];
    for (const t of transformed) {
      const v = t.values;
      const problems: string[] = [];

      // Required check
      for (const f of schema.fields) {
        if (f.required && !(v[f.key] || "").trim()) problems.push(`Missing ${f.label}`);
      }

      // Duplicate against existing
      let duplicateOfExistingId: string | null = null;
      let duplicateOfName: string | undefined;
      const nameKey = (v.name || "").toLowerCase().trim();
      if (nameKey) {
        if (entity === "customers") {
          const hit = existingList.find((e) => e.name.toLowerCase().trim() === nameKey);
          if (hit) { duplicateOfExistingId = hit.id; duplicateOfName = hit.name; }
        } else if (entity === "sites") {
          const pc = (v.postcode || "").toLowerCase().replace(/\s+/g, "");
          const hit = existingList.find((e) => e.name.toLowerCase().trim() === nameKey && (!pc || (e.postcode || "").toLowerCase().replace(/\s+/g, "") === pc));
          if (hit) { duplicateOfExistingId = hit.id; duplicateOfName = hit.name; }
        } else {
          const tag = (v.asset_tag || "").toLowerCase().trim();
          const hit = existingList.find((e: any) => (tag && (e.asset_tag || "").toLowerCase() === tag) || e.name.toLowerCase().trim() === nameKey);
          if (hit) { duplicateOfExistingId = hit.id; duplicateOfName = hit.name; }
        }
      }

      // Within-file duplicate
      const dedupeKey = `${nameKey}|${(v.postcode || "").toLowerCase()}|${(v.asset_tag || "").toLowerCase()}`;
      if (nameKey && seen.has(dedupeKey)) {
        problems.push("Duplicate row in file");
      } else if (nameKey) {
        seen.set(dedupeKey, out.length);
      }

      // Parent matching
      let parentMatchId: string | null = null;
      let parentMatchName: string | undefined;
      let parentCandidates: { id: string; name: string; extra?: string }[] | undefined;
      if (entity === "sites" || entity === "assets") {
        const parentKey = entity === "sites" ? "parent_customer" : "site";
        const q = (v[parentKey] || "").trim();
        if (q) {
          const scored = parentList
            .map((p) => ({ p, s: fuzzyScore(q, p.name, p.address) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s);
          const top = scored[0];
          if (top && top.s >= 500) { parentMatchId = top.p.id; parentMatchName = top.p.name; }
          else if (!top) { problems.push(`No ${entity === "sites" ? "customer" : "site"} matches "${q}"`); }
          parentCandidates = scored.slice(0, 5).map((x) => ({ id: x.p.id, name: x.p.name, extra: (x.p as any).address || (x.p as any).postcode }));
        }
      }

      const action: RowAction = duplicateOfExistingId ? "merge" : problems.length ? "skip" : "create";
      out.push({
        values: v,
        action,
        mergeTargetId: duplicateOfExistingId,
        duplicateOfExistingId,
        duplicateOfName,
        parentMatchId,
        parentMatchName,
        parentCandidates,
        problems,
      });
    }
    setReviewRows(out);
  }

  const counts = useMemo(() => {
    const c = { create: 0, merge: 0, skip: 0, problems: 0 };
    for (const r of reviewRows) {
      c[r.action]++;
      if (r.problems.length) c.problems++;
    }
    return c;
  }, [reviewRows]);

  const updateRow = (i: number, patch: Partial<ReviewRow>) => {
    const next = reviewRows.slice();
    next[i] = { ...next[i], ...patch };
    setReviewRows(next);
  };

  const updateValue = (i: number, field: string, value: string) => {
    const next = reviewRows.slice();
    const values = { ...next[i].values, [field]: value };
    // Re-check required
    const problems = next[i].problems.filter((p) => !p.startsWith("Missing "));
    for (const f of schema.fields) {
      if (f.required && !(values[f.key] || "").trim()) problems.push(`Missing ${f.label}`);
    }
    next[i] = { ...next[i], values, problems };
    setReviewRows(next);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Analysing rows…</div>;
  }

  const shownFields = schema.fields.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap text-sm">
        <Badge variant="default">{counts.create} to create</Badge>
        <Badge variant="secondary">{counts.merge} to merge</Badge>
        <Badge variant="outline">{counts.skip} to skip</Badge>
        {counts.problems > 0 && <Badge variant="destructive">{counts.problems} problems</Badge>}
      </div>

      <div className="border rounded-lg overflow-auto max-h-[560px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="text-left p-2 font-medium w-8">#</th>
              {shownFields.map((f) => <th key={f.key} className="text-left p-2 font-medium">{f.label}</th>)}
              {(entity === "sites" || entity === "assets") && <th className="text-left p-2 font-medium">Parent match</th>}
              <th className="text-left p-2 font-medium">Status</th>
              <th className="text-left p-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {reviewRows.map((r, i) => (
              <tr key={i} className={`border-t ${r.problems.length ? "bg-destructive/5" : ""}`}>
                <td className="p-2 text-muted-foreground">{i + 1}</td>
                {shownFields.map((f) => (
                  <td key={f.key} className="p-2">
                    <Input
                      value={r.values[f.key] || ""}
                      onChange={(e) => updateValue(i, f.key, e.target.value)}
                      className="h-8 text-xs"
                    />
                  </td>
                ))}
                {(entity === "sites" || entity === "assets") && (
                  <td className="p-2 min-w-[180px]">
                    {r.parentCandidates && r.parentCandidates.length > 0 ? (
                      <Select
                        value={r.parentMatchId || "__none__"}
                        onValueChange={(v) => updateRow(i, {
                          parentMatchId: v === "__none__" ? null : v,
                          parentMatchName: v === "__none__" ? undefined : r.parentCandidates?.find((c) => c.id === v)?.name,
                        })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No match" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— no match —</SelectItem>
                          {r.parentCandidates.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}{c.extra ? ` (${c.extra})` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                )}
                <td className="p-2">
                  {r.problems.length ? (
                    <div className="flex items-center gap-1 text-destructive text-xs" title={r.problems.join("; ")}>
                      <AlertTriangle className="h-3 w-3" />{r.problems[0]}{r.problems.length > 1 ? ` +${r.problems.length - 1}` : ""}
                    </div>
                  ) : r.duplicateOfExistingId ? (
                    <div className="text-xs text-muted-foreground">Matches: {r.duplicateOfName}</div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Ready</div>
                  )}
                </td>
                <td className="p-2">
                  <Select value={r.action} onValueChange={(v) => updateRow(i, { action: v as RowAction })}>
                    <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create" disabled={r.problems.length > 0}>Create</SelectItem>
                      <SelectItem value="merge" disabled={!r.duplicateOfExistingId}>Merge</SelectItem>
                      <SelectItem value="skip">Skip</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
