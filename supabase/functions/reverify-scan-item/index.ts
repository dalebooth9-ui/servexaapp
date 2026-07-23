// One-shot verification: re-runs OCR against a paper_scan_batch_items row
// using the current pipeline and writes results back. Also nukes stored
// job report_docs so the client regenerates the electronic PDF on next
// open. Called manually by the agent for follow-up verification tasks.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "submissions";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function pathToBase64(supabase: any, path: string, orgId: string | null) {
  const candidates = [path];
  if (orgId && !path.startsWith(`${orgId}/`)) candidates.push(`${orgId}/${path}`);
  for (const p of candidates) {
    const { data } = await supabase.storage.from(BUCKET).download(p);
    if (!data) continue;
    const buf = await data.arrayBuffer();
    if (!buf.byteLength) continue;
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)) as any);
    }
    const ext = p.split(".").pop()?.toLowerCase() || "";
    const mime = (data as Blob).type ||
      (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
    return { image_base64: btoa(bin), mime_type: mime };
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { item_id, delete_reports, poll } = await req.json();
  if (!item_id) return new Response(JSON.stringify({ error: "item_id required" }), { status: 400, headers: corsHeaders });

  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  if (poll) {
    const { data } = await svc
      .from("paper_scan_batch_items")
      .select("extracted, header_data, detected_template_id")
      .eq("id", item_id)
      .maybeSingle();
    return new Response(JSON.stringify(data, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const work = async () => {
    try {
      const { data: item } = await svc
        .from("paper_scan_batch_items")
        .select("id, org_id, image_paths, detected_template_id, created_job_id")
        .eq("id", item_id)
        .maybeSingle();
      if (!item) throw new Error("item not found");

      const paths = (item as any).image_paths as string[];
      const orgId = (item as any).org_id as string;

      const payloads: any[] = [];
      for (const p of paths) {
        const enc = await pathToBase64(svc, p, orgId);
        if (enc) payloads.push(enc);
      }
      if (payloads.length === 0) throw new Error("no readable images");

      const templateId = (item as any).detected_template_id;
      if (!templateId) throw new Error("no template");

      const { data: tpl } = await svc
        .from("job_sheet_templates")
        .select("id, name, fields")
        .eq("id", templateId)
        .maybeSingle();
      if (!tpl) throw new Error("template not found");

      const fields = ((tpl as any).fields || []).map((f: any) => ({
        id: f.id, label: f.label, type: f.type, section: f.section, options: f.options,
        columns: f.columns, allow_notes: f.allow_notes,
      }));

      console.log(`reverify: ${payloads.length} pages, template=${(tpl as any).name}, ${fields.length} fields`);

      // Process pages in chunks of 2 to stay under the gateway idle timeout
      // that fires on all-6-pages-in-one-OCR request.
      const CHUNK = 2;
      const mergedExtracted: Record<string, any> = {};
      const mergedHeader: Record<string, any> = {};
      const mergedConf: Record<string, number> = {};
      let anyOk = false;
      const failures: string[] = [];

      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK);
        const chunkLabel = `pages ${i + 1}-${i + chunk.length}`;
        let ok = false;
        let lastErr = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const r = await fetch(`${SUPABASE_URL}/functions/v1/ocr-job-sheet`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: SERVICE_KEY },
              body: JSON.stringify({ images: chunk, template_name: (tpl as any).name, fields }),
            });
            if (r.ok) {
              const j = await r.json();
              const ex = j.extracted || {};
              const hd = j.header || {};
              const fc = j.field_confidence || {};
              for (const [k, v] of Object.entries(ex)) {
                if (v === null || v === undefined) continue;
                if (Array.isArray(v)) {
                  const prev = Array.isArray(mergedExtracted[k]) ? mergedExtracted[k] : [];
                  mergedExtracted[k] = [...prev, ...v];
                } else if (typeof v === "string") {
                  const s = v.trim();
                  const prev = mergedExtracted[k];
                  const prevIsBlank = prev == null || String(prev).trim() === "" || /^n\/?a$/i.test(String(prev));
                  if (s && !/^n\/?a$/i.test(s)) {
                    if (prevIsBlank) mergedExtracted[k] = v;
                  } else if (!(k in mergedExtracted)) {
                    mergedExtracted[k] = v;
                  }
                } else if (!(k in mergedExtracted)) {
                  mergedExtracted[k] = v;
                }
              }
              for (const [k, v] of Object.entries(hd)) {
                if (v == null || v === "") continue;
                if (!(k in mergedHeader) || !mergedHeader[k]) mergedHeader[k] = v;
              }
              for (const [k, v] of Object.entries(fc)) {
                if (typeof v === "number" && (mergedConf[k] == null || v > mergedConf[k])) mergedConf[k] = v;
              }
              ok = true;
              anyOk = true;
              console.log(`${chunkLabel}: ok, ${Object.keys(ex).length} fields`);
              break;
            } else {
              lastErr = `${r.status}: ${(await r.text()).substring(0, 150)}`;
            }
          } catch (e: any) {
            lastErr = e.message;
          }
          console.warn(`${chunkLabel} attempt ${attempt} failed: ${lastErr}`);
          if (attempt < 3) await new Promise((rr) => setTimeout(rr, 4000));
        }
        if (!ok) failures.push(`${chunkLabel}: ${lastErr}`);
      }

      if (!anyOk) throw new Error(`all chunks failed: ${failures.join(" | ")}`);
      if (Object.keys(mergedConf).length) mergedHeader._field_confidence = mergedConf;
      if (failures.length) mergedHeader._reverify_partial = failures.join(" | ");

      await svc
        .from("paper_scan_batch_items")
        .update({ extracted: mergedExtracted, header_data: mergedHeader })
        .eq("id", item_id);

      if (delete_reports && (item as any).created_job_id) {
        await svc
          .from("job_documents")
          .delete()
          .eq("job_id", (item as any).created_job_id)
          .eq("document_type", "report");
      }
      console.log("reverify: done, fields=", Object.keys(extracted).length);
    } catch (e: any) {
      console.error("reverify failed:", e.message);
      await svc
        .from("paper_scan_batch_items")
        .update({ header_data: { _reverify_error: e.message } })
        .eq("id", item_id);
    }
  };

  // Fire-and-forget with EdgeRuntime.waitUntil so the response returns fast
  // and the OCR keeps running.
  // @ts-ignore Deno edge runtime global
  EdgeRuntime.waitUntil(work());
  return new Response(JSON.stringify({ ok: true, started: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
