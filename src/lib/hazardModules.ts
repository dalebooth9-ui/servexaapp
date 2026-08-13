import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * RAMS hazard modules — org-scoped, owner-approved add-on content.
 *
 * A module is a bundle of HSE-aligned safety content (hazard description,
 * control measures, risk-assessment rows, method/PPE/plant additions) for a
 * common high-risk activity (hot works, working at height, confined spaces…).
 *
 * SAFETY GUARDRAIL: modules seed as `draft` in every org and are only
 * selectable on live RAMS once that org's competent person reviews and
 * approves them in Settings → RAMS Library → Hazard modules.
 */

export type HazardModuleStatus = "draft" | "approved" | "archived";

export interface HazardModule {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  summary: string;
  hazard_description: string;
  control_measures: string[];
  /** Same 11-column shape as RAMS risk rows. */
  risk_rows: string[][];
  sequence_additions: string[];
  ppe_additions: string[];
  plant_additions: string[];
  status: HazardModuleStatus;
  is_seeded_template: boolean;
  review_note: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  sort_order: number;
}

/** Provenance recorded on the RAMS document. */
export interface AppliedHazardModule {
  slug: string;
  name: string;
  applied_by?: string | null;
  applied_by_name?: string | null;
  applied_at?: string;
}

/** The subset of a RAMS document that modules contribute to. */
export interface RamsModuleContent {
  sequenceOfOps: string[];
  taskSpecificOps: string[];
  plantAndEquipment: string[];
  significantRisks: string[];
  ppeItems: string[];
  riskRows: string[][];
}

const arr = (v: any): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : [];

export function normaliseHazardModule(row: any): HazardModule {
  return {
    id: row.id,
    org_id: row.org_id,
    slug: row.slug,
    name: row.name,
    summary: row.summary || "",
    hazard_description: row.hazard_description || "",
    control_measures: arr(row.control_measures),
    risk_rows: Array.isArray(row.risk_rows)
      ? row.risk_rows.map((r: any) => (Array.isArray(r) ? r.map((c: any) => String(c ?? "")) : []))
      : [],
    sequence_additions: arr(row.sequence_additions),
    ppe_additions: arr(row.ppe_additions),
    plant_additions: arr(row.plant_additions),
    status: (row.status as HazardModuleStatus) || "draft",
    is_seeded_template: row.is_seeded_template ?? true,
    review_note: row.review_note ?? null,
    approved_by_name: row.approved_by_name ?? null,
    approved_at: row.approved_at ?? null,
    sort_order: row.sort_order ?? 0,
  };
}

export async function fetchHazardModules(opts?: { approvedOnly?: boolean }): Promise<HazardModule[]> {
  let query = (supabase.from("rams_hazard_modules" as any) as any)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (opts?.approvedOnly) query = query.eq("status", "approved");
  else query = query.neq("status", "archived");
  const { data, error } = await query;
  if (error) throw error;
  return ((data as any[]) || []).map(normaliseHazardModule);
}

export function useHazardModules(opts?: { approvedOnly?: boolean }) {
  const approvedOnly = !!opts?.approvedOnly;
  const [modules, setModules] = useState<HazardModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      setModules(await fetchHazardModules({ approvedOnly }));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load hazard modules");
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, [approvedOnly]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { modules, loading, error, refetch };
}

/** Prefix used so module content reads as an integrated part of the document. */
const tag = (m: HazardModule, text: string) => `${m.name}: ${text}`;

const addUnique = (list: string[], additions: string[]): string[] => {
  const out = [...list];
  for (const a of additions) if (a && !out.includes(a)) out.push(a);
  return out;
};

const removeAll = (list: string[], removals: string[]): string[] =>
  list.filter((x) => !removals.includes(x));

function moduleContributions(m: HazardModule) {
  return {
    sequence: m.sequence_additions.map((s) => tag(m, s)),
    tasks: m.control_measures.map((c) => tag(m, c)),
    plant: m.plant_additions,
    risks: [m.hazard_description ? tag(m, m.hazard_description) : ""].filter(Boolean),
    ppe: m.ppe_additions,
  };
}

const rowKey = (r: string[]) => JSON.stringify(r.map((c) => (c || "").trim()));

/** Append a module's content to a RAMS document, avoiding duplicates. */
export function applyHazardModule(content: RamsModuleContent, m: HazardModule): RamsModuleContent {
  const c = moduleContributions(m);
  const existing = new Set(content.riskRows.map(rowKey));
  const newRows = m.risk_rows.filter((r) => !existing.has(rowKey(r)));
  return {
    sequenceOfOps: addUnique(content.sequenceOfOps, c.sequence),
    taskSpecificOps: addUnique(content.taskSpecificOps, c.tasks),
    plantAndEquipment: addUnique(content.plantAndEquipment, c.plant),
    significantRisks: addUnique(content.significantRisks, c.risks),
    ppeItems: addUnique(content.ppeItems, c.ppe),
    riskRows: [...content.riskRows, ...newRows],
  };
}

/** Remove a module's content again (untick). Manual edits to other rows are kept. */
export function removeHazardModule(content: RamsModuleContent, m: HazardModule): RamsModuleContent {
  const c = moduleContributions(m);
  const drop = new Set(m.risk_rows.map(rowKey));
  return {
    sequenceOfOps: removeAll(content.sequenceOfOps, c.sequence),
    taskSpecificOps: removeAll(content.taskSpecificOps, c.tasks),
    plantAndEquipment: removeAll(content.plantAndEquipment, c.plant),
    significantRisks: removeAll(content.significantRisks, c.risks),
    ppeItems: removeAll(content.ppeItems, c.ppe),
    riskRows: content.riskRows.filter((r) => !drop.has(rowKey(r))),
  };
}

export function appliedFrom(
  m: HazardModule,
  user?: { id?: string | null; name?: string | null } | null,
): AppliedHazardModule {
  return {
    slug: m.slug,
    name: m.name,
    applied_by: user?.id ?? null,
    applied_by_name: user?.name ?? null,
    applied_at: new Date().toISOString(),
  };
}

export function parseAppliedModules(value: any): AppliedHazardModule[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === "object" && typeof v.slug === "string")
    .map((v) => ({
      slug: v.slug,
      name: v.name || v.slug,
      applied_by: v.applied_by ?? null,
      applied_by_name: v.applied_by_name ?? null,
      applied_at: v.applied_at,
    }));
}
