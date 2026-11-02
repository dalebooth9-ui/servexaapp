import { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { History, Loader2, Upload, CheckCircle2 } from "lucide-react";
import { parseReportDateText, priorityToSeverity, remedialStatus } from "@/lib/dryRisers";

type Kind = "history" | "remedial";
type Raw = Record<string, string>;
interface Prepared {
  raw: Raw; siteId: string | null; siteName: string; assetId: string | null;
  date: string | null; problems: string[]; skip: "duplicate" | "no_site" | null; needsReview?: boolean;
}
interface Lookups {
  orgId: string;
  sites: Map<string, { id: string; name: string }>;
  customers: Map<string, string>;
  assets: Map<string, { id: string; site_id: string | null }>;
}

const norm = (s: string | undefined | null) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const HISTORY_COLS = ["customer", "site", "asset_tag", "report_date_text", "report_type", "result", "report_file", "report_link"];
const REMEDIAL_COLS = ["customer", "site", "asset_tag", "report_date", "work_needed", "work_done", "status", "priority", "report_file"];

async function fetchAll<T>(build: (from: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from).range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadLookups(): Promise<Lookups> {
  const { data: orgId } = await supabase.rpc("get_user_org_id");
  const [sites, customers, assets] = await Promise.all([
    fetchAll<any>(() => supabase.from("sites").select("id, name").order("id")),
    fetchAll<any>(() => supabase.from("customers").select("id, name").order("id")),
    fetchAll<any>(() => supabase.from("assets").select("id, asset_tag, site_id").not("asset_tag", "is", null).order("id")),
  ]);
  const siteMap = new Map<string, { id: string; name: string }>();
  const dupNames = new Set<string>();
  for (const s of sites) { const k = norm(s.name); if (siteMap.has(k)) dupNames.add(k); siteMap.set(k, s); }
  dupNames.forEach((k) => siteMap.delete(k)); // ambiguous names never auto-match
  return {
    orgId: orgId as string,
    sites: siteMap,
    customers: new Map(customers.map((c: any) => [norm(c.name), c.id])),
    assets: new Map(assets.map((a: any) => [String(a.asset_tag).toUpperCase().trim(), { id: a.id, site_id: a.site_id }])),
  };
}

export default function ImportHistory() {
  return (
    <div className="space-y-6">
      <Importer kind="history" title="Report history" cols={HISTORY_COLS}
        description="Past inspection reports. Attaches to the dry riser when asset_tag matches, otherwise to the site." />
      <Importer kind="remedial" title="Remedial works" cols={REMEDIAL_COLS}
        description="Past remedial items. Each row becomes a defect; 'done' rows are imported as resolved." />
    </div>
  );
}

function Importer({ kind, title, description, cols }: { kind: Kind; title: string; description: string; cols: string[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Prepared[] | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [createSites, setCreateSites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ imported: number; skipped: number; sitesCreated: number; errors: string[] } | null>(null);

  const onFile = async (f: File) => {
    setBusy(true); setDone(null); setFileName(f.name);
    try {
      const text = await f.text();
      const parsed = Papa.parse<Raw>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_") });
      const missing = cols.filter((c) => !(parsed.meta.fields || []).includes(c));
      if (missing.length) { toast({ title: "Missing columns", description: missing.join(", "), variant: "destructive" }); setRows(null); return; }
      const lk = await loadLookups();
      setLookups(lk);
      // Existing (site + report_file) keys for de-dup
      const existingKeys = new Set<string>();
      if (kind === "history") {
        const hist = await fetchAll<any>(() => supabase.from("asset_service_history").select("site_id, report_file").not("report_file", "is", null).order("id"));
        hist.forEach((h) => existingKeys.add(`${h.site_id}|${norm(h.report_file)}`));
      } else {
        const defs = await fetchAll<any>(() => supabase.from("defects").select("site_id, description, title").like("description", "Imported from %").order("id"));
        defs.forEach((d) => existingKeys.add(`${d.site_id}|${norm(d.description)}|${norm(d.title)}`));
      }
      const seen = new Set<string>();
      const out: Prepared[] = parsed.data.map((raw) => {
        const problems: string[] = [];
        const site = lk.sites.get(norm(raw.site));
        const tag = String(raw.asset_tag || "").toUpperCase().trim();
        let assetId: string | null = null;
        if (tag) {
          const a = lk.assets.get(tag);
          if (a && (!site || a.site_id === site.id)) assetId = a.id;
          else if (a) problems.push(`Tag ${tag} belongs to a different site — attached to site only`);
          else problems.push(`Tag ${tag} not found — attached to site only`);
        }
        const dateText = kind === "history" ? raw.report_date_text : raw.report_date;
        const date = parseReportDateText(dateText);
        if (dateText && !date) problems.push(`Couldn't read date "${dateText}"`);
        let skip: Prepared["skip"] = null;
        if (!site) { skip = "no_site"; problems.unshift("Site not found"); }
        let needsReview = false;
        if (kind === "remedial") {
          if (!String(raw.work_needed || "").trim()) problems.push("No work_needed — will be skipped");
          const st = remedialStatus(raw.status);
          needsReview = st.needsReview;
          if (needsReview) problems.push(`Status "${raw.status || "blank"}" unclear — imported as open and flagged`);
        }
        if (site) {
          const key = kind === "history"
            ? `${site.id}|${norm(raw.report_file)}`
            : `${site.id}|${norm(`Imported from ${raw.report_file || fileName}`)}|${norm(raw.work_needed)}`;
          if (kind === "history" && !raw.report_file) { /* no file -> can't de-dup, import */ }
          else if (existingKeys.has(key) || seen.has(key)) skip = "duplicate";
          seen.add(key);
        }
        return { raw, siteId: site?.id ?? null, siteName: raw.site || "", assetId, date, problems, skip, needsReview };
      });
      setRows(out);
    } catch (e: any) {
      toast({ title: "Couldn't read file", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const missingSites = rows ? [...new Set(rows.filter((r) => r.skip === "no_site").map((r) => r.siteName.trim()).filter(Boolean))] : [];
  const counts = rows ? {
    ready: rows.filter((r) => !r.skip && !(kind === "remedial" && !String(r.raw.work_needed || "").trim())).length,
    dup: rows.filter((r) => r.skip === "duplicate").length,
    noSite: rows.filter((r) => r.skip === "no_site").length,
    problems: rows.filter((r) => r.problems.length).length,
  } : null;

  const runImport = async () => {
    if (!rows || !lookups || !user) return;
    setBusy(true);
    const errors: string[] = [];
    let sitesCreated = 0, imported = 0, skipped = 0;
    try {
      // Optionally create the missing sites (exact names, linked to an exact-name customer if one exists)
      const siteIdByName = new Map<string, string>();
      if (createSites && missingSites.length) {
        for (const name of missingSites) {
          const { data, error } = await supabase.from("sites").insert({ name, site_type: "site" } as any).select("id").single();
          if (error || !data) { errors.push(`Site "${name}": ${error?.message}`); continue; }
          sitesCreated++; siteIdByName.set(norm(name), data.id);
          const custName = rows.find((r) => norm(r.siteName) === norm(name))?.raw.customer;
          const custId = custName ? lookups.customers.get(norm(custName)) : undefined;
          if (custId) await supabase.from("customer_sites").insert({ customer_id: custId, site_id: data.id } as any);
        }
      }
      const toImport = rows.map((r) => {
        if (r.skip === "duplicate") return null;
        const siteId = r.siteId ?? siteIdByName.get(norm(r.siteName)) ?? null;
        if (!siteId) return null;
        if (kind === "remedial" && !String(r.raw.work_needed || "").trim()) return null;
        return { r, siteId };
      }).filter(Boolean) as { r: Prepared; siteId: string }[];
      skipped = rows.length - toImport.length;

      const payloads = toImport.map(({ r, siteId }) => {
        if (kind === "history") {
          return {
            org_id: lookups.orgId, asset_id: r.assetId, site_id: siteId,
            inspection_date: r.date, report_date_text: r.raw.report_date_text || null,
            inspection_type: r.raw.report_type || null, template_name: r.raw.report_type || null,
            result_summary: r.raw.result || null, report_file: r.raw.report_file || null, report_link: r.raw.report_link || null,
          };
        }
        const st = remedialStatus(r.raw.status);
        const when = r.date ? new Date(`${r.date}T12:00:00Z`).toISOString() : new Date().toISOString();
        return {
          title: r.raw.work_needed.trim(),
          description: `Imported from ${r.raw.report_file || fileName}`,
          resolution_notes: r.raw.work_done || null,
          severity: priorityToSeverity(r.raw.priority),
          status: st.status,
          category: st.needsReview ? "Imported — check status" : null,
          created_at: when,
          resolved_at: st.status === "resolved" ? when : null,
          resolved_by: st.status === "resolved" ? user.id : null,
          asset_id: r.assetId, site_id: siteId, reported_by: user.id, source_kind: "manual",
        };
      });
      const table = kind === "history" ? "asset_service_history" : "defects";
      for (let i = 0; i < payloads.length; i += 500) {
        const chunk = payloads.slice(i, i + 500);
        const { error } = await supabase.from(table as any).insert(chunk as any);
        if (error) errors.push(`Rows ${i + 1}–${i + chunk.length}: ${error.message}`);
        else imported += chunk.length;
      }
      setDone({ imported, skipped, sitesCreated, errors });
      setRows(null);
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /><CardTitle className="text-lg">{title}</CardTitle></div>
        <CardDescription>{description}<br /><span className="font-mono text-xs">{cols.join(", ")}</span></CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="inline-flex">
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          <Button asChild variant="outline" disabled={busy}><span>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}Upload CSV</span></Button>
        </label>

        {rows && counts && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Preview — {fileName}</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge>{counts.ready} ready</Badge>
              <Badge variant="secondary">{counts.dup} already imported</Badge>
              <Badge variant="outline">{counts.noSite} site not found</Badge>
              {counts.problems > 0 && <Badge variant="destructive">{counts.problems} with problems</Badge>}
            </div>
            {missingSites.length > 0 && (
              <div className="rounded-md border p-3 text-sm space-y-2">
                <p className="font-medium">Sites not found ({missingSites.length})</p>
                <p className="text-xs text-muted-foreground">{missingSites.slice(0, 30).join(" · ")}{missingSites.length > 30 ? ` · +${missingSites.length - 30} more` : ""}</p>
                <label className="flex items-center gap-2"><Checkbox checked={createSites} onCheckedChange={(v) => setCreateSites(!!v)} /> Create missing sites</label>
              </div>
            )}
            <div className="max-h-72 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Site</th><th className="p-2 text-left">Tag</th><th className="p-2 text-left">Date</th><th className="p-2 text-left">Problems</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t ${r.skip ? "opacity-60" : ""}`}>
                      <td className="p-2">{i + 1}</td><td className="p-2">{r.siteName}</td><td className="p-2 font-mono">{r.raw.asset_tag || "—"}</td>
                      <td className="p-2">{r.date ?? "—"}</td>
                      <td className="p-2">{r.skip === "duplicate" ? "Already imported — skipped" : r.problems.join("; ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button onClick={runImport} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Import</Button>
              <Button variant="outline" onClick={() => setRows(null)} disabled={busy}>Cancel</Button>
            </div>
          </div>
        )}

        {done && (
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p className="font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Done</p>
            <p>{done.imported} imported · {done.skipped} skipped{done.sitesCreated ? ` · ${done.sitesCreated} sites created` : ""}</p>
            {done.errors.map((e, i) => <p key={i} className="text-destructive text-xs">{e}</p>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
