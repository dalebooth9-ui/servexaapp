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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Printer, Download, Eye, FileText } from "lucide-react";
import BlankTemplatePdfExport, {
  type BlankTemplatePdfExportHandle,
} from "@/components/BlankTemplatePdfExport";
import { useToast } from "@/hooks/use-toast";
import { resolveTemplateDisplayTitle } from "@/lib/templateDisplayTitle";
import { UKDateInput } from "@/components/ui/uk-date-input";


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

/** Header fields the user can edit before printing. Applies to printout only. */
type PrintOverrides = {
  customerName: string;
  siteName: string;
  siteAddress: string;
  sitePostcode: string;
  riserLocation: string;
  refNumber: string;
  dueDate: string; // ISO yyyy-mm-dd
  engineers: string; // comma-separated
  notes: string;
};

const EMPTY_OVERRIDES: PrintOverrides = {
  customerName: "",
  siteName: "",
  siteAddress: "",
  sitePostcode: "",
  riserLocation: "",
  refNumber: "",
  dueDate: "",
  engineers: "",
  notes: "",
};

export default function SiteSheetPrintDialog({ jobId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<JobBundle | null>(null);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printingAll, setPrintingAll] = useState(false);
  const [overrides, setOverrides] = useState<PrintOverrides>(EMPTY_OVERRIDES);

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
            "id, reference_number, customer_po, name, address, category, priority, due_date, visual_qty, pressure_test_qty, other_qty, other_service_type, customer, customer_id, site_id, customers(id, name, logo_url), sites(id, name, address, postcode, riser_location)"
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

        const defaults: Record<string, number> = {};
        for (const t of templates) defaults[t.id] = defaultCopies(t.name, job);

        if (cancelled) return;
        const jobAny = job as any;
        const site = jobAny.sites || null;
        const customer = jobAny.customers || null;
        setBundle({
          job,
          site,
          customer,
          engineers: engineerNames,
          templates,
        });
        setCopies(defaults);
        // Prefill overrides from the job — user can tweak before printing.
        setOverrides({
          customerName: (customer?.name || jobAny.customer || "").toString(),
          siteName: (site?.name || "").toString(),
          siteAddress: (site?.address || jobAny.address || "").toString(),
          sitePostcode: (site?.postcode || "").toString(),
          riserLocation: (site?.riser_location || "").toString(),
          refNumber: ((jobAny.customer_po as string | null) || jobAny.reference_number || "").toString(),
          dueDate: (jobAny.due_date ? String(jobAny.due_date).slice(0, 10) : ""),
          engineers: engineerNames.join(", "),
          notes: "",
        });
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

  // Effective jobInfo used for PDF generation — merges the user's
  // edit-before-print overrides on top of the loaded job. Never persisted.
  const jobInfo = useMemo(() => {
    if (!bundle) return null;
    const { job, customer } = bundle;
    const engineersList = overrides.engineers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // The single "Customer PO / Reference" edit field is treated as a
    // customer PO when the underlying job actually has one on file; otherwise
    // we treat the value as the internal reference so the printable header
    // labels it honestly ("REF:", not "PO NUMBER:").
    const originalHasCustomerPo = !!((job as any)?.customer_po || "").toString().trim();
    const editedRef = overrides.refNumber || "";
    return {
      address: overrides.siteAddress || null,
      customer: overrides.customerName || null,
      customers: customer
        ? { name: overrides.customerName || customer.name, logo_url: customer.logo_url || null }
        : (overrides.customerName ? { name: overrides.customerName, logo_url: null } : null),
      customer_po: originalHasCustomerPo ? editedRef : ((job as any)?.customer_po || null),
      reference_number: originalHasCustomerPo ? ((job as any)?.reference_number || "") : editedRef,
      category: job.category || null,
      name: job.name || null,
      priority: job.priority || null,
      visual_qty: job.visual_qty || 0,
      pressure_test_qty: job.pressure_test_qty || 0,
      other_qty: job.other_qty || 0,
      other_service_type: job.other_service_type || null,
      due_date: overrides.dueDate || null,
      engineers: engineersList,
      printNotes: overrides.notes || null,
      site: (overrides.siteName || overrides.siteAddress || overrides.riserLocation || overrides.sitePostcode)
        ? {
            name: overrides.siteName,
            address: overrides.siteAddress,
            postcode: overrides.sitePostcode,
            contact_name: null,
            contact_phone: null,
            contact_email: null,
            riser_location: overrides.riserLocation || null,
          }
        : null,
    };
  }, [bundle, overrides]);


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
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Edit-before-print — printout-only overrides, never saved back. */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Sheet details</div>
                  <div className="text-[11px] text-muted-foreground">
                    Edits apply to the printout only — they do not update the job record.
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Customer</Label>
                  <Input
                    value={overrides.customerName}
                    onChange={(e) => setOverrides((p) => ({ ...p, customerName: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Customer PO / Reference</Label>
                  <Input
                    value={overrides.refNumber}
                    onChange={(e) => setOverrides((p) => ({ ...p, refNumber: e.target.value }))}
                    className="h-8 text-sm"
                    placeholder="Customer's PO number"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Site name</Label>
                  <Input
                    value={overrides.siteName}
                    onChange={(e) => setOverrides((p) => ({ ...p, siteName: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Site postcode</Label>
                  <Input
                    value={overrides.sitePostcode}
                    onChange={(e) => setOverrides((p) => ({ ...p, sitePostcode: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Site address</Label>
                  <Input
                    value={overrides.siteAddress}
                    onChange={(e) => setOverrides((p) => ({ ...p, siteAddress: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Riser / equipment location</Label>
                  <Input
                    value={overrides.riserLocation}
                    onChange={(e) => setOverrides((p) => ({ ...p, riserLocation: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Scheduled date</Label>
                  <UKDateInput
                    value={overrides.dueDate}
                    onChange={(e) => setOverrides((p) => ({ ...p, dueDate: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Engineer(s) — comma separated</Label>
                  <Input
                    value={overrides.engineers}
                    onChange={(e) => setOverrides((p) => ({ ...p, engineers: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Notes for engineer (access, parking, keys, contact…)</Label>
                  <Textarea
                    value={overrides.notes}
                    onChange={(e) => setOverrides((p) => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    className="text-sm resize-none"
                    placeholder="e.g. Ring buzzer 3B on arrival — park in visitor bay 12. Keys with concierge."
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">Sheets to print</div>
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
