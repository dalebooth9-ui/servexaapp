import { supabase } from "@/integrations/supabase/client";
import { sprinklerDue } from "@/lib/sprinklers";
import type { LookAheadItem } from "@/lib/lookAhead";

/** Due-not-booked sources for the Look-ahead beyond risers: sprinkler systems, service schedules,
 *  asset maintenance (PPM) schedules and service-contract renewals. All reads are company-scoped by RLS. */
const inRange = (d: string | null | undefined, from: string, to: string) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
const item = (id: string, d: string, title: string, customerId: string | null, customerName: string, jobType: string, link: string): LookAheadItem =>
  ({ id, kind: "due", month: d.slice(0, 7), date: d.slice(0, 10), title, customerId, customerName, jobType, link });

const prettyType = (t?: string | null) => { const x = (t || "").replace(/_/g, " ").trim(); return x ? x[0].toUpperCase() + x.slice(1) : "Service visit"; };
export function sprinklerDueItem(s: any, from: string, to: string): LookAheadItem | null {
  const r = sprinklerDue(s); if (!inRange(r.due, from, to)) return null;
  const c = s.sites?.customers;
  return item(`ds-${s.id}`, r.due!, `${c?.name || "Customer not linked"} · ${s.sites?.name || ""} · Sprinkler system`, s.sites?.customer_id || null, c?.name || "",
    r.type === "annual" ? "Sprinkler annual service" : "Sprinkler 6-month service", `/sprinklers/${s.id}`);
}
export function scheduleDueItem(s: any, from: string, to: string): LookAheadItem | null {
  // Dry/wet riser schedules are already listed from the riser register.
  if (/^(dry|wet)_riser/.test(s.work_type || "")) return null;
  if (s.active === false || s.next_job_id || !inRange(s.next_due_date, from, to)) return null;
  return item(`dss-${s.id}`, s.next_due_date, `${s.customers?.name || "Customer not linked"} · ${s.sites?.name || ""}`, s.customer_id || null, s.customers?.name || "", prettyType(s.work_type), "/due-visits");
}
export function ppmDueItem(p: any, from: string, to: string): LookAheadItem | null {
  if ((p.status && p.status !== "active") || !inRange(p.next_due_date, from, to)) return null;
  return item(`dp-${p.id}`, p.next_due_date, `${p.title}${p.assets?.name ? ` · ${p.assets.name}` : ""}`, null, "", p.category || "Planned maintenance", p.asset_id ? `/assets/${p.asset_id}` : "/assets");
}
export function contractDueItem(c: any, from: string, to: string): LookAheadItem | null {
  if ((c.status && !["active", "live"].includes(c.status)) || !inRange(c.renewal_date, from, to)) return null;
  return item(`dc-${c.id}`, c.renewal_date, `${c.customers?.name || "Customer not linked"} · ${c.reference_number || c.name || "Contract"}`, c.customer_id || null, c.customers?.name || "", "Contract renewal", `/contracts/${c.id}`);
}

async function all(q: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let f = 0; ; f += 1000) { const { data, error } = await q().range(f, f + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}

export async function loadOtherDueItems(from: string, to: string): Promise<LookAheadItem[]> {
  const tasks: [string, Promise<LookAheadItem[]>][] = [
    ["sprinklers", all(() => supabase.from("sprinkler_systems").select("id, system_type, last_annual, last_six_month, sites(name, customer_id, customers(name))").order("id"))
      .then((r) => r.map((s) => sprinklerDueItem(s, from, to)).filter(Boolean) as LookAheadItem[])],
    ["schedules", all(() => supabase.from("site_service_schedules").select("id, customer_id, work_type, next_due_date, next_job_id, active, sites(name), customers(name)").gte("next_due_date", from).lte("next_due_date", to).order("id"))
      .then((r) => r.map((s) => scheduleDueItem(s, from, to)).filter(Boolean) as LookAheadItem[])],
    ["ppm", all(() => supabase.from("ppm_schedules").select("id, asset_id, title, category, status, next_due_date, assets(name)").gte("next_due_date", from).lte("next_due_date", to).order("id"))
      .then((r) => r.map((p) => ppmDueItem(p, from, to)).filter(Boolean) as LookAheadItem[])],
    ["contracts", all(() => supabase.from("service_contracts").select("id, customer_id, reference_number, name, status, renewal_date, customers(name)").gte("renewal_date", from).lte("renewal_date", to).order("id"))
      .then((r) => r.map((c) => contractDueItem(c, from, to)).filter(Boolean) as LookAheadItem[])],
  ];
  const res = await Promise.allSettled(tasks.map((t) => t[1]));
  return res.flatMap((r, i) => { if (r.status === "fulfilled") return r.value; console.warn(`look-ahead due ${tasks[i][0]}`, r.reason); return []; });
}
