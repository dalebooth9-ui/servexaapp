import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { PortalContext } from "./PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

interface DocRow {
  id: string; job_id: string; document_type: string | null; file_name: string | null;
  file_url: string | null; label: string | null; created_at: string;
}

export default function PortalDocuments() {
  const ctx = useOutletContext<PortalContext>();
  const [params] = useSearchParams();
  const jobFilter = params.get("job");
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let q = supabase
        .from("job_documents")
        .select("id, job_id, document_type, file_name, file_path, storage_bucket, created_at")
        .eq("shareable_with_customer", true)
        .order("created_at", { ascending: false });
      if (jobFilter) q = q.eq("job_id", jobFilter);
      const { data } = await q;
      setDocs((data || []) as DocRow[]);
      setLoading(false);
    })();
  }, [ctx.customerId, jobFilter]);

  async function open(d: DocRow) {
    if (!d.file_path || !d.storage_bucket) return;
    const { data } = await supabase.storage.from(d.storage_bucket).createSignedUrl(d.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <CardContent className="p-0">
        {docs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No shareable documents yet.</div>
        ) : (
          <ul className="divide-y">
            {docs.map(d => (
              <li key={d.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.file_name || d.document_type || "Document"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()} · {d.document_type}</div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => open(d)}><Download className="w-4 h-4 mr-2" />Open</Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
