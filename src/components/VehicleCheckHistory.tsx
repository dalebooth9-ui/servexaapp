import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, CheckCircle2, Clock, XCircle, AlertTriangle, Loader2, Camera, ImageOff, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import PhotoLightbox from "@/components/PhotoLightbox";
import JSZip from "jszip";
import { toast } from "sonner";

const ITEM_LABELS: Record<string, string> = {
  tyres: "Tyres",
  lights: "Lights",
  oil: "Oil level",
  washer_fluid: "Washer fluid",
  mirrors: "Mirrors",
  wipers: "Wipers",
  horn: "Horn",
  brakes: "Brakes",
  fuel_charge: "Fuel / charge",
  cleanliness: "Cleanliness",
  ladder_secured: "Ladder secured",
  tools_secured: "Tools secured",
  fire_extinguisher: "Fire extinguisher",
  first_aid_kit: "First aid kit",
};
const ALL_KEYS = Object.keys(ITEM_LABELS);

type Row = {
  id: string;
  check_date: string;
  created_at: string;
  submitted_at: string | null;
  auto_accepted_at: string | null;
  status: string;
  has_defects: boolean;
  vehicle_reg: string | null;
  mileage: number | null;
  items: Record<string, "ok" | "defect"> | null;
  defect_notes: string | null;
  rejection_reason: string | null;
  defect_photo_urls: string[] | null;
};

const STATUS_META: Record<string, { label: string; cls: string; Icon: any }> = {
  accepted: { label: "Accepted", cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30", Icon: CheckCircle2 },
  pending: { label: "Pending review", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", Icon: Clock },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
};

type PhotoState = { url: string; error: boolean } | null;

export default function VehicleCheckHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  // signed URLs keyed by check id, parallel to defect_photo_urls order
  const [signed, setSigned] = useState<Record<string, PhotoState[]>>({});
  const [signing, setSigning] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  const [lightboxPhotos, setLightboxPhotos] = useState<{ id: string; url: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const openGallery = (urls: string[], idx: number) => {
    setLightboxPhotos(urls.map((u, i) => ({ id: `${i}`, url: u })));
    setLightboxIndex(idx);
    setLightboxOpen(true);
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("vehicle_checks")
        .select("id, check_date, created_at, submitted_at, auto_accepted_at, status, has_defects, vehicle_reg, mileage, items, defect_notes, rejection_reason, defect_photo_urls")
        .eq("engineer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      setRows(((data as any) || []) as Row[]);
    };
    load();
    const channel = supabase
      .channel("vehicle-check-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_checks", filter: `engineer_id=eq.${user.id}` },
        () => {
          // Invalidate signed URLs so they refresh on next expand
          setSigned({});
          load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const signPhotosFor = async (row: Row): Promise<PhotoState[]> => {
    if (signed[row.id]) return signed[row.id];
    if (signing[row.id]) return [];
    const paths = row.defect_photo_urls || [];
    if (paths.length === 0) return [];
    setSigning((s) => ({ ...s, [row.id]: true }));
    const results: PhotoState[] = await Promise.all(
      paths.map(async (p) => {
        if (!p) return { url: "", error: true };
        if (/^https?:\/\//i.test(p)) return { url: p, error: false };
        const { data, error } = await supabase.storage
          .from("vehicle-checks")
          .createSignedUrl(p, 3600);
        if (error || !data?.signedUrl) return { url: "", error: true };
        return { url: data.signedUrl, error: false };
      })
    );
    setSigned((s) => ({ ...s, [row.id]: results }));
    setSigning((s) => ({ ...s, [row.id]: false }));
    return results;
  };

  const downloadAllPhotos = async (row: Row) => {
    if (downloading[row.id]) return;
    setDownloading((s) => ({ ...s, [row.id]: true }));
    try {
      const states = signed[row.id] || (await signPhotosFor(row));
      const paths = row.defect_photo_urls || [];
      const current = states || [];
      const zip = new JSZip();
      let added = 0;
      await Promise.all(
        current.map(async (p, i) => {
          if (!p || p.error || !p.url) return;
          try {
            const res = await fetch(p.url);
            if (!res.ok) return;
            const blob = await res.blob();
            const orig = paths[i] || `photo-${i + 1}`;
            const name = orig.split("/").pop() || `photo-${i + 1}.jpg`;
            zip.file(`${String(i + 1).padStart(2, "0")}-${name}`, blob);
            added++;
          } catch {
            /* skip */
          }
        })
      );
      if (added === 0) {
        toast.error("No photos available to download");
        return;
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = format(parseISO(row.check_date), "yyyy-MM-dd");
      const reg = row.vehicle_reg ? `-${row.vehicle_reg.replace(/\s+/g, "")}` : "";
      a.download = `vehicle-check-${dateStr}${reg}-defect-photos.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${added} photo${added === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error("Failed to download photos");
    } finally {
      setDownloading((s) => ({ ...s, [row.id]: false }));
    }
  };

  if (rows === null) {
    return (
      <Card className="p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-4 text-center text-sm text-muted-foreground">
        No vehicle checks submitted yet.
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const meta = STATUS_META[r.status] || STATUS_META.pending;
        const items = r.items || {};
        const defects = ALL_KEYS.filter((k) => items[k] === "defect");
        const missing = ALL_KEYS.filter((k) => items[k] === undefined || items[k] === null);
        const photoPaths = r.defect_photo_urls || [];
        const photoStates = signed[r.id];
        const isSigning = signing[r.id];
        const validUrls = (photoStates || []).filter((p): p is { url: string; error: false } => !!p && !p.error).map((p) => p.url);

        return (
          <Collapsible
            key={r.id}
            onOpenChange={(open) => {
              if (open) signPhotosFor(r);
            }}
          >
            <Card className="overflow-hidden">
              <CollapsibleTrigger className="w-full flex items-center gap-3 p-3 text-left active:bg-muted/40 transition-colors">
                <div className={`rounded-lg p-2 ${meta.cls.split(" ")[0]}`}>
                  <meta.Icon className={`h-4 w-4 ${meta.cls.split(" ").slice(1).join(" ")}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">
                      {format(parseISO(r.check_date), "EEE d MMM yyyy")}
                    </p>
                    <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>
                      {meta.label}
                    </Badge>
                    {defects.length > 0 && (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30 gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {defects.length}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {format(new Date(r.created_at), "HH:mm")}
                    {r.vehicle_reg && ` · ${r.vehicle_reg}`}
                    {r.mileage != null && ` · ${r.mileage.toLocaleString()} mi`}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform data-[state=open]:rotate-180 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="px-3 pb-3 pt-1 space-y-3 border-t">
                  {r.status === "rejected" && r.rejection_reason && (
                    <div className="text-xs bg-destructive/5 border border-destructive/20 rounded p-2">
                      <p className="font-semibold text-destructive mb-0.5">Admin rejection reason</p>
                      <p>{r.rejection_reason}</p>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Item-by-item
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {ALL_KEYS.length - defects.length - missing.length} OK · {defects.length} defect · {missing.length} unanswered
                      </p>
                    </div>
                    <ul className="divide-y rounded-md border">
                      {ALL_KEYS.map((k) => {
                        const v = items[k];
                        const isDefect = v === "defect";
                        const isOk = v === "ok";
                        const StatusIcon = isOk ? CheckCircle2 : isDefect ? XCircle : AlertTriangle;
                        const statusLabel = isOk ? "OK" : isDefect ? "Defect" : "Not answered";
                        const statusCls = isOk
                          ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30"
                          : isDefect
                          ? "bg-destructive/15 text-destructive border-destructive/30"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
                        const iconCls = isOk
                          ? "text-green-500"
                          : isDefect
                          ? "text-destructive"
                          : "text-amber-500";
                        return (
                          <li key={k} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                            <span className="flex items-center gap-2">
                              <StatusIcon className={`h-3.5 w-3.5 ${iconCls}`} />
                              {ITEM_LABELS[k]}
                            </span>
                            <Badge variant="outline" className={`text-[10px] ${statusCls}`}>
                              {statusLabel}
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {defects.length > 0 && r.defect_notes && (
                    <div className="text-xs">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive mb-1">
                        Defect notes
                      </p>
                      <p className="text-muted-foreground whitespace-pre-line">{r.defect_notes}</p>
                    </div>
                  )}

                  {photoPaths.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <Camera className="h-3 w-3" />
                          Defect photos ({photoPaths.length})
                        </p>
                        <div className="flex items-center gap-2">
                          {photoStates && photoStates.some((p) => p?.error) && (
                            <button
                              type="button"
                              className="text-[10px] text-primary hover:underline"
                              onClick={() => {
                                setSigned((s) => {
                                  const next = { ...s };
                                  delete next[r.id];
                                  return next;
                                });
                                signPhotosFor(r);
                              }}
                            >
                              Retry
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!!downloading[r.id]}
                            onClick={() => downloadAllPhotos(r)}
                            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                          >
                            {downloading[r.id] ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            {downloading[r.id] ? "Preparing…" : "Download all"}
                          </button>
                        </div>
                      </div>
                      {isSigning || !photoStates ? (
                        <div className="flex gap-2">
                          {photoPaths.map((_, i) => (
                            <div key={i} className="h-16 w-16 rounded-md border bg-muted animate-pulse" />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {photoStates.map((p, i) =>
                            p && !p.error ? (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  // Map index in validUrls
                                  const validIdx = photoStates
                                    .slice(0, i + 1)
                                    .filter((x) => x && !x.error).length - 1;
                                  openGallery(validUrls, validIdx);
                                }}
                                className="h-16 w-16 rounded-md overflow-hidden border hover:ring-2 hover:ring-primary transition"
                              >
                                <img
                                  src={p.url}
                                  alt={`Defect photo ${i + 1}`}
                                  className="h-full w-full object-cover"
                                  onError={() => {
                                    setSigned((s) => {
                                      const arr = [...(s[r.id] || [])];
                                      arr[i] = { url: "", error: true };
                                      return { ...s, [r.id]: arr };
                                    });
                                  }}
                                />
                              </button>
                            ) : (
                              <div
                                key={i}
                                className="h-16 w-16 rounded-md border bg-muted/40 flex flex-col items-center justify-center text-muted-foreground"
                                title="Photo could not be loaded"
                              >
                                <ImageOff className="h-4 w-4" />
                                <span className="text-[8px] mt-0.5">Unavailable</span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      <PhotoLightbox
        photos={lightboxPhotos}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
