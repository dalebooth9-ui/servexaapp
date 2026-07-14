// Shared "confirm & file job" logic for both single-scan and bulk-scan
// paper report flows. Creates the completed job, the submitted job_sheet_response,
// and attaches source-scan photos as job_documents.
import { supabase } from "@/integrations/supabase/client";

export type PaperScanConfirmInput = {
  userId: string;
  template: {
    id: string;
    name: string;
    category: string | null;
    job_category: string | null;
    fields: { id: string; type: string; required?: boolean }[];
  };
  customerId: string;
  customerName: string | null;
  siteId: string;
  siteAddress: string | null;
  sitePostcode: string | null;
  jobName: string;
  completionDate: string; // dd/mm/yyyy or empty
  responses: Record<string, any>;
  header: Record<string, any>;
  // Photos to attach — either File objects (single flow) or storage paths
  // already uploaded in `submissions` (bulk flow).
  filePhotos?: File[];
  storagePhotoPaths?: string[];
};

export type PaperScanConfirmResult = {
  jobId: string;
  jobRef: string;
};

function deriveCategory(template: PaperScanConfirmInput["template"]): string {
  const c = template.category;
  if (c === "pressure_test") return "pressure_test";
  if (c === "visual") return "visual";
  if (
    c === "sprinkler" ||
    c === "sprinkler_service" ||
    c === "commercial_sprinkler_service"
  ) {
    return "commercial_sprinkler_service";
  }
  return c || template.job_category || "general";
}

export async function paperScanConfirm(
  input: PaperScanConfirmInput,
): Promise<PaperScanConfirmResult> {
  const {
    userId,
    template,
    customerId,
    customerName,
    siteId,
    siteAddress,
    sitePostcode,
    jobName,
    completionDate,
    responses,
    header,
    filePhotos,
    storagePhotoPaths,
  } = input;

  const jobAddress = [siteAddress, sitePostcode].filter(Boolean).join(", ");

  let completedAt = new Date().toISOString();
  if (completionDate) {
    const m = completionDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      completedAt = new Date(
        `${m[3]}-${m[2]}-${m[1]}T12:00:00Z`,
      ).toISOString();
    }
  }

  const category = deriveCategory(template);

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      name: jobName || `${template.name} — backfilled`,
      customer: customerName || null,
      customer_id: customerId,
      site_id: siteId,
      address: jobAddress || null,
      status: "completed",
      priority: "medium",
      category,
      source: "paper backfill",
      created_by: userId,
      completed_by: userId,
      completed_at: completedAt,
      pressure_test_qty: category === "pressure_test" ? 1 : 0,
      visual_qty: category === "visual" ? 1 : 0,
      other_qty:
        category !== "pressure_test" && category !== "visual" ? 1 : 0,
    } as any)
    .select("id, reference_number")
    .single();

  if (jobErr) throw jobErr;
  const jobId = (job as any).id as string;
  const jobRef = (job as any).reference_number as string;

  // Strip blank/undefined answers — paper backfill treats every template
  // field as optional. Only real, non-empty answers land in the payload.
  const fullResponses: Record<string, any> = {};
  for (const [k, v] of Object.entries(responses)) {
    if (v === undefined || v === null || v === "") continue;
    fullResponses[k] = v;
  }
  if (
    header.customer &&
    !fullResponses["customer_name"] &&
    template.fields.some((f) => f.id === "customer_name")
  ) {
    fullResponses.customer_name = header.customer;
  }
  if (header.po_ref && !fullResponses["po_number"]) {
    fullResponses.po_number = String(header.po_ref);
  }
  if (completionDate && !fullResponses["date"]) {
    fullResponses.date = completionDate;
  }
  if (header.engineer && !fullResponses["technician_name"]) {
    fullResponses.technician_name = header.engineer;
  }

  const { error: respErr } = await supabase
    .from("job_sheet_responses")
    .insert({
      job_id: jobId,
      template_id: template.id,
      submitted_by: userId,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      responses: fullResponses,
    } as any);
  if (respErr) throw respErr;

  // Attach photos
  if (filePhotos && filePhotos.length > 0) {
    for (let i = 0; i < filePhotos.length; i++) {
      const img = filePhotos[i];
      const ext =
        img.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      const safeName = `paper-scan-${i + 1}-${Date.now()}.${ext}`;
      const path = `job-documents/${jobId}/${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("submissions")
        .upload(path, img, {
          upsert: true,
          contentType: img.type || "image/jpeg",
        });
      if (upErr) {
        console.error("upload failed", upErr);
        continue;
      }
      const { data: urlData } = await supabase.storage
        .from("submissions")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      await supabase.from("job_documents" as any).insert({
        job_id: jobId,
        document_type: "source_scan",
        label: `Original paper form (page ${i + 1})`,
        file_url: urlData?.signedUrl || null,
        file_name: safeName,
        source: "manual",
        created_by: userId,
      });
    }
  } else if (storagePhotoPaths && storagePhotoPaths.length > 0) {
    // Photos already in `submissions` — copy into the job's folder
    for (let i = 0; i < storagePhotoPaths.length; i++) {
      const src = storagePhotoPaths[i];
      const ext =
        src.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const safeName = `paper-scan-${i + 1}-${Date.now()}.${ext}`;
      const dest = `job-documents/${jobId}/${safeName}`;
      const { error: copyErr } = await supabase.storage
        .from("submissions")
        .copy(src, dest);
      if (copyErr) {
        console.error("copy failed", src, copyErr);
        continue;
      }
      const { data: urlData } = await supabase.storage
        .from("submissions")
        .createSignedUrl(dest, 60 * 60 * 24 * 365 * 5);
      await supabase.from("job_documents" as any).insert({
        job_id: jobId,
        document_type: "source_scan",
        label: `Original paper form (page ${i + 1})`,
        file_url: urlData?.signedUrl || null,
        file_name: safeName,
        source: "manual",
        created_by: userId,
      });
    }
  }

  return { jobId, jobRef };
}
