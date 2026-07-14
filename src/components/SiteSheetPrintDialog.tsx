import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Printer, Download, Eye, FileText } from "lucide-react";
import BlankTemplatePdfExport, {
  type BlankTemplatePdfExportHandle,
} from "@/components/BlankTemplatePdfExport";
import { useToast } from "@/hooks/use-toast";
import { resolveTemplateDisplayTitle } from "@/lib/templateDisplayTitle";

type Props = {
  jobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type LoadedTemplate = {
  id: string;
  name: string;
  fields: any;
  description?: string | null;
  standard?: string | null;
  footer_text?: string | null;
  branding?: any;
  updated_at?: string | null;
  category?: string | null;
};

type JobBundle = {
  job: any;
  site: any | null;
  customer: any | null;
  engineers: string[];
  templates: LoadedTemplate[];
};

/**
 * Returns the default copies to print for a template based on the job's
 * per-service quantities. Falls back to 1 for templates that don't map to a
 * quantified service (e.g. remedial reports, generic sheets).
 */
function defaultCopies(templateName: string, job: any): number {
  const n = (templateName || "").toLowerCase();
  if (n.includes("commission")) {
    return Math.max(job?.other_qty || job?.pressure_test_qty || 1, 1);
  }
  if (n.includes("pressure")) return Math.max(job?.pressure_test_qty || 1, 1);
  if (n.includes("visual")) return Math.max(job?.visual_qty || 1, 1);
  return 1;
}

export default function SiteSheetPrintDialog({ jobId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<JobBundle | null>(null);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printingAll, setPrintingAll] = useState(false);

  const refs = useRef<Record<string, BlankTemplatePdfExportHandle | null>>({});

  useEffect(() => {
    if (!open || !jobId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setBundle(null);
      try {
        const { data: job, error } = await supabase
          .from("jobs")
          .select(
            "id, reference_number, name, address, category, priority, due_date, visual_qty, pressure_test_qty, other_qty, other_service_type, customer, customer_id, site_id, customers(id, name, logo_url), sites(id, name, address, postcode, riser_location)"
          )
          .eq("id", jobId)
          .maybeSingle();
        if (error || !job) throw error || new Error("Job not found");

        // Assigned engineers
        const { data: assignments } = await supabase
          .from("job_assignments")
          .select("engineer_id")
          .eq("job_id", jobId);
        const engineerIds = (assignments || []).map((a: any) => a.engineer_id).filter(Boolean);
        const engineersRes = engineerIds.length
          ? await supabase.from("profiles").select("user_id, full_name").in("user_id", engineerIds)
          : { data: [] as any[] };
        const engineerNames = (engineersRes.data as any[] || [])
          .map((p) => p.full_name)
          .filter(Boolean);

        // Templates to offer — same resolution logic as post-create prefill,
        // but include the job's own category plus pressure_test / visual
        // whenever a matching quantity is set.
        const categories = new Set<string>();
        if (job.category) categories.add(job.category);
        if ((job.pressure_test_qty || 0) > 0) categories.add("pressure_test");
        if ((job.visual_qty || 0) > 0) categories.add("visual");

        const { data: tpls } = await supabase
          .from("job_sheet_templates")
          .select("id, name, fields, description, standard, footer_text, branding, updated_at, category")
          .in("category", Array.from(categories))
          .eq("status", "published");

        const templates: LoadedTemplate[] = (tpls || []).map((t: any) => ({
          ...t,
          fields: typeof t.fields === "string" ? JSON.parse(t.fields) : (t.fields || []),
        }));

        // Sensible per-template default copies.
        const defaults: Record<string, number> = {};
        for (const t of templates) defaults[t.id] = defaultCopies(t.name, job);

        if (cancelled) return;
        setBundle({
          job,
          site: (job as any).sites || null,
          customer: (job as any).customers || null,
          engineers: engineerNames,
          templates,
        });
        setCopies(defaults);
      } catch (err: any) {
        toast({
          title: "Couldn't load site sheets",
          description: err?.message || "Unable to fetch job or templates.",
          variant: "destructive",
        });
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jobId, onOpenChange, toast]);

  const jobInfo = useMemo(() => {
    if (!bundle) return null;
    const { job, site, customer, engineers } = bundle;
    return {
      address: job.address || site?.address || null,
      customer: customer?.name || job.customer || null,
      customers: customer ? { name: customer.name, logo_url: customer.logo_url || null } : null,
      reference_number: job.reference_number || "",
      category: job.category || null,
      name: job.name || null,
      priority: job.priority || null,
      visual_qty: job.visual_qty || 0,
      pressure_test_qty: job.pressure_test_qty || 0,
      other_qty: job.other_qty || 0,
      other_service_type: job.other_service_type || null,
      due_date: job.due_date || null,
      engineers,
      site: site
        ? {
            name: site.name,
            address: site.address,
            postcode: site.postcode,
            contact_name: null,
            contact_phone: null,
            contact_email: null,
            riser_location: (site as any).riser_location || null,
          }
        : null,
    };
  }, [bundle]);

  const runOne = async (
    templateId: string,
    action: "preview" | "download" | "print",
  ) => {
    const handle = refs.current[templateId];
    if (!handle) return;
    setBusyId(templateId);
    try {
      const n = copies[templateId] || 1;
      await handle[action]({ copiesOverride: n });
    } finally {
      setBusyId(null);
    }
  };

  const printAll = async () => {
    if (!bundle) return;
    setPrintingAll(true);
    try {
      for (const t of bundle.templates) {
        const handle = refs.current[t.id];
        if (!handle) continue;
        const n = copies[t.id] || 1;
        // eslint-disable-next-line no-await-in-loop
        await handle.print({ copiesOverride: n });
      }
      toast({ title: "Sent to printer", description: `${bundle.templates.length} sheet(s) dispatched.` });
    } catch (err: any) {
      toast({
        title: "Print failed",
        description: err?.message || "Some sheets did not print.",
        variant: "destructive",
      });
    } finally {
      setPrintingAll(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" /> Print site sheets
          </DialogTitle>
          <DialogDescription>
            Blank job sheets for the engineer to fill in on site. Customer, site, PO, date and
            engineer are pre-printed. Each copy is labelled <em>System N of M</em> when you
            print more than one.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading templates…
          </div>
        ) : !bundle || bundle.templates.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No published job-sheet templates match this job's category.
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {bundle.templates.map((t) => {
              const { title } = resolveTemplateDisplayTitle(t.name, {
                brandingSubtitle: t.branding?.company_subtitle ?? null,
              });
              const n = copies[t.id] || 1;
              const busy = busyId === t.id || printingAll;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{title}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.name}</div>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    Copies
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={n}
                      onChange={(e) =>
                        setCopies((prev) => ({
                          ...prev,
                          [t.id]: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                        }))
                      }
                      className="h-7 w-14 text-sm"
                    />
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={busy}
                      onClick={() => runOne(t.id, "preview")}
                      title="Preview"
                      aria-label={`Preview ${title}`}
                    >
                      {busy && busyId === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={busy}
                      onClick={() => runOne(t.id, "download")}
                      title="Download PDF"
                      aria-label={`Download ${title}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={busy}
                      onClick={() => runOne(t.id, "print")}
                      title="Print"
                      aria-label={`Print ${title}`}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {/* Headless PDF generator per template */}
                  <BlankTemplatePdfExport
                    ref={(r) => {
                      refs.current[t.id] = r;
                    }}
                    template={t as any}
                    jobInfo={jobInfo as any}
                    headless
                  />
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {bundle && bundle.templates.length > 0 && (
            <Button type="button" onClick={printAll} disabled={loading || printingAll}>
              {printingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Printing…
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4 mr-2" /> Print all
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
