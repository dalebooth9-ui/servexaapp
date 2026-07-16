import { useEffect, useRef, useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import BlankTemplatePdfExport, {
  type BlankTemplatePdfExportHandle,
} from "@/components/BlankTemplatePdfExport";

type Props = {
  job: any;
};

/**
 * Normalise category slugs to the canonical form used by the template library
 * (same mapping JobDocuments uses for matchedTemplate).
 */
const normCategory = (c?: string | null) => {
  if (!c) return "";
  const x = c.toLowerCase();
  if (x === "sprinkler_service") return "sprinkler";
  if (x === "hydrant_service" || x === "fire_hydrant_service") return "fire_hydrant";
  if (x === "fire_extinguishers" || x === "extinguisher_service") return "fire_extinguisher";
  if (x === "dry_riser_service") return "dry_riser";
  return x;
};

/**
 * Pick the best template for a job by category. Prefers same-category templates,
 * then published over draft, then most recently updated.
 */
function pickTemplateForJob(templates: any[], jobCategory?: string | null) {
  if (!templates.length) return null;
  const jobCat = normCategory(jobCategory);
  const scored = templates.map((t) => {
    const tCat = normCategory(t.job_category);
    const status = (t.status ?? "published").toLowerCase();
    let score = 0;
    if (jobCat && tCat === jobCat) score += 100;
    if (status === "published") score += 10;
    return { t, score, updatedAt: t.updated_at || t.created_at || "" };
  });
  scored.sort((a, b) => b.score - a.score || (a.updatedAt < b.updatedAt ? 1 : -1));
  return scored[0]?.score > 0 ? scored[0].t : null;
}

/**
 * "Print Job Sheet" button shown on each job row. Fetches the job's real
 * customer / site / PO details, picks the right template for the job's
 * category, and prints the pre-filled sheet using the same headless PDF
 * pipeline as the documents tab.
 */
export default function JobPrintSheetButton({ job }: Props) {
  const { toast } = useToast();
  const pdfRef = useRef<BlankTemplatePdfExportHandle>(null);
  const [loading, setLoading] = useState(false);
  const [template, setTemplate] = useState<any | null>(null);
  const [jobInfo, setJobInfo] = useState<any | null>(null);
  const shouldPrint = useRef(false);

  // Once template + jobInfo are populated after a click, trigger print.
  useEffect(() => {
    if (!shouldPrint.current) return;
    if (!template || !jobInfo || !pdfRef.current) return;
    shouldPrint.current = false;
    Promise.resolve(pdfRef.current.print())
      .catch((e: any) =>
        toast({
          title: "Could not print job sheet",
          description: e?.message ?? "Unknown error",
          variant: "destructive",
        }),
      )
      .finally(() => setLoading(false));
  }, [template, jobInfo, toast]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      // Fetch full job context (customer, site, engineers).
      const { data: jd, error } = await supabase
        .from("jobs")
        .select(
          "name, address, customer, reference_number, customer_po, category, status, priority, visual_qty, pressure_test_qty, other_qty, other_service_type, customer_id, site_id, customers(name, email, phone, logo_url), sites(name, address, postcode, contact_name, contact_phone, contact_email, riser_location)",
        )
        .eq("id", job.id)
        .single();
      if (error || !jd) throw error || new Error("Job not found");
      const j = jd as any;

      let engineerNames: string[] = [];
      const { data: assigns } = await supabase
        .from("job_assignments")
        .select("engineer_id")
        .eq("job_id", job.id);
      if (assigns && assigns.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in(
            "user_id",
            assigns.map((a: any) => a.engineer_id),
          );
        engineerNames = (profs || []).map((p: any) => p.full_name).filter(Boolean);
      }

      const info = {
        name: j.name,
        address: j.address,
        customer: j.customers?.name || j.customer,
        customers: j.customers
          ? { name: j.customers.name, logo_url: j.customers.logo_url || null }
          : null,
        customer_email: j.customers?.email || null,
        customer_phone: j.customers?.phone || null,
        reference_number: j.reference_number,
        customer_po: j.customer_po ?? null,
        category: j.category,
        status: j.status,
        priority: j.priority,
        visual_qty: j.visual_qty,
        pressure_test_qty: j.pressure_test_qty,
        other_qty: j.other_qty ?? 0,
        other_service_type: j.other_service_type ?? null,
        engineers: engineerNames,
        site: j.sites
          ? {
              name: j.sites.name,
              address: j.sites.address,
              postcode: j.sites.postcode,
              contact_name: j.sites.contact_name,
              contact_phone: j.sites.contact_phone,
              contact_email: j.sites.contact_email,
              riser_location: j.sites.riser_location,
            }
          : null,
      };

      // Match a template by job category.
      const { data: tpls } = await supabase
        .from("job_sheet_templates")
        .select("*");
      const normalised = (tpls || []).map((t: any) => ({
        ...t,
        fields: typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields,
        branding: t.branding || {},
      }));
      const matched = pickTemplateForJob(normalised, j.category);
      if (!matched) {
        toast({
          title: "No job sheet template found",
          description: `No template is configured for category "${j.category || "general"}". Add one in Industry Templates.`,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      shouldPrint.current = true;
      setTemplate(matched);
      setJobInfo(info);
    } catch (err: any) {
      toast({
        title: "Could not print job sheet",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="text-muted-foreground hover:text-primary transition-colors p-0.5 disabled:opacity-50"
        title="Print job sheet"
        aria-label="Print job sheet"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Printer className="h-3.5 w-3.5" />
        )}
      </button>
      {template && jobInfo && (
        <BlankTemplatePdfExport
          ref={pdfRef}
          template={template}
          jobInfo={jobInfo}
          headless
        />
      )}
    </>
  );
}
