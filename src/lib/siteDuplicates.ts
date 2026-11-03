// Duplicate-site detection and "most data" selection (no money values involved).

export interface DupSite {
  id: string;
  name: string;
  postcode?: string | null;
  site_type?: string | null;
  customer_ids: string[];
}

export interface DupGroup {
  key: string;
  siteIds: string[];
  /** "customer" = same customer (safe); "possible" = across customers (never auto-selected). */
  kind: "customer" | "possible";
  reason: "name" | "postcode" | "name+postcode";
  customerId: string | null;
}

export const normPostcode = (p?: string | null) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Lower-case, strip a leading "<CUSTOMER> -" prefix, then drop spaces and punctuation. */
export function normSiteName(name: string, customerNames: string[] = []): string {
  let n = String(name ?? "").trim();
  for (const c of customerNames) {
    const cn = String(c ?? "").trim();
    if (!cn) continue;
    const re = new RegExp("^" + cn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[-–—:|]\\s*", "i");
    if (re.test(n)) { n = n.replace(re, ""); break; }
  }
  return n.toLowerCase().replace(/[^a-z0-9]/g, "");
}

class UF {
  p = new Map<string, string>();
  find(x: string): string { const q = this.p.get(x) ?? x; if (q === x) return x; const r = this.find(q); this.p.set(x, r); return r; }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

export function findDuplicateGroups(sites: DupSite[], customerNames: Map<string, string>): DupGroup[] {
  const groups: DupGroup[] = [];
  const inCustomerGroup = new Set<string>();

  // 1. Same customer AND (same name OR same postcode)
  const byCustomer = new Map<string, DupSite[]>();
  for (const s of sites) for (const c of s.customer_ids) {
    if (!byCustomer.has(c)) byCustomer.set(c, []);
    byCustomer.get(c)!.push(s);
  }
  for (const [cid, list] of byCustomer) {
    if (list.length < 2) continue;
    const cname = customerNames.get(cid) ?? "";
    const uf = new UF();
    const byName = new Map<string, string>(), byPc = new Map<string, string>();
    const nameHit = new Set<string>(), pcHit = new Set<string>();
    for (const s of list) {
      const typ = s.site_type ?? "";
      const nk = typ + "|" + normSiteName(s.name, [cname]);
      const pk = typ + "|" + normPostcode(s.postcode);
      if (normSiteName(s.name, [cname])) {
        const o = byName.get(nk); if (o) { uf.union(s.id, o); nameHit.add(s.id); nameHit.add(o); } else byName.set(nk, s.id);
      }
      if (normPostcode(s.postcode)) {
        const o = byPc.get(pk); if (o) { uf.union(s.id, o); pcHit.add(s.id); pcHit.add(o); } else byPc.set(pk, s.id);
      }
    }
    const comps = new Map<string, string[]>();
    for (const s of list) { const r = uf.find(s.id); if (!comps.has(r)) comps.set(r, []); comps.get(r)!.push(s.id); }
    for (const ids of comps.values()) {
      if (ids.length < 2) continue;
      const n = ids.some((i) => nameHit.has(i)), p = ids.some((i) => pcHit.has(i));
      ids.forEach((i) => inCustomerGroup.add(i));
      groups.push({ key: `c:${cid}:${ids.slice().sort().join(",")}`, siteIds: ids, kind: "customer",
        reason: n && p ? "name+postcode" : n ? "name" : "postcode", customerId: cid });
    }
  }

  // 2. Possible: same name across different customers (or with no customer)
  const byName = new Map<string, DupSite[]>();
  for (const s of sites) {
    const names = s.customer_ids.map((c) => customerNames.get(c) ?? "");
    const k = (s.site_type ?? "") + "|" + normSiteName(s.name, names);
    if (k.endsWith("|")) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(s);
  }
  for (const [k, list] of byName) {
    if (list.length < 2) continue;
    const custs = new Set(list.map((s) => s.customer_ids.slice().sort().join(",")));
    if (custs.size < 2 && list.every((s) => s.customer_ids.length > 0)) continue; // already handled as same-customer
    if (list.every((s) => inCustomerGroup.has(s.id)) && custs.size < 2) continue;
    groups.push({ key: `p:${k}`, siteIds: list.map((s) => s.id), kind: "possible", reason: "name", customerId: null });
  }
  return groups;
}

/** Pick the site with the most data; ties go to the most recent activity, then the first given. */
export function pickSiteWithMostData<T extends { id: string }>(
  candidates: T[],
  stats: Map<string, { total: number; last_activity?: string | null }>,
): T | null {
  if (!candidates.length) return null;
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    const a = stats.get(c.id), b = stats.get(best.id);
    const at = a?.total ?? 0, bt = b?.total ?? 0;
    if (at > bt || (at === bt && (a?.last_activity ?? "") > (b?.last_activity ?? ""))) best = c;
  }
  return best;
}

export interface SiteStat {
  site_id: string; buildings: number; assets: number; jobs: number; defects: number; reports: number;
  agreements: number; documents: number; last_activity: string | null; total: number;
}

export async function loadSiteStats(client: any): Promise<Map<string, SiteStat>> {
  const out = new Map<string, SiteStat>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.rpc("site_data_stats").range(from, from + 999);
    if (error) throw error;
    for (const r of data || []) out.set(r.site_id, { ...r, total: Number(r.total) });
    if (!data || data.length < 1000) break;
  }
  return out;
}
