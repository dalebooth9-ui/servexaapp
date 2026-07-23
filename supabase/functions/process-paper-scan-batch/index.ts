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

// Anything left in "processing" longer than this is assumed dead (previous
// invocation OOM'd or timed out). We flip it back to pending so the next
// chunk retries it instead of blocking the batch forever.
const STUCK_PROCESSING_MS = 10 * 60 * 1000;

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

    // Unstick any items left in "processing" from a previous invocation that
    // died (OOM, timeout). Without this, a single failure blocks the whole
    // batch forever because the re-invoke only picks up "pending" rows.
    const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_MS).toISOString();
    await service
      .from("paper_scan_batch_items")
      .update({ status: "pending" })
      .eq("batch_id", batchId)
      .eq("status", "processing")
      .lt("updated_at", stuckCutoff);

    // Pick up to CHUNK_SIZE pending items
    const { data: items } = await service
      .from("paper_scan_batch_items")
      .select("id, image_paths, org_id")
      .eq("batch_id", batchId)
      .eq("status", "pending")
      .limit(CHUNK_SIZE);

    if (!items || items.length === 0) {
      // Mark batch complete if nothing pending or processing left
      const { count: leftover } = await service
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

    // Reserve the picked items in one shot so a concurrent invocation of this
    // same function (fired by the auto-kick below) won't try to double-process
    // the same rows.
    const pickedIds = items.map((it: any) => it.id as string);
    await service
      .from("paper_scan_batch_items")
      .update({ status: "processing" })
      .in("id", pickedIds);

    // Process items in parallel. Each item is I/O bound (download + classify +
    // OCR), so wall time collapses to ~= the slowest single item rather than
    // the sum of them. Previously CHUNK_SIZE=1 with re-invoke meant a fresh
    // cold-boot per sheet — 2 sheets took the sum of two boots plus two OCRs.
    await Promise.all(items.map(async (item: any) => {
      const itemId = item.id as string;
      const orgId = item.org_id as string;
      const paths: string[] = item.image_paths || [];

      try {
        // Download and base64 the images. Images are already downscaled
        // client-side by fileToScanBase64 / PDF splitter, so we ship them
        // straight to OCR without re-decoding here (which was OOMing).
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

        // Fire OCR in async write_back mode. ocr-job-sheet returns 202 in
        // ~200ms and continues extraction in its own EdgeRuntime.waitUntil
        // background, writing extracted/header_data directly to this item
        // row on completion. Decouples large multi-page bundles from the
        // 150s gateway timeout that used to kill 6-page sprinkler sheets.
        // We pre-write the classifier's confidence/template/candidates and
        // the fuzzy-match guesses BEFORE firing so the async writer only
        // needs to fill in extracted+header_data.
        const confidence = typeof top.confidence === "number" ? top.confidence : 0.5;

        // Fuzzy match (based on classifier's guessed header). Header data
        // will be overwritten by the OCR async writer, but we seed guesses
        // from classify candidates when they include header hints. In
        // practice classify doesn't return a header, so guesses will be
        // filled later during review — leave nulls for now.
        await service
          .from("paper_scan_batch_items")
          .update({
            status: "processing",
            confidence,
            detected_template_id: top.template_id,
            candidate_matches: candidates,
            error: null,
            header_data: {},
          })
          .eq("id", itemId);

        const ocrResp = await fetch(
          `${SUPABASE_URL}/functions/v1/ocr-job-sheet`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({
              images: payloads,
              template_name: (tpl as any).name,
              fields: fields.map((f: any) => ({
                id: f.id,
                label: f.label,
                type: f.type,
                section: f.section,
                options: f.options,
                columns: f.columns,
                allow_notes: f.allow_notes,
              })),
              write_back: { item_id: itemId },
            }),
          },
        );
        if (!ocrResp.ok && ocrResp.status !== 202) {
          const ocrErrText = await ocrResp.text();
          throw new Error(`ocr fire failed ${ocrResp.status}: ${ocrErrText.substring(0, 200)}`);
        }
        await ocrResp.text();
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
    }));

    // Bump processed_items by the size of this chunk in one update.
    const { data: b } = await service
      .from("paper_scan_batches")
      .select("processed_items")
      .eq("id", batchId)
      .maybeSingle();
    if (b) {
      await service
        .from("paper_scan_batches")
        .update({ processed_items: ((b as any).processed_items || 0) + items.length })
        .eq("id", batchId);
    }

    // Check what remains. Items now go "pending" -> "processing" (fire OCR)
    // -> async ocr writer flips them to "ready"/"low_confidence"/"failed".
    // Re-invoke while any pending remain (to pick up the next chunk), and
    // if all pending are drained but some are still "processing", poll
    // again in 20s to sweep for completion. Only mark the batch complete
    // when NOTHING is pending or processing.
    const { count: pendingLeft } = await service
      .from("paper_scan_batch_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId)
      .eq("status", "pending");
    const { count: processingLeft } = await service
      .from("paper_scan_batch_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId)
      .eq("status", "processing");

    const reinvoke = (delayMs: number) => {
      const fire = () => fetch(`${SUPABASE_URL}/functions/v1/process-paper-scan-batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ batch_id: batchId }),
      }).catch((e) => console.error("re-invoke failed", e));
      if (delayMs > 0) setTimeout(fire, delayMs);
      else fire();
    };

    if ((pendingLeft || 0) > 0) {
      reinvoke(0);
    } else if ((processingLeft || 0) > 0) {
      // Sweep in 20s to detect completion (or reclaim stuck items via the
      // STUCK_PROCESSING_MS cutoff at the top of the next invocation).
      reinvoke(20000);
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
