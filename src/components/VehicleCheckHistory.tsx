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
import { ChevronDown, CheckCircle2, Clock, XCircle, AlertTriangle, Loader2, Camera } from "lucide-react";
import { format, parseISO } from "date-fns";
import PhotoLightbox from "@/components/PhotoLightbox";

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

export default function VehicleCheckHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
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
        .select("id, check_date, created_at, status, has_defects, vehicle_reg, mileage, items, defect_notes, rejection_reason, defect_photo_urls")
        .eq("engineer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      const list = ((data as any) || []) as Row[];
      // Resolve private storage paths to signed URLs (1h)
      await Promise.all(
        list.map(async (r) => {
          const paths = r.defect_photo_urls || [];
          if (paths.length === 0) return;
          const signed = await Promise.all(
            paths.map(async (p) => {
              if (/^https?:\/\//i.test(p)) return p;
              const { data: s } = await supabase.storage
                .from("vehicle-checks")
                .createSignedUrl(p, 3600);
              return s?.signedUrl || "";
            })
          );
          r.defect_photo_urls = signed.filter(Boolean);
        })
      );
      setRows(list);
    };
    load();
    const channel = supabase
      .channel("vehicle-check-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_checks", filter: `engineer_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
        return (
          <Collapsible key={r.id}>
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
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
