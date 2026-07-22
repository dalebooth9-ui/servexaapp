// Background processor for bulk paper-scan batches.
// For each pending item in a batch: downloads its photos from storage,
// classifies against the org's job_sheet_templates, then extracts field
// answers using the existing ocr-job-sheet edge function.
// Results are written back onto paper_scan_batch_items rows.
//
// Invocation:
//   POST { batch_id: string } with the admin user's JWT in Authorization.
// The function processes up to CHUNK_SIZE items and if more remain,
// re-invokes itself to continue (so we never exhaust one edge invocation).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Process several items per invocation, in parallel. Each item is one
// classify + one OCR call — both I/O bound — so the edge worker sits idle
// waiting for network anyway. Parallelising 3-at-a-time cuts wall time ~3x
// without meaningfully raising memory (we no longer decode images server-side).
const CHUNK_SIZE = 3;
const BUCKET = "submissions";
const CONFIDENCE_READY_THRESHOLD = 0.7;
const OCR_MAX_ATTEMPTS = 3;
// Anything left in "processing" longer than this is assumed dead (previous
// invocation OOM'd or timed out). We flip it back to pending so the next
// chunk retries it instead of blocking the batch forever.
const STUCK_PROCESSING_MS = 4 * 60 * 1000;

// NOTE: image downscaling used to happen HERE via imagescript, which regularly
// tripped the edge worker's memory limit on 4000px phone photos and killed the
// whole invocation mid-batch (items stuck in "processing", batch never
// completes, UI shows "Not detected"). Uploaders (`fileToScanBase64` and the
// PDF splitter) already downscale to ~1800px before upload, so re-decoding
// server-side was pure downside. Removed.


// Translate raw upstream errors into an operator-friendly one-liner. The
// review queue surfaces this string directly; keep it actionable.
function friendlyError(raw: string): string {
  const s = String(raw || "");
  if (/IDLE_TIMEOUT|504|timeout|timed out/i.test(s)) {
    return "Timed out reading this sheet — tap Retry to try again.";
  }
  if (/429/.test(s)) {
    return "AI is busy right now — tap Retry in a moment.";
  }
  if (/402/.test(s) || /credits/i.test(s)) {
    return "AI credits exhausted — top up in Settings, then tap Retry.";
  }
  if (/No matching template/i.test(s)) {
    return "Couldn't match this sheet to a template. Open it and pick one, or add a matching template.";
  }
  if (/Couldn't read scan images|No readable images/i.test(s)) {
    return "Couldn't read the uploaded scan file — try re-uploading a clearer photo.";
  }
  return s.length > 180 ? s.substring(0, 177) + "…" : s;
}

async function pathToBase64(
  supabase: ReturnType<typeof createClient>,
  path: string,
  orgId: string | null,
): Promise<
  { image_base64: string; mime_type: string } | { error: string }
> {
  // Try stored path first, then the org-prefixed variant. Legacy items were
  // written with a path relative to the org root (e.g. "paper-batches/…") but
  // the actual object in storage lives at "<orgId>/paper-batches/…" because
  // uploads went through buildOrgPathAsync. Falling back to the prefixed
  // form transparently heals those rows without a re-upload.
  const candidates: string[] = [path];
  if (orgId && !path.startsWith(`${orgId}/`)) {
    candidates.push(`${orgId}/${path}`);
  }
  let lastErr = "unknown";
  for (const p of candidates) {
    const { data, error } = await supabase.storage.from(BUCKET).download(p);
    if (error || !data) {
      lastErr = error?.message || "download returned no data";
      continue;
    }
    const buf = await data.arrayBuffer();
    if (buf.byteLength === 0) {
      lastErr = "empty file";
      continue;
    }
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + CHUNK)) as any,
      );
    }
    let mime = (data as Blob).type || "";
    if (!mime || mime === "application/octet-stream") {
      const ext = p.split(".").pop()?.toLowerCase() || "";
      mime = ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : ext === "heic" || ext === "heif"
        ? "image/heic"
        : ext === "tif" || ext === "tiff"
        ? "image/tiff"
        : "image/jpeg";
    }
    return { image_base64: btoa(bin), mime_type: mime };
  }
  console.error("download failed", path, "orgId=", orgId, "err=", lastErr);
  return { error: `${path}: ${lastErr}` };
}

// Loose company-name normaliser for fuzzy matching. Strips company suffixes,
// punctuation and collapses whitespace so "BESSEGES" matches
// "Besseges Fire Protection Ltd." and "SAFELY COMPLY" matches "Safely Comply".
function normaliseCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,&/'"`()]/g, " ")
    .replace(/\b(ltd|limited|plc|llp|inc|co|company|uk|group|holdings|services|fire|protection|systems|solutions)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DOMAIN_LIKE_RE = /(https?:\/\/|www\.|@)|\.[a-z]{2,}(\.[a-z]{2,})?(\/|$)|^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function normaliseOrgId(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/^www\./, "")
    .replace(/\.(co\.uk|com|net|org|io|uk|ltd)$/g, "")
    .replace(/\s+(ltd|limited|plc|llp|inc)\.?$/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function fuzzyMatchCustomer(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  name: string,
): Promise<string | null> {
  const raw = name.trim();
  if (raw.length < 2) return null;
  // Guard: a "customer" candidate that is actually a URL / domain / email is
  // almost always the generating org's own website printed in the sheet
  // footer being misread as a customer. Reject up-front.
  if (DOMAIN_LIKE_RE.test(raw)) return null;

  // Load the generating org's identifiers so we never match a candidate that
  // collapses to the org's own identity (org name, intake email local-part).
  const { data: orgRow } = await supabase
    .from("organisations")
    .select("name, intake_email, scan_intake_email")
    .eq("id", orgId)
    .maybeSingle();
  const orgIds = [
    (orgRow as any)?.name,
    (orgRow as any)?.intake_email,
    (orgRow as any)?.scan_intake_email,
  ].filter(Boolean).map((s: string) => normaliseOrgId(s));
  const candidateNorm = normaliseOrgId(raw);
  if (candidateNorm && orgIds.some((n) => n === candidateNorm || n.includes(candidateNorm) || candidateNorm.includes(n))) {
    return null;
  }

  // Exact-ish first — but skip customer records whose *name* is itself
  // domain-shaped (e.g. a legacy "vivafire.co.uk" row created by an earlier
  // buggy match). Those are never valid customers.
  const { data: exactRows } = await supabase
    .from("customers")
    .select("id, name")
    .eq("org_id", orgId)
    .ilike("name", `%${raw.substring(0, 40)}%`)
    .limit(5);
  for (const row of (exactRows as any[]) || []) {
    if (!DOMAIN_LIKE_RE.test(String(row.name || ""))) return row.id;
  }

  // Fuzzy by normalised token overlap
  const target = normaliseCompany(raw);
  if (!target) return null;
  const { data: all } = await supabase
    .from("customers")
    .select("id, name")
    .eq("org_id", orgId);
  const rows = (all as any[]) || [];
  let best: { id: string; score: number } | null = null;
  for (const r of rows) {
    if (DOMAIN_LIKE_RE.test(String(r.name || ""))) continue;
    const cand = normaliseCompany(String(r.name || ""));
    if (!cand) continue;
    if (cand === target || cand.includes(target) || target.includes(cand)) {
      const score = Math.min(cand.length, target.length) /
        Math.max(cand.length, target.length);
      if (!best || score > best.score) best = { id: r.id, score };
    }
  }
  return best && best.score >= 0.4 ? best.id : null;
}

async function fuzzyGuessSite(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  header: Record<string, unknown> | null,
): Promise<{
  customerId: string | null;
  siteId: string | null;
  paperworkOwnerMatchedCustomerId: string | null;
}> {
  if (!header) {
    return {
      customerId: null,
      siteId: null,
      paperworkOwnerMatchedCustomerId: null,
    };
  }
  const siteName = String(header.site || header.site_name || "").trim();
  const customerFieldName = String(
    header.customer || header.customer_name || "",
  ).trim();
  const paperworkOwner = String(header.paperwork_owner_company || "").trim();

  let siteId: string | null = null;
  let customerId: string | null = null;
  let paperworkOwnerMatchedCustomerId: string | null = null;

  if (siteName.length >= 3) {
    const { data } = await supabase
      .from("sites")
      .select("id")
      .eq("org_id", orgId)
      .ilike("name", `%${siteName.substring(0, 40)}%`)
      .limit(1)
      .maybeSingle();
    if (data) siteId = (data as any).id;
  }

  // Letterhead WINS as the paperwork owner / customer guess (per spec).
  if (paperworkOwner.length >= 2) {
    paperworkOwnerMatchedCustomerId = await fuzzyMatchCustomer(
      supabase,
      orgId,
      paperworkOwner,
    );
    if (paperworkOwnerMatchedCustomerId) {
      customerId = paperworkOwnerMatchedCustomerId;
    }
  }

  // Fallback to the 'Customer:' field if letterhead didn't produce a match.
  if (!customerId && customerFieldName.length >= 3) {
    customerId = await fuzzyMatchCustomer(supabase, orgId, customerFieldName);
  }

  if (siteId && !customerId) {
    const { data } = await supabase
      .from("customer_sites")
      .select("customer_id")
      .eq("site_id", siteId)
      .limit(1)
      .maybeSingle();
    if (data) customerId = (data as any).customer_id;
  }

  return { customerId, siteId, paperworkOwnerMatchedCustomerId };
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const jwt = authHeader.substring("Bearer ".length);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let batchId: string;
  try {
    const body = await req.json();
    batchId = body.batch_id;
    if (!batchId) throw new Error("batch_id required");
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || "bad request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const work = (async () => {
    try {

    // Verify caller is admin in the batch's org
    const { data: batch } = await service
      .from("paper_scan_batches")
      .select("id, org_id, status, total_items, processed_items")
      .eq("id", batchId)
      .maybeSingle();
    if (!batch) throw new Error("Batch not found");

    const { data: isAdmin } = await service.rpc("has_role_in_org", {
      _user_id: user.id,
      _org_id: (batch as any).org_id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick up to CHUNK_SIZE pending items
    const { data: items } = await service
      .from("paper_scan_batch_items")
      .select("id, image_paths, org_id")
      .eq("batch_id", batchId)
      .eq("status", "pending")
      .limit(CHUNK_SIZE);

    if (!items || items.length === 0) {
      // Mark batch complete if nothing pending or processing left
      const { data: leftover } = await service
        .from("paper_scan_batch_items")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId)
        .in("status", ["pending", "processing"]);
      if (!leftover) {
        await service
          .from("paper_scan_batches")
          .update({ status: "complete" })
          .eq("id", batchId);
      }
      return;
    }

    for (const item of items) {
      const itemId = (item as any).id;
      const orgId = (item as any).org_id;
      const paths: string[] = (item as any).image_paths || [];

      await service
        .from("paper_scan_batch_items")
        .update({ status: "processing" })
        .eq("id", itemId);

      try {
        // Download and base64 the images
        const payloads: { image_base64: string; mime_type?: string }[] = [];
        const downloadErrors: string[] = [];
        for (const p of paths) {
          const enc = await pathToBase64(service, p, orgId);
          if ("error" in enc) downloadErrors.push(enc.error);
          else payloads.push(enc);
        }
        if (payloads.length === 0) {
          throw new Error(
            downloadErrors.length
              ? `Couldn't read scan images from storage — ${downloadErrors.join("; ")}`
              : "No readable images",
          );
        }

        // Classify: call classify-job-sheet-template with user JWT
        const clsResp = await fetch(
          `${SUPABASE_URL}/functions/v1/classify-job-sheet-template`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${jwt}`,
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ images: payloads }),
          },
        );
        if (!clsResp.ok) {
          throw new Error(
            `classify failed ${clsResp.status}: ${await clsResp.text()}`,
          );
        }
        const clsJson = await clsResp.json();
        const candidates: any[] = clsJson.candidates || [];
        if (candidates.length === 0) {
          throw new Error("No matching template");
        }
        const top = candidates[0];

        // Fetch full template fields
        const { data: tpl } = await service
          .from("job_sheet_templates")
          .select("id, name, category, job_category, fields")
          .eq("id", top.template_id)
          .maybeSingle();
        if (!tpl) throw new Error("Template not found");

        const fields = Array.isArray((tpl as any).fields)
          ? (tpl as any).fields
          : [];

        // Downscale big phone-camera photos before sending to OCR — full-res
        // 4000px+ images regularly blow the 150s gateway idle timeout.
        const ocrPayloads = [] as { image_base64: string; mime_type?: string }[];
        for (const p of payloads) {
          ocrPayloads.push(await downscaleForOcr(p.image_base64, p.mime_type));
        }

        // OCR/extract — retry with backoff on 5xx / idle-timeout. The upstream
        // AI extraction can be slow on complex sheets and occasionally the
        // gateway kills the connection; a second attempt usually succeeds.
        let ocrResp: Response | null = null;
        let ocrErrText = "";
        for (let attempt = 1; attempt <= OCR_MAX_ATTEMPTS; attempt++) {
          try {
            ocrResp = await fetch(
              `${SUPABASE_URL}/functions/v1/ocr-job-sheet`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${jwt}`,
                  "Content-Type": "application/json",
                  apikey: SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                  images: ocrPayloads,
                  template_name: (tpl as any).name,
                  fields: fields.map((f: any) => ({
                    id: f.id,
                    label: f.label,
                    type: f.type,
                    section: f.section,
                    options: f.options,
                  })),
                }),
              },
            );
            if (ocrResp.ok) break;
            ocrErrText = await ocrResp.text();
            const retriable = ocrResp.status >= 500 || ocrResp.status === 408 ||
              /IDLE_TIMEOUT|timeout/i.test(ocrErrText);
            if (!retriable || attempt === OCR_MAX_ATTEMPTS) {
              throw new Error(`ocr failed ${ocrResp.status}: ${ocrErrText.substring(0, 200)}`);
            }
          } catch (fetchErr: any) {
            ocrErrText = fetchErr?.message || String(fetchErr);
            if (attempt === OCR_MAX_ATTEMPTS) {
              throw new Error(`ocr failed: ${ocrErrText.substring(0, 200)}`);
            }
          }
          // Exponential backoff: 2s, 5s
          const waitMs = attempt === 1 ? 2000 : 5000;
          console.warn(`OCR attempt ${attempt} failed (${ocrErrText.substring(0, 100)}), retrying in ${waitMs}ms`);
          await new Promise((r) => setTimeout(r, waitMs));
        }
        if (!ocrResp || !ocrResp.ok) {
          throw new Error(`ocr failed: ${ocrErrText.substring(0, 200)}`);
        }
        const ocrJson = await ocrResp.json();
        const extracted = ocrJson.extracted || {};
        const header = ocrJson.header || {};
        // Mirror per-field confidence onto header so the review UI (which
        // only receives header_data) can surface amber "check this" flags
        // on low-confidence / unmarked rows.
        if (ocrJson.field_confidence && typeof ocrJson.field_confidence === "object") {
          (header as any)._field_confidence = ocrJson.field_confidence;
        }

        // Guess customer/site (letterhead wins over form 'Customer:' field)
        const { customerId, siteId, paperworkOwnerMatchedCustomerId } =
          await fuzzyGuessSite(service, orgId, header);
        // Stamp match diagnostics onto header so the review UI can surface a
        // "Detected letterhead: X — no matching customer" banner when the
        // paperwork owner was recognised but doesn't match any customer.
        const paperworkOwner = String(
          (header as any).paperwork_owner_company || "",
        ).trim();
        if (paperworkOwner) {
          (header as any).paperwork_owner_matched_customer_id =
            paperworkOwnerMatchedCustomerId;
        }


        // Guess date
        let guessDate: string | null = null;
        const rawDate = String(header.date || "").trim();
        if (rawDate) {
          const m = rawDate.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
          if (m) {
            const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
            const dd = m[1].padStart(2, "0");
            const mm = m[2].padStart(2, "0");
            guessDate = `${yyyy}-${mm}-${dd}`;
          }
        }

        const confidence = typeof top.confidence === "number"
          ? top.confidence
          : 0.5;
        const status = confidence >= CONFIDENCE_READY_THRESHOLD
          ? "ready"
          : "low_confidence";

        await service
          .from("paper_scan_batch_items")
          .update({
            status,
            confidence,
            detected_template_id: top.template_id,
            candidate_matches: candidates,
            extracted,
            header_data: header,
            guess_customer_id: customerId,
            guess_site_id: siteId,
            guess_date: guessDate,
            error: null,
          })
          .eq("id", itemId);
      } catch (e: any) {
        console.error("item failed", itemId, e?.message);
        await service
          .from("paper_scan_batch_items")
          .update({
            status: "failed",
            error: friendlyError(e?.message || "Unknown error").substring(0, 400),
          })
          .eq("id", itemId);
      }

      // Increment processed_items
      const { data: b } = await service
        .from("paper_scan_batches")
        .select("processed_items")
        .eq("id", batchId)
        .maybeSingle();
      if (b) {
        await service
          .from("paper_scan_batches")
          .update({ processed_items: ((b as any).processed_items || 0) + 1 })
          .eq("id", batchId);
      }
    }

    // Check if more pending — re-invoke self
    const { count: pendingLeft } = await service
      .from("paper_scan_batch_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId)
      .eq("status", "pending");

    if ((pendingLeft || 0) > 0) {
      // Fire and forget re-invocation (do not await response)
      fetch(`${SUPABASE_URL}/functions/v1/process-paper-scan-batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ batch_id: batchId }),
      }).catch((e) => console.error("re-invoke failed", e));
    } else {
      await service
        .from("paper_scan_batches")
        .update({ status: "complete" })
        .eq("id", batchId);
    }
    } catch (e: any) {
      console.error("process-paper-scan-batch bg error:", e);
    }
  })();

  // @ts-ignore EdgeRuntime is provided by supabase edge runtime
  try { EdgeRuntime.waitUntil(work); } catch { work.catch(() => {}); }

  return new Response(
    JSON.stringify({ ok: true, accepted: true }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
