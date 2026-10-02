// portal-document-url — returns a short-lived signed link for a job document
// the signed-in customer portal user is allowed to see (shareable only).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const parsed = z.object({ documentId: z.string().uuid() }).safeParse(await req.json());
    if (!parsed.success) return json({ error: "Invalid request" }, 400);

    // RLS on job_documents limits the caller to shareable docs on jobs they can see.
    const { data: doc } = await caller.from("job_documents").select("file_url, shareable_with_customer").eq("id", parsed.data.documentId).maybeSingle();
    if (!doc || !doc.shareable_with_customer || !doc.file_url) return json({ error: "Not found" }, 404);
    const m = String(doc.file_url).match(/^storage:\/\/([^/]+)\/(.+)$/);
    if (!m) return json({ url: doc.file_url });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.storage.from(m[1]).createSignedUrl(m[2], 60 * 10);
    if (error || !data) return json({ error: "Could not open the document" }, 500);
    return json({ url: data.signedUrl });
  } catch (e) {
    console.error("portal-document-url", e);
    return json({ error: "Something went wrong" }, 500);
  }
});
