// Job page "Job Documents" tidy-up helpers: one line per riser, hide retired/duplicate templates,
// and find an existing draft so new drafts aren't created by accident.

export type GroupableResponse = {
  id: string;
  template_id: string;
  status: string;
  created_at: string;
  submitted_at?: string | null;
  responses?: Record<string, any> | null;
};

export type ReportGroup<R extends GroupableResponse> = {
  key: string;
  riserLabel: string | null;
  latest: R;
  earlier: R[];
};

/** Which riser a report belongs to (asset id first, then typed location). */
export function riserKeyOf(r: GroupableResponse): string {
  const a = String(r.responses?.riser_asset_id || "").trim();
  if (a) return `asset:${a}`;
  const loc = String(r.responses?.riser_location || "").trim().toLowerCase();
  if (loc) return `loc:${loc}`;
  return `tpl:${r.template_id}`;
}

function when(r: GroupableResponse): number {
  return Math.max(new Date(r.created_at).getTime() || 0, r.submitted_at ? new Date(r.submitted_at).getTime() || 0 : 0);
}

/** Groups draft/submitted reports so each riser shows only its newest report. */
export function groupReportsByRiser<R extends GroupableResponse>(rows: R[]): ReportGroup<R>[] {
  const map = new Map<string, R[]>();
  for (const r of rows) {
    if (r.status !== "draft" && r.status !== "submitted") continue;
    const k = riserKeyOf(r);
    map.set(k, [...(map.get(k) || []), r]);
  }
  return Array.from(map.entries()).map(([key, list]) => {
    const sorted = [...list].sort((a, b) => when(b) - when(a));
    const label = String(sorted.find((r) => r.responses?.riser_location)?.responses?.riser_location || "").trim();
    return { key, riserLabel: label || null, latest: sorted[0], earlier: sorted.slice(1) };
  });
}

type Tpl = { id: string; name: string; status?: string | null };
const norm = (s: string) => s.toLowerCase().replace(/[\u2013\u2014-]/g, "-").replace(/\s+/g, " ").trim();

export function isRetiredTemplate(t: Tpl): boolean {
  return /retired/i.test(t.name || "") || t.status === "retired" || t.status === "archived";
}

/** Drops retired templates and keeps one per name (published wins). */
export function visibleJobTemplates<T extends Tpl>(list: T[]): T[] {
  const byName = new Map<string, T>();
  for (const t of list) {
    if (isRetiredTemplate(t)) continue;
    const k = norm(t.name);
    const cur = byName.get(k);
    const pub = (x: T) => (x.status ?? "published") === "published";
    if (!cur || (!pub(cur) && pub(t))) byName.set(k, t);
  }
  return list.filter((t) => byName.get(norm(t.name)) === t);
}

/** Existing drafts of this template for the same riser (or any riser when unknown), newest first. */
export function findExistingDrafts<R extends GroupableResponse>(rows: R[], templateId: string, riserAssetId?: string | null): R[] {
  return rows
    .filter((r) => r.status === "draft" && r.template_id === templateId)
    .filter((r) => !riserAssetId || !r.responses?.riser_asset_id || String(r.responses.riser_asset_id) === riserAssetId)
    .sort((a, b) => when(b) - when(a));
}
