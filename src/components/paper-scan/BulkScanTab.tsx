import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, ScanLine } from "lucide-react";
import PhotoGrouper, {
  type FormGroup,
  type PhotoItem,
} from "./PhotoGrouper";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

interface Props {
  onClose: () => void;
  mode?: "job" | "archive";
}

type Stage = "upload" | "uploading" | "processing";

export default function BulkScanTab({ onClose, mode = "job" }: Props) {

  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [groups, setGroups] = useState<FormGroup[]>([]);
  const [stage, setStage] = useState<Stage>("upload");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    total: number;
    processed: number;
  }>({ total: 0, processed: 0 });

  useEffect(() => {
    return () => {
      groups.forEach((g) => g.photos.forEach((p) => URL.revokeObjectURL(p.url)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [expanding, setExpanding] = useState(false);

  const addFiles = async (fs: FileList | null) => {
    if (!fs) return;
    const raw = Array.from(fs);
    const pdfs = raw.filter(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
    );
    const images = raw.filter((f) => f.type.startsWith("image/"));

    // A PDF straight off the scanner is almost always a stack of completed
    // sheets. Expand + auto-split via the same batch pipeline, one sheet per
    // group. This guarantees no page is silently discarded.
    if (pdfs.length > 0 && user) {
      setExpanding(true);
      try {
        const { expandDropToPageFiles } = await import("@/lib/pdfToImages");
        const pageFiles = await expandDropToPageFiles(pdfs);
        if (pageFiles.length === 0) throw new Error("No pages could be rendered from the PDF.");

        // Ask the splitter to segment pages into sheets.
        const payloads = await Promise.all(
          pageFiles.map(async (f) => {
            const buf = await f.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let bin = "";
            for (let i = 0; i < bytes.length; i += 0x8000) {
              bin += String.fromCharCode.apply(
                null,
                Array.from(bytes.subarray(i, i + 0x8000)) as any,
              );
            }
            return { image_base64: btoa(bin), mime_type: f.type || "image/jpeg" };
          }),
        );

        const { data: splitData, error: splitErr } = await supabase.functions.invoke(
          "split-paper-scan-pdf",
          { body: { pages: payloads } },
        );
        if (splitErr) throw new Error(splitErr.message);
        const sheets = Array.isArray(splitData?.sheets) ? splitData.sheets : [];
        if (sheets.length === 0) throw new Error("Couldn't detect any sheets.");

        const { data: profile } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const orgId = (profile as any)?.org_id;
        if (!orgId) throw new Error("Your account has no organisation.");

        const { createScanBatchFromSheets } = await import(
          "@/lib/createScanBatchFromSheets"
        );
        const batchId = await createScanBatchFromSheets({
          orgId,
          userId: user.id,
          pageFiles,
          sheets,
          sourceLabel: mode === "archive" ? "archive_bulk_pdf" : "manual_bulk_pdf",
          mode,
        });
        toast({
          title: `${sheets.length} sheets detected`,
          description: `Batch created with ${pageFiles.length} pages. Opening review queue…`,
        });
        onClose();
        navigate(`/paper-scan-queue?batch=${batchId}${mode === "archive" ? "&mode=archive" : ""}`);
        return;

      } catch (e: any) {
        toast({
          title: "PDF split failed",
          description: e?.message,
          variant: "destructive",
        });
      } finally {
        setExpanding(false);
      }
    }

    if (images.length > 0) {
      const newGroups: FormGroup[] = images.map((f) => ({
        photos: [{ file: f, url: URL.createObjectURL(f) }],
      }));
      setGroups((prev) => [...prev, ...newGroups]);
    }
  };

  // Subscribe to batch progress once created
  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("paper_scan_batches")
        .select("total_items, processed_items, status")
        .eq("id", batchId)
        .maybeSingle();
      if (cancelled || !data) return;
      setProgress({
        total: (data as any).total_items,
        processed: (data as any).processed_items,
      });
      if ((data as any).status === "complete") {
        setStage("upload");
      }
    };
    load();

    const channel = supabase
      .channel(`batch_${batchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "paper_scan_batches",
          filter: `id=eq.${batchId}`,
        },
        (payload) => {
          const row: any = payload.new;
          setProgress({
            total: row.total_items,
            processed: row.processed_items,
          });
          if (row.status === "complete") {
            toast({
              title: "Batch complete",
              description: "Open the review queue to file each form.",
            });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [batchId, toast]);

  const startBatch = async () => {
    if (!user || groups.length === 0) return;
    setStage("uploading");
    try {
      // Look up org id
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const orgId = (profile as any)?.org_id;
      if (!orgId) throw new Error("Your account has no organisation.");

      // Create batch row
      const { data: batch, error: batchErr } = await supabase
        .from("paper_scan_batches")
        .insert({
          org_id: orgId,
          created_by: user.id,
          status: "processing",
          total_items: groups.length,
          processed_items: 0,
          mode,
        } as any)
        .select("id")
        .single();
      if (batchErr) throw batchErr;
      const bId = (batch as any).id as string;


      // Upload each photo, group by group
      const itemRows: {
        batch_id: string;
        org_id: string;
        image_paths: string[];
      }[] = [];

      for (let gi = 0; gi < groups.length; gi++) {
        const grp = groups[gi];
        const paths: string[] = [];
        for (let pi = 0; pi < grp.photos.length; pi++) {
          const p = grp.photos[pi];
          const ext =
            p.file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
            "jpg";
          const path = `paper-batches/${bId}/form-${gi + 1}-page-${pi + 1}-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("submissions")
            .upload(await buildOrgPathAsync(path), p.file, {
              upsert: true,
              contentType: p.file.type || "image/jpeg",
            });
          if (upErr) throw upErr;
          paths.push(path);
        }
        itemRows.push({ batch_id: bId, org_id: orgId, image_paths: paths });
      }

      const { error: itemsErr } = await supabase
        .from("paper_scan_batch_items")
        .insert(itemRows as any);
      if (itemsErr) throw itemsErr;

      setBatchId(bId);
      setStage("processing");
      setProgress({ total: groups.length, processed: 0 });

      // Fire and forget the processor (do NOT await response — it re-invokes itself)
      supabase.functions
        .invoke("process-paper-scan-batch", { body: { batch_id: bId } })
        .catch((e) => console.error("processor kick-off failed", e));

      toast({
        title: "Batch started",
        description: `${groups.length} forms queued. You can leave this dialog — track progress in the review queue.`,
      });
    } catch (e: any) {
      toast({
        title: "Couldn't start batch",
        description: e?.message,
        variant: "destructive",
      });
      setStage("upload");
    }
  };

  const openQueue = () => {
    onClose();
    navigate("/paper-scan-queue");
  };

  return (
    <div className="space-y-4">
      {stage === "upload" && (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose or drop paper form scans"
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm">
              Drop paper forms here or tap to choose — photos, or a scanner PDF we'll auto-split
            </p>
            <p className="text-xs text-muted-foreground">
              Add photos to group manually — or drop a scanner PDF and we'll split each sheet automatically.
            </p>
            {expanding && (
              <p className="mt-2 text-xs text-primary flex items-center justify-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Rendering & splitting PDF…
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {groups.length > 0 && (
            <PhotoGrouper groups={groups} onChange={setGroups} />
          )}

          <div className="flex justify-between items-center pt-2 border-t">
            <Button variant="ghost" onClick={openQueue} type="button">
              View review queue
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={startBatch}
                disabled={groups.length === 0}
              >
                <ScanLine className="mr-2 h-4 w-4" /> Start batch (
                {groups.length})
              </Button>
            </div>
          </div>
        </>
      )}

      {stage === "uploading" && (
        <div className="py-12 text-center space-y-3">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Uploading photos…</p>
        </div>
      )}

      {stage === "processing" && (
        <div className="space-y-4 py-4">
          <div className="text-center space-y-2">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="text-sm">
              Processing {progress.processed} of {progress.total} forms…
            </p>
          </div>
          <Progress
            value={
              progress.total === 0
                ? 0
                : Math.round((progress.processed / progress.total) * 100)
            }
          />
          <p className="text-xs text-muted-foreground text-center">
            You can close this dialog and continue — processing runs in the
            background. Forms will appear in the review queue as they're ready.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={openQueue}>Open review queue</Button>
          </div>
        </div>
      )}
    </div>
  );
}
