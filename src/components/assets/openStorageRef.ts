import { supabase } from "@/integrations/supabase/client";

/** Open a report link: plain URLs open directly; "storage://bucket/path" refs get a short signed URL. */
export async function openStorageRef(ref: string) {
  if (/^https?:\/\//i.test(ref)) { window.open(ref, "_blank", "noopener"); return; }
  const m = ref.match(/^storage:\/\/([^/]+)\/(.+)$/);
  if (!m) return;
  const { data } = await supabase.storage.from(m[1]).createSignedUrl(m[2], 600);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
}
