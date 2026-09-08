import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/dateFormat";

interface ExportRow {
  id: string;
  status: string;
  progress: number;
  stage: string | null;
  file_size: number | null;
  counts: Record<string, number> | null;
  parts: { path: string; size: number; name: string }[] | null;
  error: string | null;
  expires_at: string | null;
  created_at: string;
}

const mb = (bytes?: number | null) =>
  bytes ? `${(bytes / 1048576).toFixed(1)} MB` : "";

/** Settings → Data export. Free, self-serve, complete export of the org's data. */
export default function DataExportSettings() {
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("data_exports")
      .select("id,status,progress,stage,file_size,counts,parts,error,expires_at,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setRows((data as ExportRow[]) || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = rows.some((r) => r.status === "queued" || r.status === "running");

  useEffect(() => {
    if (!active) {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = window.setInterval(load, 3000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [active, load]);

  const start = async () => {
    setStarting(true);
    const { data, error } = await supabase.functions.invoke("data-export", { body: { action: "start" } });
    setStarting(false);
    const message = (data as any)?.error || error?.message;
    if (message) {
      toast.error(String(message));
      await load();
      return;
    }
    toast.success("Export started — you can leave this page, it keeps running.");
    load();
  };

  const download = async (id: string, part = 0) => {
    setDownloading(`${id}:${part}`);
    const { data, error } = await supabase.functions.invoke("data-export", {
      body: { action: "download", id, part },
    });
    setDownloading(null);
    const url = (data as any)?.url;
    if (!url) {
      toast.error(String((data as any)?.error || error?.message || "Could not create the download link."));
      return;
    }
    window.open(url, "_blank", "noopener");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageOpen className="h-4 w-4 text-primary" />
          Data export
        </CardTitle>
        <CardDescription>
          Your data is yours. Download everything — every report and certificate PDF plus your
          archived documents, foldered by customer and site, along with spreadsheets of customers,
          sites, jobs, defects, quotes and renewals. Free, any time. Up to 3 exports a day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={start} disabled={starting || active} className="min-h-11">
          {starting || active ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {active ? "Export in progress…" : "Export everything"}
        </Button>

        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No exports yet.</p>
        )}

        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{formatDateTime(r.created_at)}</span>
                  {r.file_size ? <span className="text-muted-foreground"> · {mb(r.file_size)}</span> : null}
                </div>
                <Badge
                  variant={
                    r.status === "complete" ? "default" : r.status === "failed" ? "destructive" : "secondary"
                  }
                >
                  {r.status === "complete" ? "Ready" : r.status === "failed" ? "Failed" : "Working"}
                </Badge>
              </div>

              {(r.status === "queued" || r.status === "running") && (
                <div className="space-y-1">
                  <Progress value={r.progress} />
                  <p className="text-xs text-muted-foreground">{r.stage || "Starting…"}</p>
                </div>
              )}

              {r.status === "complete" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {(r.parts?.length ? r.parts : [{ name: "Download", size: r.file_size || 0, path: "" }]).map(
                      (p, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant="outline"
                          className="min-h-10"
                          onClick={() => download(r.id, i)}
                          disabled={downloading === `${r.id}:${i}`}
                        >
                          {downloading === `${r.id}:${i}` ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          {r.parts && r.parts.length > 1 ? `Part ${i + 1} (${mb(p.size)})` : "Download"}
                        </Button>
                      ),
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.counts?.files ? `${r.counts.files} documents · ` : ""}
                    {r.parts && r.parts.length > 1 ? `${r.parts.length} zip parts · ` : ""}
                    {r.expires_at ? `links valid until ${formatDateTime(r.expires_at)}` : ""}
                  </p>
                </div>
              )}

              {r.error && (
                <p className={`text-xs ${r.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                  {r.error}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
