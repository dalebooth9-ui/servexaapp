// Public, unauthenticated read for a shared photo gallery link.
// Uses the service role so the client never needs storage access.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const IMAGE_RE = /\.(?:jpg|jpeg|png|webp|gif|heic|heif)$/i;

function parseRef(input: string | null | undefined): { bucket: string; path: string } | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (raw.startsWith("storage://")) {
    const rest = raw.slice("storage://".length);
    const i = rest.indexOf("/");
    if (i < 1) return null;
    return { bucket: rest.slice(0, i), path: rest.slice(i + 1) };
  }
  const m = raw.match(/\/object\/(?:public|sign)\/([^/]+)\/([^?#]+)/);
  if (m) {
    try {
      return { bucket: m[1], path: decodeURIComponent(m[2]) };
    } catch {
      return { bucket: m[1], path: m[2] };
    }
  }
  if (/^https?:\/\//i.test(raw)) return null;
  return { bucket: "submissions", path: raw.replace(/^\/+/, "") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token || !/^[a-f0-9]{8,64}$/i.test(token)) return json({ error: "Invalid link" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: gallery } = await supabase
      .from("shared_galleries")
      .select("*")
      .eq("share_token", token)
      .maybeSingle();

    if (!gallery || !gallery.is_active) return json({ error: "expired" }, 404);
    if (gallery.expires_at && new Date(gallery.expires_at) < new Date()) return json({ error: "expired" }, 410);

    const [{ data: job }, { data: org }] = await Promise.all([
      supabase.from("jobs").select("id, title, reference_number, org_id, site_id").eq("id", gallery.job_id).maybeSingle(),
      supabase.from("organisations").select("name, logo_url, primary_color").eq("id", gallery.org_id).maybeSingle(),
    ]);

    let siteName: string | null = null;
    if (job?.site_id) {
      const { data: site } = await supabase.from("sites").select("name").eq("id", job.site_id).maybeSingle();
      siteName = (site?.name as string) || null;
    }

    const selected: string[] = Array.isArray(gallery.selected_submission_ids)
      ? gallery.selected_submission_ids
      : [];

    type Raw = { id: string; ref: string | null; name: string; createdAt: string };
    const raws: Raw[] = [];

    const { data: subs } = await supabase
      .from("submissions")
      .select("id, type, file_url, file_name, created_at, display_order")
      .eq("job_id", gallery.job_id)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    for (const s of (subs || []) as any[]) {
      if (!s.file_url) continue;
      const name = (s.file_name as string) || String(s.file_url).split("/").pop() || "";
      if (!IMAGE_RE.test(name.split("?")[0])) continue;
      if (selected.length > 0 && !selected.includes(s.id)) continue;
      if (!gallery.include_annotations && /annot/i.test(name)) continue;
      raws.push({ id: `sub:${s.id}`, ref: s.file_url, name, createdAt: s.created_at });
    }

    if (gallery.include_checklist_photos && selected.length === 0) {
      const { data: checks } = await supabase
        .from("job_photo_checklist_responses")
        .select("id, photo_url, before_photo_url, after_photo_url, captured_at")
        .eq("job_id", gallery.job_id);
      for (const c of (checks || []) as any[]) {
        for (const [key, url] of [["photo", c.photo_url], ["before", c.before_photo_url], ["after", c.after_photo_url]] as const) {
          if (!url) continue;
          const name = String(url).split("?")[0].split("/").pop() || "";
          if (!IMAGE_RE.test(name)) continue;
          raws.push({ id: `chk:${c.id}:${key}`, ref: url, name, createdAt: c.captured_at });
        }
      }
    }

    const photos: { id: string; url: string; createdAt: string }[] = [];
    for (const r of raws) {
      const ref = parseRef(r.ref);
      if (!ref) {
        if (/^https?:\/\//i.test(String(r.ref))) photos.push({ id: r.id, url: String(r.ref), createdAt: r.createdAt });
        continue;
      }
      const candidates = [ref.path];
      if (job?.org_id && !ref.path.startsWith(`${job.org_id}/`)) candidates.push(`${job.org_id}/${ref.path}`);
      for (const p of candidates) {
        const { data } = await supabase.storage.from(ref.bucket).createSignedUrl(p, 3600);
        if (data?.signedUrl) {
          photos.push({ id: r.id, url: data.signedUrl, createdAt: r.createdAt });
          break;
        }
      }
    }

    let logoUrl: string | null = null;
    if (org?.logo_url) {
      const ref = parseRef(org.logo_url);
      if (!ref) logoUrl = /^https?:\/\//i.test(org.logo_url) ? org.logo_url : null;
      else {
        const { data } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 3600);
        logoUrl = data?.signedUrl || null;
      }
    }

    await supabase
      .from("shared_galleries")
      .update({ view_count: (gallery.view_count || 0) + 1 })
      .eq("id", gallery.id);

    return json({
      gallery: {
        title: gallery.title || job?.title || "Photo gallery",
        description: gallery.description || null,
        createdAt: gallery.created_at,
      },
      org: { name: org?.name || "", logoUrl, primaryColor: org?.primary_color || null },
      site: siteName,
      photos,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
