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

export function buildJobSheetPrefill(
  fields: PrefillField[],
  jobInfo: PrefillJobInfo | null | undefined,
): Record<string, any> {
  const prefilled: Record<string, any> = {};
  if (!jobInfo) return prefilled;

  const jobAddress = jobInfo.address || jobInfo.site?.address || "";
  const siteName = jobInfo.site?.name || "";
  const customerName = jobInfo.customers?.name || jobInfo.customer || "";
  const sitePostcode = jobInfo.site?.postcode || "";
  const siteContact = jobInfo.site?.contact_name || "";
  const siteContactPhone = jobInfo.site?.contact_phone || "";
  const siteContactEmail = jobInfo.site?.contact_email || "";
  const engineerList = (jobInfo.engineers || []).join(", ");
  const scheduledDate = jobInfo.scheduledDate || "";

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

    const label = lbl.replace(/[:\s]+$/g, "").trim();

    if ((label.includes("site") && label.includes("detail")) || (label.includes("site") && label.includes("info"))) {
      prefilled[f.id] = [siteName, jobAddress, sitePostcode].filter(Boolean).join("\n");
    } else if (label === "site name" || label === "site") {
      prefilled[f.id] = siteName;
    } else if (label === "site address" || label === "address") {
      prefilled[f.id] = [jobAddress, sitePostcode].filter(Boolean).join(", ");
    } else if (label.includes("postcode") || label.includes("post code") || label.includes("zip")) {
      prefilled[f.id] = sitePostcode;
    } else if (label.includes("site") && label.includes("contact") && label.includes("name")) {
      prefilled[f.id] = siteContact;
    } else if (label === "contact name" || label === "contact person") {
      prefilled[f.id] = siteContact;
    } else if ((label.includes("site") && label.includes("contact") && label.includes("phone")) || (label.includes("site") && label.includes("tel"))) {
      prefilled[f.id] = siteContactPhone;
    } else if (label === "contact phone" || label === "contact tel" || label === "contact number") {
      prefilled[f.id] = siteContactPhone;
    } else if (label.includes("site") && label.includes("email")) {
      prefilled[f.id] = siteContactEmail;
    } else if ((label.includes("customer") && label.includes("detail")) || (label.includes("client") && label.includes("detail"))) {
      prefilled[f.id] = [customerName, jobInfo.customer_email, jobInfo.customer_phone].filter(Boolean).join("\n");
    } else if (label === "customer name" || label === "client name" || label === "customer" || label === "client") {
      prefilled[f.id] = customerName;
    } else if (label.includes("customer") && !label.includes("sign") && !label.includes("email") && !label.includes("phone")) {
      prefilled[f.id] = customerName;
    } else if ((label.includes("customer") || label.includes("client")) && label.includes("email")) {
      prefilled[f.id] = jobInfo.customer_email || "";
    } else if ((label.includes("customer") || label.includes("client")) && (label.includes("phone") || label.includes("tel"))) {
      prefilled[f.id] = jobInfo.customer_phone || "";
    } else if (label.includes("po number") || label.includes("reference") || label.includes("ref no") || label.includes("job ref") || label.includes("job number") || label.includes("order number")) {
      prefilled[f.id] = jobInfo.reference_number || "";
    } else if (
      label === "job name" || label === "job title" || label === "job description" ||
      label === "description of work" || label === "works description" ||
      label === "project name" || label === "project title" || label === "contract" ||
      label.includes("project description") || label === "works"
    ) {
      prefilled[f.id] = jobInfo.name || "";
    } else if (
      label === "site address" || label === "address" || label === "location" ||
      label === "site location" || label === "property address" || label === "premises address" ||
      label === "installation address" || label === "premises"
    ) {
      prefilled[f.id] = [jobAddress, sitePostcode].filter(Boolean).join(", ");
    } else if (
      (label.includes("number of") && (label.includes("system") || label.includes("riser"))) ||
      (label.includes("no. of") || (label.includes("no of") && (label.includes("system") || label.includes("riser")))) ||
      label === "qty" || label === "quantity of systems" || label === "number of risers"
    ) {
      prefilled[f.id] = String(jobInfo.other_qty || 1);
    } else if (label === "date" || label === "inspection date" || label === "service date" || label === "visit date" || label === "work date" || label === "commissioning date" || label === "installation date" || label === "completion date") {
      prefilled[f.id] = scheduledDate || new Date().toISOString().split("T")[0];
    } else if (label.includes("attendance date") || label === "rams_attendance_date" || label === "attendance") {
      prefilled[f.id] = scheduledDate || new Date().toLocaleDateString("en-GB");
    } else if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("category") || label.includes("service type")) {
      const scopeParts: string[] = [];
      if ((jobInfo.pressure_test_qty ?? 0) > 0) scopeParts.push(`Pressure Test ×${jobInfo.pressure_test_qty}`);
      if ((jobInfo.visual_qty ?? 0) > 0) scopeParts.push(`Visual Inspection ×${jobInfo.visual_qty}`);
      if ((jobInfo.other_qty ?? 0) > 0 && jobInfo.other_service_type) scopeParts.push(`${jobInfo.other_service_type} ×${jobInfo.other_qty}`);
      const categoryName = jobInfo.categoryLabel
        || (jobInfo.category ? jobInfo.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
      prefilled[f.id] = scopeParts.length > 0 ? scopeParts.join(", ") : categoryName;
    } else if (label === "priority" || label === "job priority") {
      prefilled[f.id] = jobInfo.priority || "";
    } else if (label.includes("engineer") || label.includes("technician") || label.includes("operative") || label.includes("carried out by") || label.includes("completed by") || label.includes("attended by")) {
      prefilled[f.id] = engineerList;
    } else if (label.includes("pressure test") && (label.includes("qty") || label.includes("quantity") || label.includes("number"))) {
      prefilled[f.id] = String(jobInfo.pressure_test_qty ?? 0);
    } else if (label.includes("visual") && (label.includes("qty") || label.includes("quantity") || label.includes("number"))) {
      prefilled[f.id] = String(jobInfo.visual_qty ?? 0);
    } else if (label.includes("riser location") || label.includes("riser loc")) {
      prefilled[f.id] = jobInfo.site?.riser_location || "";
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
