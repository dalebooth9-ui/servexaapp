import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, FileText } from "lucide-react";
import { transcriptionNote, type TranscribedFrom } from "@/lib/handwrittenConversion";

/** Office view of the handwritten original at the top of a converted draft,
 *  so every answer can be checked against the paper. */
export default function TranscribedOriginal({ info, paths }: { info: TranscribedFrom & { read_fields?: string[]; unclear_fields?: string[] }; paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let live = true;
    Promise.all(
      (paths || []).map(async (p) => {
        const { data } = await supabase.storage.from("submissions").createSignedUrl(p, 3600);
        return data?.signedUrl || "";
      }),
    ).then((u) => live && setUrls(u.filter(Boolean)));
    return () => { live = false; };
  }, [paths.join("|")]);
  const read = info.read_fields?.length || 0;
  const unclear = info.unclear_fields?.length || 0;
  return (
    <div className="mb-3 rounded-md border bg-muted/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold"><FileText className="h-3.5 w-3.5" /> Handwritten original</p>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}><ZoomOut className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.5))}><ZoomIn className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {transcriptionNote(info)}. {read} answers read from the sheet (blue), {unclear} to check (amber). The original stays on the job and is not on the customer report.
      </p>
      <div className="max-h-[60vh] overflow-auto rounded border bg-background">
        {urls.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Loading original…</p>
        ) : (
          urls.map((u, i) => <img key={u} src={u} alt={`Handwritten original page ${i + 1}`} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="block" />)
        )}
      </div>
    </div>
  );
}
