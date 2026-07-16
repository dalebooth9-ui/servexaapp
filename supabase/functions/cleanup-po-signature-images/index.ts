// One-shot cleanup: removes email-signature images (imageNNN.ext pattern) that
// were attached as job documents on email_po intake jobs, together with their
// storage objects in the po-intake bucket.
//
// Safe to re-run — matches only the signature-furniture filename pattern.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: docs, error } = await admin
    .from("job_documents")
    .select("id, file_name, file_url, job_id, jobs:jobs!inner(source)")
    .eq("jobs.source", "email_po")
    .like("file_url", "storage://po-intake/%");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const re = /^(image|oledata|clip_image)[0-9]{2,4}\.(png|jpe?g|gif|bmp|webp)$/i;
  const targets = (docs ?? []).filter((d: any) => re.test(d.file_name || ""));

  const paths = targets.map((d: any) =>
    String(d.file_url).replace("storage://po-intake/", ""),
  );
  const ids = targets.map((d: any) => d.id);

  let storageRemoved = 0;
  const storageErrors: string[] = [];
  // Chunk to avoid overly large payloads
  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { data: rm, error: rmErr } = await admin.storage
      .from("po-intake")
      .remove(chunk);
    if (rmErr) storageErrors.push(rmErr.message);
    else storageRemoved += (rm?.length ?? 0);
  }

  let docsRemoved = 0;
  if (ids.length > 0) {
    const { error: dErr, count } = await admin
      .from("job_documents")
      .delete({ count: "exact" })
      .in("id", ids);
    if (dErr) {
      return new Response(JSON.stringify({ error: dErr.message, storageRemoved }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    docsRemoved = count ?? 0;
  }

  const jobsAffected = new Set(targets.map((d: any) => d.job_id)).size;

  return new Response(JSON.stringify({
    ok: true,
    matched: targets.length,
    docs_deleted: docsRemoved,
    storage_objects_deleted: storageRemoved,
    jobs_affected: jobsAffected,
    storage_errors: storageErrors,
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});
