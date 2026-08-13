import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { PortalContext } from "./PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";

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
        .select("id, job_id, document_type, file_name, file_url, label, created_at")
        .eq("shareable_with_customer", true)
        .order("created_at", { ascending: false });
      if (jobFilter) q = q.eq("job_id", jobFilter);
      const { data } = await q;
      setDocs((data || []) as DocRow[]);
      setLoading(false);
    })();
  }, [ctx.customerId, jobFilter]);

  function open(d: DocRow) {
    if (d.file_url) window.open(d.file_url, "_blank", "noopener");
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
              <li key={d.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words line-clamp-3 sm:line-clamp-2">{d.file_name || d.document_type || "Document"}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(d.created_at)} · {d.document_type}</div>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="w-full sm:w-auto shrink-0" onClick={() => open(d)}><Download className="w-4 h-4 mr-2" />Open</Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
