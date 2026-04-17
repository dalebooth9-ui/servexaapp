import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Briefcase, CalendarDays, MapPin, Clock, AlertTriangle, Shield, FileText, Building2,
  Download, Receipt, PenLine, ExternalLink, CheckCircle2, FlameKindling
} from "lucide-react";
import { format } from "date-fns";

type Job = {
  id: string; name: string; reference_number: string; status: string;
  priority: string; address: string | null; due_date: string | null; created_at: string;
  description: string | null; site_id: string | null;
};
type Visit = { id: string; job_id: string; scheduled_date: string; status: string; notes: string | null; };
type Invoice = {
  id: string; invoice_number: string; document_type: string; status: string;
  total: number | null; subtotal: number | null; tax_amount: number | null;
  issue_date: string | null; due_date: string | null; created_at: string;
};
type LineItem = { id: string; description: string; quantity: number; unit_price: number; line_total: number | null };
type Compliance = {
  id: string; title: string; status: string; expiry_date: string | null;
  record_type: string; file_url: string | null; file_name: string | null;
};
type Site = {
  id: string; name: string; address: string | null; postcode: string | null;
  fire_log_token?: string | null; asset_count?: number;
};
type SignOff = {
  id: string; job_id: string; status: string; signed_at: string | null;
  customer_name: string; created_at: string; token: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  scheduled: "bg-purple-100 text-purple-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  on_hold: "bg-slate-100 text-slate-600",
  awaiting_parts: "bg-orange-100 text-orange-700",
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  pending: "bg-amber-100 text-amber-700",
  signed: "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
};

const COMPLIANCE_COLORS: Record<string, string> = {
  valid: "bg-green-100 text-green-700",
  expiring_soon: "bg-amber-100 text-amber-700",
  expired: "bg-red-100 text-red-700",
  not_applicable: "bg-slate-100 text-slate-600",
};

function expiryColor(date: string | null): string {
  if (!date) return "text-slate-500";
  const d = new Date(date).getTime();
  const now = Date.now();
  const days = (d - now) / (1000 * 60 * 60 * 24);
  if (days < 0) return "text-red-600 font-semibold";
  if (days < 30) return "text-amber-600 font-semibold";
  return "text-green-700";
}

const fmtGBP = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(n || 0));

export default function CustomerPortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [compliance, setCompliance] = useState<Compliance[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [signOffs, setSignOffs] = useState<SignOff[]>([]);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<Record<string, LineItem[]>>({});
  const [jobPhotos, setJobPhotos] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!token) { setError("No access token provided."); setLoading(false); return; }

    (async () => {
      const { data: validateData, error: fnErr } = await supabase.functions.invoke(
        "customer-portal-validate", { body: { token } }
      );
      if (fnErr || !validateData?.valid) {
        setError("This link is invalid or has been deactivated. Contact your contractor for a new link.");
        setLoading(false); return;
      }

      const customerId = validateData.customer_id;
      const { data: customer } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
      setCustomerName(customer?.name || "");

      // Jobs
      const { data: jobData } = await supabase
        .from("jobs")
        .select("id, name, reference_number, status, priority, address, due_date, created_at, description, site_id")
        .eq("customer_id", customerId).order("created_at", { ascending: false });
      const jobList = (jobData || []) as Job[];
      setJobs(jobList);
      const jobIds = jobList.map(j => j.id);

      // Visits
      if (jobIds.length) {
        const { data: vd } = await supabase.from("job_visits")
          .select("id, job_id, scheduled_date, status, notes")
          .in("job_id", jobIds).order("scheduled_date", { ascending: true });
        setVisits((vd || []) as Visit[]);
      }

      // Invoices
      const { data: invData } = await supabase.from("invoices")
        .select("id, invoice_number, document_type, status, total, subtotal, tax_amount, issue_date, due_date, created_at")
        .eq("customer_id", customerId).order("created_at", { ascending: false });
      setInvoices((invData || []).filter((i: any) => i.document_type === "invoice") as Invoice[]);

      // Sites
      const { data: siteLinks } = await supabase.from("customer_sites").select("site_id").eq("customer_id", customerId);
      const siteIds = (siteLinks || []).map((s: any) => s.site_id);

      if (siteIds.length) {
        const { data: siteData } = await supabase.from("sites")
          .select("id, name, address, postcode").in("id", siteIds);
        const { data: fireTokens } = await supabase.from("fire_log_tokens" as any)
          .select("site_id, token, is_active").in("site_id", siteIds);
        const { data: assets } = await supabase.from("assets").select("id, site_id").in("site_id", siteIds);

        const siteList: Site[] = (siteData || []).map((s: any) => {
          const ft = (fireTokens || []).find((f: any) => f.site_id === s.id && f.is_active);
          return {
            ...s,
            fire_log_token: ft?.token || null,
            asset_count: (assets || []).filter((a: any) => a.site_id === s.id).length,
          };
        });
        setSites(siteList);

        // Compliance
        const { data: cd } = await supabase.from("compliance_records")
          .select("id, title, status, expiry_date, record_type, file_url, file_name")
          .in("site_id", siteIds).order("expiry_date", { ascending: true });
        setCompliance((cd || []) as Compliance[]);
      }

      // Sign-offs
      if (jobIds.length) {
        const { data: hd } = await supabase.from("handover_tokens" as any)
          .select("id, job_id, status, signed_at, customer_name, created_at, token")
          .in("job_id", jobIds).order("created_at", { ascending: false });
        setSignOffs((hd || []) as any);
      }

      setLoading(false);
    })();
  }, [token]);

  const loadInvoiceLines = async (id: string) => {
    if (invoiceLines[id]) return;
    const { data } = await supabase.from("invoice_line_items" as any)
      .select("id, description, quantity, unit_price, line_total")
      .eq("invoice_id", id).order("created_at", { ascending: true });
    setInvoiceLines((p) => ({ ...p, [id]: (data || []) as any }));
  };

  const loadJobPhotos = async (id: string) => {
    if (jobPhotos[id]) return;
    const { data } = await supabase.from("submissions" as any)
      .select("file_url").eq("job_id", id).not("file_url", "is", null).limit(20);
    const urls = (data || []).map((d: any) => d.file_url).filter((u: string) => /\.(jpe?g|png|webp|gif)$/i.test(u));
    setJobPhotos((p) => ({ ...p, [id]: urls }));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading your portal...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <h1 className="text-xl font-semibold text-slate-900">Access Error</h1>
        <p className="max-w-sm text-slate-600">{error}</p>
      </div>
    );
  }

  const activeJobs = jobs.filter(j => !["completed", "archived", "cancelled"].includes(j.status));
  const completedJobs = jobs.filter(j => j.status === "completed");
  const upcomingVisits = visits.filter(v =>
    ["upcoming", "unscheduled"].includes(v.status) &&
    new Date(v.scheduled_date) >= new Date(new Date().toDateString())
  );
  const outstanding = invoices
    .filter(i => ["sent", "overdue"].includes(i.status))
    .reduce((s, i) => s + Number(i.total || 0), 0);
  const pendingSignOffs = signOffs.filter(s => s.status === "pending");
  const completedSignOffs = signOffs.filter(s => s.status === "signed");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 sm:px-6 py-4 gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold truncate text-slate-900">{customerName}</h1>
            <p className="text-xs sm:text-sm text-slate-500">Customer Portal · powered by Servexa</p>
          </div>
          <img src="/images/vivafire-logo-new.jpg" alt="Servexa" className="h-9 sm:h-10 object-contain" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-5 sm:py-6">
        <Tabs defaultValue="jobs" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto bg-white border border-slate-200 h-auto p-1 flex-nowrap">
            <TabsTrigger value="jobs" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              <Briefcase className="h-3.5 w-3.5 mr-1.5" />Jobs
            </TabsTrigger>
            <TabsTrigger value="invoices" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />Invoices
            </TabsTrigger>
            <TabsTrigger value="certs" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              <Shield className="h-3.5 w-3.5 mr-1.5" />Certificates
            </TabsTrigger>
            <TabsTrigger value="sites" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />Sites
            </TabsTrigger>
            <TabsTrigger value="signoffs" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              <PenLine className="h-3.5 w-3.5 mr-1.5" />Sign-Offs
            </TabsTrigger>
          </TabsList>

          {/* JOBS */}
          <TabsContent value="jobs" className="mt-4 space-y-4">
            {upcomingVisits.length > 0 && (
              <Card className="border-slate-200">
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2 text-slate-900">
                  <CalendarDays className="h-4 w-4 text-orange-500" />Upcoming Visits
                </CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {upcomingVisits.slice(0, 10).map(v => {
                    const j = jobs.find(j => j.id === v.job_id);
                    return (
                      <div key={v.id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{j?.name || "Job"}</p>
                          <p className="text-xs text-slate-500 font-mono">{j?.reference_number}</p>
                        </div>
                        <p className="text-sm font-medium whitespace-nowrap">
                          {format(new Date(v.scheduled_date), "EEE d MMM")}
                        </p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {activeJobs.length > 0 && (
              <SectionCard title={`Active Jobs (${activeJobs.length})`} icon={<Briefcase className="h-4 w-4 text-orange-500" />}>
                {activeJobs.map(job => (
                  <JobRow key={job.id} job={job} open={openJobId === job.id}
                    onToggle={() => { setOpenJobId(openJobId === job.id ? null : job.id); loadJobPhotos(job.id); }}
                    photos={jobPhotos[job.id] || []} />
                ))}
              </SectionCard>
            )}

            {completedJobs.length > 0 && (
              <SectionCard title={`Completed Jobs (${completedJobs.length})`} icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}>
                {completedJobs.slice(0, 20).map(job => (
                  <JobRow key={job.id} job={job} open={openJobId === job.id}
                    onToggle={() => { setOpenJobId(openJobId === job.id ? null : job.id); loadJobPhotos(job.id); }}
                    photos={jobPhotos[job.id] || []} />
                ))}
              </SectionCard>
            )}

            {jobs.length === 0 && <EmptyState icon={Briefcase} text="No jobs found." />}
          </TabsContent>

          {/* INVOICES */}
          <TabsContent value="invoices" className="mt-4 space-y-4">
            {outstanding > 0 && (
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-600">Outstanding Balance</p>
                    <p className="text-2xl font-bold text-orange-600">{fmtGBP(outstanding)}</p>
                  </div>
                  <Receipt className="h-8 w-8 text-orange-400" />
                </CardContent>
              </Card>
            )}

            {invoices.length > 0 ? (
              <SectionCard title={`Invoices (${invoices.length})`} icon={<Receipt className="h-4 w-4 text-orange-500" />}>
                {invoices.map(inv => (
                  <div key={inv.id} className="rounded-lg border border-slate-200">
                    <button onClick={() => { setOpenInvoiceId(openInvoiceId === inv.id ? null : inv.id); loadInvoiceLines(inv.id); }}
                      className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium font-mono truncate">{inv.invoice_number}</p>
                        <p className="text-xs text-slate-500">
                          {inv.issue_date ? format(new Date(inv.issue_date), "dd MMM yyyy") : "—"}
                          {inv.due_date && <> · Due {format(new Date(inv.due_date), "dd MMM yyyy")}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold">{fmtGBP(inv.total)}</span>
                        <Badge className={`${STATUS_COLORS[inv.status] || ""} capitalize border-0`}>{inv.status}</Badge>
                      </div>
                    </button>
                    {openInvoiceId === inv.id && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
                        {(invoiceLines[inv.id] || []).length > 0 ? (
                          <div className="text-xs">
                            {(invoiceLines[inv.id] || []).map(l => (
                              <div key={l.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                                <span className="truncate pr-2">{l.description} {l.quantity > 1 && `× ${l.quantity}`}</span>
                                <span className="font-medium whitespace-nowrap">{fmtGBP(l.line_total ?? l.unit_price * l.quantity)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">No line items.</p>
                        )}
                        <div className="text-xs space-y-0.5 pt-1">
                          <div className="flex justify-between"><span>Subtotal</span><span>{fmtGBP(inv.subtotal)}</span></div>
                          <div className="flex justify-between"><span>VAT</span><span>{fmtGBP(inv.tax_amount)}</span></div>
                          <div className="flex justify-between font-semibold text-sm"><span>Total</span><span>{fmtGBP(inv.total)}</span></div>
                        </div>
                        <Button size="sm" variant="outline" className="w-full"
                          onClick={() => window.print()}>
                          <Download className="h-3.5 w-3.5 mr-1.5" /> Print / Save PDF
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </SectionCard>
            ) : <EmptyState icon={Receipt} text="No invoices yet." />}
          </TabsContent>

          {/* CERTIFICATES */}
          <TabsContent value="certs" className="mt-4 space-y-4">
            {compliance.length > 0 ? (
              <SectionCard title={`Certificates & Reports (${compliance.length})`} icon={<Shield className="h-4 w-4 text-orange-500" />}>
                {compliance.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.title}</p>
                      <p className="text-xs text-slate-500 capitalize">{c.record_type.replace(/_/g, " ")}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.expiry_date && (
                        <span className={`text-xs ${expiryColor(c.expiry_date)}`}>
                          {format(new Date(c.expiry_date), "dd MMM yyyy")}
                        </span>
                      )}
                      <Badge className={`${COMPLIANCE_COLORS[c.status] || ""} border-0`}>{c.status.replace(/_/g, " ")}</Badge>
                      {c.file_url && (
                        <Button size="icon" variant="outline" className="h-7 w-7" asChild>
                          <a href={c.file_url} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /></a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </SectionCard>
            ) : <EmptyState icon={Shield} text="No certificates available." />}
          </TabsContent>

          {/* SITES */}
          <TabsContent value="sites" className="mt-4 space-y-4">
            {sites.length > 0 ? (
              <SectionCard title={`Sites (${sites.length})`} icon={<Building2 className="h-4 w-4 text-orange-500" />}>
                {sites.map(s => (
                  <div key={s.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        {(s.address || s.postcode) && (
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{[s.address, s.postcode].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {s.asset_count ?? 0} asset{s.asset_count === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    {s.fire_log_token && (
                      <Button size="sm" variant="outline" className="w-full" asChild>
                        <Link to={`/fire-log/${s.fire_log_token}`} target="_blank">
                          <FlameKindling className="h-3.5 w-3.5 mr-1.5 text-orange-500" />
                          Open Fire Log Book <ExternalLink className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </SectionCard>
            ) : <EmptyState icon={Building2} text="No sites linked." />}
          </TabsContent>

          {/* SIGN-OFFS */}
          <TabsContent value="signoffs" className="mt-4 space-y-4">
            {pendingSignOffs.length > 0 && (
              <SectionCard title={`Pending Sign-Offs (${pendingSignOffs.length})`} icon={<PenLine className="h-4 w-4 text-amber-500" />}>
                {pendingSignOffs.map(s => {
                  const j = jobs.find(j => j.id === s.job_id);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{j?.name || "Job"}</p>
                        <p className="text-xs text-slate-500 font-mono">{j?.reference_number}</p>
                      </div>
                      <Button size="sm" asChild>
                        <Link to={`/handover/${s.token}`} target="_blank">
                          Sign Now <ExternalLink className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </SectionCard>
            )}
            {completedSignOffs.length > 0 && (
              <SectionCard title={`Completed Sign-Offs (${completedSignOffs.length})`} icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}>
                {completedSignOffs.map(s => {
                  const j = jobs.find(j => j.id === s.job_id);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{j?.name || "Job"}</p>
                        <p className="text-xs text-slate-500">
                          Signed by {s.customer_name} · {s.signed_at ? format(new Date(s.signed_at), "dd MMM yyyy") : "—"}
                        </p>
                      </div>
                      <Badge className="bg-green-100 text-green-700 border-0">Signed</Badge>
                    </div>
                  );
                })}
              </SectionCard>
            )}
            {signOffs.length === 0 && <EmptyState icon={PenLine} text="No sign-offs requested." />}
          </TabsContent>
        </Tabs>

        <footer className="text-center text-xs text-slate-400 mt-8 pb-4">
          Powered by Servexa · Secure customer portal
        </footer>
      </main>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2 text-slate-900">{icon}{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="py-12 text-center text-slate-400">
      <Icon className="mx-auto mb-3 h-8 w-8 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function JobRow({ job, open, onToggle, photos }: { job: Job; open: boolean; onToggle: () => void; photos: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200">
      <button onClick={onToggle} className="w-full p-3 text-left hover:bg-slate-50 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{job.name}</p>
            <p className="text-xs font-mono text-slate-500">{job.reference_number}</p>
          </div>
          <Badge className={`${STATUS_COLORS[job.status] || ""} capitalize border-0 shrink-0`}>{job.status.replace(/_/g, " ")}</Badge>
        </div>
        {job.address && <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{job.address}</p>}
        {job.due_date && <p className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3 w-3" />Due {format(new Date(job.due_date), "dd MMM yyyy")}</p>}
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-slate-100 space-y-2 pt-2">
          {job.description && (
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1">Notes</p>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{job.description}</p>
            </div>
          )}
          {photos.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1">Photos</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photos.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="block aspect-square rounded-md overflow-hidden border border-slate-200">
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {!job.description && photos.length === 0 && <p className="text-xs text-slate-400">No additional details.</p>}
        </div>
      )}
    </div>
  );
}
