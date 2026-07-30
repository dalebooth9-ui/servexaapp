/**
 * Shared label-matching prefill for job sheet templates.
 * Used by both the engineer-facing form (JobSheetTemplates) and the
 * auto-attach flow (insertDraftResponses) so newly-attached drafts already
 * contain every detail we'd otherwise only fill on first open.
 */

export type PrefillField = {
  id: string;
  label: string;
  type: string;
  options?: string[];
};

export type PrefillJobInfo = {
  name?: string | null;
  address?: string | null;
  customer?: string | null;
  customers?: { name: string; logo_url?: string | null } | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  reference_number?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  priority?: string | null;
  visual_qty?: number | null;
  pressure_test_qty?: number | null;
  other_qty?: number | null;
  other_service_type?: string | null;
  engineers?: string[];
  site?: {
    name?: string | null;
    address?: string | null;
    postcode?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    riser_location?: string | null;
  } | null;
  /** dd/mm/yyyy or ISO — used for "attendance date" / "date" fields */
  scheduledDate?: string | null;
};

/**
 * Derive the "scope of work" wording from a template's title so it always
 * matches the document, e.g. "Dry Riser Annual Pressure Test" → "Pressure Test".
 * Returns null when nothing recognisable is found.
 */
export function deriveScopeFromTemplateName(templateName?: string | null): string | null {
  const n = (templateName || "").toLowerCase();
  if (!n) return null;
  if (n.includes("pressure test")) return "Pressure Test";
  if (n.includes("flow test") || n.includes("flow & pressure")) return "Flow Test";
  if (n.includes("visual")) return "Visual Inspection";
  if (n.includes("commission")) return "Commissioning";
  if (n.includes("install")) return "Installation";
  if (n.includes("service") || n.includes("maintenance") || n.includes("ppm")) return "Service & Maintenance";
  if (n.includes("inspection")) return "Inspection";
  if (n.includes("survey")) return "Survey";
  if (n.includes("repair")) return "Repair";
  if (n.includes("certificate") || n.includes("conformity")) return "Certification";
  return null;
}

export function buildJobSheetPrefill(
  fields: PrefillField[],
  jobInfo: PrefillJobInfo | null | undefined,
  templateName?: string | null,
): Record<string, any> {
  const prefilled: Record<string, any> = {};
  if (!jobInfo) return prefilled;

  const jobAddress = jobInfo.site?.address || jobInfo.address || "";
  // When the job has no linked site record, the job name is almost always the
  // site/premises name (e.g. "Robert Scotts"), so use it as a fallback.
  const siteName = jobInfo.site?.name || (!jobInfo.site ? (jobInfo.name || "") : "");
  const customerName = jobInfo.customers?.name || jobInfo.customer || "";
  const sitePostcode = jobInfo.site?.postcode || "";
  const siteContact = jobInfo.site?.contact_name || "";
  const siteContactPhone = jobInfo.site?.contact_phone || "";
  const siteContactEmail = jobInfo.site?.contact_email || "";
  const engineerList = (jobInfo.engineers || []).join(", ");
  const scheduledDate = jobInfo.scheduledDate || "";

  // Full address, never truncated, postcode appended unless already present.
  const fullAddress = (() => {
    const base = (jobAddress || "").trim();
    const pc = (sitePostcode || "").trim();
    if (!base) return pc;
    if (!pc) return base;
    return base.toLowerCase().includes(pc.toLowerCase()) ? base : `${base}, ${pc}`;
  })();

  const has = (label: string, ...words: string[]) => words.every((w) => label.includes(w));
  const eq = (label: string, ...opts: string[]) => opts.includes(label);

  fields.forEach((f) => {
    const lbl = (f.label || "").toLowerCase();
    const isDrainField = lbl.includes("drain") || lbl.includes("drop leg");
    const isYesNoSelect =
      !!f.options &&
      f.options.length <= 3 &&
      f.options.some((opt) => opt.toLowerCase() === "yes") &&
      f.options.some((opt) => opt.toLowerCase() === "no");

    if (isDrainField) {
      prefilled[f.id] = f.type === "checkbox" ? true : isYesNoSelect ? "YES" : true;
    }
    // Never auto-fill fields with options (engineer must pick), except drain yes/no
    if (f.options && f.options.length > 0 && !isDrainField) return;

    const label = lbl.replace(/[:\s]+$/g, "").replace(/[’']s\b/g, "").trim();
    const set = (v: any) => {
      if (v === undefined || v === null) return;
      if (typeof v === "string" && v.trim() === "") return; // never blank out
      prefilled[f.id] = v;
    };

    // --- Site ---
    if (has(label, "site", "detail") || has(label, "site", "info")) {
      set([siteName, jobAddress, sitePostcode].filter(Boolean).join("\n"));
    } else if (
      eq(label, "site name", "site", "premises name", "property name", "building name", "location name", "site/premises") ||
      (has(label, "site") && has(label, "name") && !label.includes("contact"))
    ) {
      set(siteName);
    } else if (
      eq(
        label,
        "site address",
        "address",
        "full address",
        "site location",
        "location",
        "property address",
        "premises address",
        "installation address",
        "premises",
        "address of works",
        "site addres",
      ) ||
      has(label, "site", "address") ||
      has(label, "address", "works")
    ) {
      set(fullAddress);
    } else if (label.includes("postcode") || label.includes("post code") || label.includes("zip")) {
      set(sitePostcode);
    } else if (has(label, "site", "contact", "name")) {
      set(siteContact);
    } else if (eq(label, "contact name", "contact person", "site contact")) {
      set(siteContact);
    } else if (has(label, "site", "contact", "phone") || has(label, "site", "tel")) {
      set(siteContactPhone);
    } else if (eq(label, "contact phone", "contact tel", "contact number", "contact no")) {
      set(siteContactPhone);
    } else if (has(label, "site", "email")) {
      set(siteContactEmail);

    // --- Customer / client ---
    } else if (has(label, "customer", "detail") || has(label, "client", "detail")) {
      set([customerName, jobInfo.customer_email, jobInfo.customer_phone].filter(Boolean).join("\n"));
    } else if ((label.includes("customer") || label.includes("client")) && label.includes("email")) {
      set(jobInfo.customer_email || "");
    } else if ((label.includes("customer") || label.includes("client")) && (label.includes("phone") || label.includes("tel"))) {
      set(jobInfo.customer_phone || "");
    } else if (
      eq(label, "customer name", "client name", "customer", "client", "company", "company name", "customer/client", "client/customer") ||
      ((label.includes("customer") || label.includes("client")) &&
        !label.includes("sign") && !label.includes("print") && !label.includes("position") && !label.includes("comment"))
    ) {
      set(customerName);

    // --- References ---
    } else if (
      label.includes("po number") || label.includes("p.o. number") || label.includes("purchase order") ||
      label.includes("reference") || label.includes("ref no") || label.includes("ref.") ||
      label.includes("job ref") || label.includes("job number") || label.includes("job no") ||
      label.includes("order number") || label.includes("order no") ||
      label.includes("works order") || label.includes("work order") ||
      eq(label, "w/o", "wo", "w/o no", "w/o number", "ref", "our ref", "job")
    ) {
      set(jobInfo.reference_number || "");
    } else if (
      eq(label, "job name", "job title", "job description", "description of work", "description of works",
        "works description", "project name", "project title", "contract", "works") ||
      label.includes("project description")
    ) {
      set(jobInfo.name || "");

    // --- Quantities ---
    } else if (
      (label.includes("number of") && (label.includes("system") || label.includes("riser"))) ||
      (label.includes("no. of") || (label.includes("no of") && (label.includes("system") || label.includes("riser")))) ||
      eq(label, "qty", "quantity of systems", "number of risers")
    ) {
      set(String(jobInfo.other_qty || 1));

    // --- Dates ---
    } else if (
      eq(label, "date", "inspection date", "service date", "visit date", "work date", "date of works",
        "date of work", "works date", "date of visit", "date of service", "date of inspection",
        "commissioning date", "installation date", "completion date", "test date", "date of test") ||
      has(label, "date", "works") || has(label, "date", "visit") || has(label, "date", "attendance")
    ) {
      set(scheduledDate || new Date().toISOString().split("T")[0]);
    } else if (label.includes("attendance date") || label === "rams_attendance_date" || label === "attendance") {
      set(scheduledDate || new Date().toLocaleDateString("en-GB"));

    // --- Scope / people ---
    } else if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("category") || label.includes("service type")) {
      const fromTitle = deriveScopeFromTemplateName(templateName);
      if (fromTitle) {
        set(fromTitle);
      } else {
        const scopeParts: string[] = [];
        if ((jobInfo.pressure_test_qty ?? 0) > 0) scopeParts.push(`Pressure Test ×${jobInfo.pressure_test_qty}`);
        if ((jobInfo.visual_qty ?? 0) > 0) scopeParts.push(`Visual Inspection ×${jobInfo.visual_qty}`);
        if ((jobInfo.other_qty ?? 0) > 0 && jobInfo.other_service_type) scopeParts.push(`${jobInfo.other_service_type} ×${jobInfo.other_qty}`);
        const categoryName = jobInfo.categoryLabel
          || (jobInfo.category ? jobInfo.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
        set(scopeParts.length > 0 ? scopeParts.join(", ") : categoryName);
      }
    } else if (eq(label, "priority", "job priority")) {
      set(jobInfo.priority || "");
    } else if (
      (label.includes("engineer") || label.includes("technician") || label.includes("operative") ||
        label.includes("carried out by") || label.includes("completed by") || label.includes("attended by") ||
        label.includes("inspected by") || label.includes("tested by")) &&
      !label.includes("sign")
    ) {
      set(engineerList);
    } else if (label.includes("pressure test") && (label.includes("qty") || label.includes("quantity") || label.includes("number"))) {
      set(String(jobInfo.pressure_test_qty ?? 0));
    } else if (label.includes("visual") && (label.includes("qty") || label.includes("quantity") || label.includes("number"))) {
      set(String(jobInfo.visual_qty ?? 0));
    } else if (label.includes("riser location") || label.includes("riser loc")) {
      set(jobInfo.site?.riser_location || "");
    }
  });


  return prefilled;
}

/**
 * Fetch the job context (job + customer + site + assigned engineers + earliest
 * scheduled date) needed by `buildJobSheetPrefill`. Used by code paths that
 * only have a jobId (e.g. auto-attach).
 */
export async function fetchJobPrefillContext(
  supabase: any,
  jobId: string,
): Promise<PrefillJobInfo | null> {
  const [jobRes, schedRes] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "name, address, customer, reference_number, category, status, priority, visual_qty, pressure_test_qty, other_qty, other_service_type, customer_id, site_id, customers(name, email, phone, logo_url), sites(name, address, postcode, contact_name, contact_phone, contact_email, riser_location)",
      )
      .eq("id", jobId)
      .maybeSingle(),
    supabase
      .from("job_schedule")
      .select("schedule_date")
      .eq("job_id", jobId)
      .order("schedule_date", { ascending: true })
      .limit(1),
  ]);

  const jd: any = jobRes.data;
  if (!jd) return null;

  let engineers: string[] = [];
  const { data: assigns } = await supabase
    .from("job_assignments")
    .select("engineer_id")
    .eq("job_id", jobId);
  if (assigns && assigns.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", assigns.map((a: any) => a.engineer_id));
    engineers = (profs || []).map((p: any) => p.full_name).filter(Boolean);
  }

  const scheduledDate = schedRes.data && schedRes.data.length > 0
    ? new Date(schedRes.data[0].schedule_date).toLocaleDateString("en-GB")
    : null;

  return {
    name: jd.name,
    address: jd.address,
    customer: jd.customers?.name || jd.customer,
    customer_email: jd.customers?.email || null,
    customer_phone: jd.customers?.phone || null,
    customers: jd.customers ? { name: jd.customers.name, logo_url: jd.customers.logo_url || null } : null,
    reference_number: jd.reference_number,
    category: jd.category,
    priority: jd.priority,
    visual_qty: jd.visual_qty,
    pressure_test_qty: jd.pressure_test_qty,
    other_qty: jd.other_qty ?? 0,
    other_service_type: jd.other_service_type ?? null,
    engineers,
    site: jd.sites
      ? {
          name: jd.sites.name,
          address: jd.sites.address,
          postcode: jd.sites.postcode,
          contact_name: jd.sites.contact_name,
          contact_phone: jd.sites.contact_phone,
          contact_email: jd.sites.contact_email,
          riser_location: jd.sites.riser_location,
        }
      : null,
    scheduledDate,
  };
}
