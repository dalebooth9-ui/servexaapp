import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileDown, ImageIcon } from "lucide-react";
import { fetchJobPhotoMeta, createSubmissionPhotoSignedUrl, type JobPhoto } from "@/lib/jobPhotos";
import {
  classifyJobPhoto,
  badgeForKind,
  defaultChecked,
  loadPrefs,
  savePrefs,
  defaultPrefs,
  resolvePhotoSelection,
  type ExportBundlePrefs,
} from "@/lib/exportBundleSelection";

export interface SheetOption {
  id: string;
  templateName: string;
  submittedAt: string | null;
  submittedBy: string | null;
}

export interface ExportBundleSelection {
  photoIds: Set<string>;
  sheetIds: Set<string>;
  includeFilledSheets: boolean;
  includePhotos: boolean;
  includeFieldReports: boolean;
  includeCerts: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  /** Label of the confirmation button — e.g. "Generate PDF", "Generate Word". */
  confirmLabel: string;
  /** True while the caller is generating so the button shows a spinner. */
  generating?: boolean;
  onConfirm: (selection: ExportBundleSelection) => void;
  /** Which extra include switches to render. Defaults to all. */
  showFieldReportsToggle?: boolean;
  showCertsToggle?: boolean;
}

type PhotoTile = {
  photo: JobPhoto;
  thumbUrl: string | null;
  kind: ReturnType<typeof classifyJobPhoto>;
};

const BADGE_CLASSES: Record<"amber" | "slate", string> = {
  amber: "bg-amber-100 text-amber-900 border-amber-300",
  slate: "bg-slate-100 text-slate-700 border-slate-300",
};

export default function ExportBundlePickerDialog({
  open,
  onOpenChange,
  jobId,
  confirmLabel,
  generating,
  onConfirm,
  showFieldReportsToggle = true,
  showCertsToggle = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState<ExportBundlePrefs>(() => loadPrefs(jobId) ?? defaultPrefs());
  const [tiles, setTiles] = useState<PhotoTile[]>([]);
  const [sheets, setSheets] = useState<SheetOption[]>([]);
  const [photoSelected, setPhotoSelected] = useState<Set<string>>(new Set());
  const [sheetSelected, setSheetSelected] = useState<Set<string>>(new Set());

  // Load photos + sheets + build initial selection whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [meta, sheetsRes, engRes] = await Promise.all([
          fetchJobPhotoMeta(jobId),
          supabase
            .from("job_sheet_responses")
            .select("id, template_id, submitted_at, submitted_by, created_at")
            .eq("job_id", jobId)
            .eq("status", "submitted")
            .order("submitted_at", { ascending: true, nullsFirst: false }),
          Promise.resolve(null),
        ]);
        const sheetRows = (sheetsRes.data || []) as any[];

        const tplIds = [...new Set(sheetRows.map((r) => r.template_id).filter(Boolean))];
        const nameById: Record<string, string> = {};
        if (tplIds.length) {
          const { data: tpls } = await supabase
            .from("job_sheet_templates")
            .select("id, name")
            .in("id", tplIds as string[]);
          (tpls || []).forEach((t: any) => { nameById[t.id] = t.name || "Job sheet"; });
        }

        const submitterIds = [...new Set(sheetRows.map((r) => r.submitted_by).filter(Boolean))];
        const submitterById: Record<string, string> = {};
        if (submitterIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", submitterIds as string[]);
          (profs || []).forEach((p: any) => { submitterById[p.user_id] = p.full_name || ""; });
        }

        const sheetOptions: SheetOption[] = sheetRows.map((r) => ({
          id: r.id,
          templateName: nameById[r.template_id] || "Job sheet",
          submittedAt: r.submitted_at || r.created_at || null,
          submittedBy: r.submitted_by ? (submitterById[r.submitted_by] || null) : null,
        }));

        // Load thumbnails sequentially — usually well under 30 photos.
        const built: PhotoTile[] = [];
        for (const p of meta) {
          const signed = await createSubmissionPhotoSignedUrl(
            p.bucket ? `storage://${p.bucket}/${p.storagePath}` : (p.fallbackUrl || p.storagePath),
            jobId,
            3600,
          );
          built.push({
            photo: p,
            thumbUrl: signed?.signedUrl || p.fallbackUrl || null,
            kind: classifyJobPhoto(p),
          });
        }

        if (cancelled) return;
        setTiles(built);
        setSheets(sheetOptions);

        // Resolve initial selections from prefs.
        const initialPhotos = resolvePhotoSelection(meta, prefs);
        setPhotoSelected(initialPhotos);
        // Sheets: if prefs has explicit ids that still exist, honour them; else all.
        const knownIds = new Set(sheetOptions.map((s) => s.id));
        const savedSheets = prefs.sheetIds.filter((id) => knownIds.has(id));
        const initialSheets = savedSheets.length > 0
          ? new Set(savedSheets)
          : new Set(sheetOptions.map((s) => s.id));
        setSheetSelected(initialSheets);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId]);

  const scannedCount = useMemo(() => tiles.filter((t) => t.kind === "scanned_sheet").length, [tiles]);

  const togglePhoto = (id: string, checked: boolean) => {
    setPhotoSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
    // The user has curated: switch to custom mode so we don't re-auto next open.
    setPrefs((p) => ({ ...p, photoMode: "custom" }));
  };

  const selectAllPhotos = () => {
    setPhotoSelected(new Set(tiles.map((t) => t.photo.id)));
    setPrefs((p) => ({ ...p, photoMode: "custom" }));
  };
  const selectNonePhotos = () => {
    setPhotoSelected(new Set());
    setPrefs((p) => ({ ...p, photoMode: "custom" }));
  };
  const resetPhotoDefaults = () => {
    setPhotoSelected(new Set(tiles.filter((t) => defaultChecked(t.kind)).map((t) => t.photo.id)));
    setPrefs((p) => ({ ...p, photoMode: "auto" }));
  };

  const toggleSheet = (id: string, checked: boolean) => {
    setSheetSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const next: ExportBundlePrefs = {
      ...prefs,
      photoIds: Array.from(photoSelected),
      sheetIds: Array.from(sheetSelected),
    };
    savePrefs(jobId, next);
    onConfirm({
      photoIds: photoSelected,
      sheetIds: sheetSelected,
      includeFilledSheets: prefs.includeFilledSheets,
      includePhotos: prefs.includePhotos,
      includeFieldReports: prefs.includeFieldReports,
      includeCerts: prefs.includeCerts,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export options</DialogTitle>
          <DialogDescription>
            Choose what to include. Photos ticked here are the ones your client will see.
            {scannedCount > 0 && (
              <> Scanned job-sheet page images are unticked by default so they never leave your team.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="pr-4 -mr-4 flex-1">
          <div className="space-y-6 pb-2">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading photos and sheets…
              </div>
            ) : (
              <>
                {/* ── Completed job sheet report(s) ─────────────────────────── */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Completed job sheet report(s)</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Embed the filled-in sheet(s) at the start of the export.
                      </p>
                    </div>
                    <Switch
                      checked={prefs.includeFilledSheets}
                      onCheckedChange={(v) => setPrefs((p) => ({ ...p, includeFilledSheets: v }))}
                    />
                  </div>
                  {prefs.includeFilledSheets && sheets.length > 1 && (
                    <div className="space-y-2 pl-2 border-l-2 border-muted">
                      {sheets.map((s) => (
                        <label key={s.id} className="flex items-start gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={sheetSelected.has(s.id)}
                            onCheckedChange={(v) => toggleSheet(s.id, v === true)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium">{s.templateName}</span>
                            <span className="text-xs text-muted-foreground block">
                              {s.submittedAt ? new Date(s.submittedAt).toLocaleString("en-GB") : "Unsubmitted"}
                              {s.submittedBy ? ` · ${s.submittedBy}` : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {prefs.includeFilledSheets && sheets.length === 0 && (
                    <p className="text-xs text-muted-foreground pl-2">
                      No submitted job sheets on this job yet.
                    </p>
                  )}
                </section>

                <Separator />

                {/* ── Photos picker ─────────────────────────────────────────── */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" /> Photos ({photoSelected.size} of {tiles.length})
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Only ticked photos appear in the exported report.
                      </p>
                    </div>
                    <Switch
                      checked={prefs.includePhotos}
                      onCheckedChange={(v) => setPrefs((p) => ({ ...p, includePhotos: v }))}
                    />
                  </div>

                  {prefs.includePhotos && tiles.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 text-xs">
                        <Button type="button" variant="outline" size="sm" onClick={selectAllPhotos}>Select all</Button>
                        <Button type="button" variant="outline" size="sm" onClick={selectNonePhotos}>Select none</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={resetPhotoDefaults}>Reset defaults</Button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {tiles.map((t) => {
                          const badge = badgeForKind(t.kind);
                          const selected = photoSelected.has(t.photo.id);
                          return (
                            <label
                              key={t.photo.id}
                              className={`relative block aspect-square rounded-md overflow-hidden border-2 cursor-pointer transition-colors ${
                                selected ? "border-primary" : "border-transparent hover:border-muted-foreground/40"
                              }`}
                              title={t.photo.fileName}
                            >
                              {t.thumbUrl ? (
                                <img
                                  src={t.thumbUrl}
                                  alt={t.photo.fileName}
                                  loading="lazy"
                                  className={`w-full h-full object-cover ${selected ? "" : "opacity-50"}`}
                                />
                              ) : (
                                <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                  no preview
                                </div>
                              )}
                              <div className="absolute top-1 left-1 bg-background/90 rounded p-0.5 shadow-sm">
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={(v) => togglePhoto(t.photo.id, v === true)}
                                />
                              </div>
                              {badge && (
                                <div
                                  className={`absolute bottom-1 left-1 right-1 text-[10px] leading-tight px-1.5 py-0.5 rounded border ${BADGE_CLASSES[badge.tone]} text-center font-medium`}
                                >
                                  {badge.label}
                                </div>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {prefs.includePhotos && tiles.length === 0 && (
                    <p className="text-xs text-muted-foreground">No photos have been added to this job.</p>
                  )}
                </section>

                <Separator />

                {/* ── Other includes ────────────────────────────────────────── */}
                <section className="space-y-3">
                  {showFieldReportsToggle && (
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Include Servexa reports</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Append field / summary reports.
                        </p>
                      </div>
                      <Switch
                        checked={prefs.includeFieldReports}
                        onCheckedChange={(v) => setPrefs((p) => ({ ...p, includeFieldReports: v }))}
                      />
                    </div>
                  )}
                  {showCertsToggle && (
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Include engineer certificates</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Attach the certificates table.
                        </p>
                      </div>
                      <Switch
                        checked={prefs.includeCerts}
                        onCheckedChange={(v) => setPrefs((p) => ({ ...p, includeCerts: v }))}
                      />
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading || generating}>
            {generating ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Generating…</>
            ) : (
              <><FileDown className="mr-1.5 h-4 w-4" /> {confirmLabel}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
