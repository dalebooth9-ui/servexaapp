import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import PhotoLightbox from "@/components/PhotoLightbox";
import {
  AlertTriangle, CheckCircle2, Loader2, Search, Camera, ArrowRight, FileText,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Defect = {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  category: string | null;
  photos: string[] | null;
  location_on_site: string | null;
  bs_standard_reference: string | null;
  asset_id: string | null;
  site_id: string | null;
  job_id: string | null;
  reported_by: string;
  created_at: string;
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

export default function DefectsReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [siteLookup, setSiteLookup] = useState<Record<string, string>>({});
  const [assetLookup, setAssetLookup] = useState<Record<string, string>>({});

  const [resolving, setResolving] = useState<Defect | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draftingQuote, setDraftingQuote] = useState(false);

  const [lightboxPhotos, setLightboxPhotos] = useState<{ id: string; url: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("defects")
      .select("*")
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data || []) as Defect[];
    setDefects(list);

    // Lookups
    const userIds = Array.from(new Set(list.map((d) => d.reported_by).filter(Boolean)));
    const siteIds = Array.from(new Set(list.map((d) => d.site_id).filter(Boolean) as string[]));
    const assetIds = Array.from(new Set(list.map((d) => d.asset_id).filter(Boolean) as string[]));

    const [profsRes, sitesRes, assetsRes] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      siteIds.length
        ? supabase.from("sites").select("id, name").in("id", siteIds)
        : Promise.resolve({ data: [] as any[] }),
      assetIds.length
        ? supabase.from("assets").select("id, name").in("id", assetIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    setProfiles(Object.fromEntries((profsRes.data || []).map((p: any) => [p.user_id, p.full_name])));
    setSiteLookup(Object.fromEntries((sitesRes.data || []).map((s: any) => [s.id, s.name])));
    setAssetLookup(Object.fromEntries((assetsRes.data || []).map((a: any) => [a.id, a.name])));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("defects-review")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "defects" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openLightbox = (photos: string[], idx: number) => {
    setLightboxPhotos(photos.map((url, i) => ({ id: `${i}`, url })));
    setLightboxIndex(idx);
    setLightboxOpen(true);
  };

  const handleResolve = async () => {
    if (!resolving || !user) return;
    setBusy(true);
    const { error } = await supabase
      .from("defects")
      .update({
        status: "resolved",
        resolution_notes: resolutionNotes.trim() || null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      } as any)
      .eq("id", resolving.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Defect marked as resolved");
    setResolving(null);
    setResolutionNotes("");
  };

  const filtered = defects
    .filter((d) => {
      if (severityFilter !== "all" && d.severity !== severityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          d.title.toLowerCase().includes(q) ||
          (d.description || "").toLowerCase().includes(q) ||
          (d.location_on_site || "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));

  // Group by site so quotes drafted from selection all target one site.
  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; siteId: string | null; siteName: string; items: Defect[] }>();
    for (const d of filtered) {
      const key = d.site_id ?? "__nosite__";
      if (!map.has(key)) {
        map.set(key, {
          key,
          siteId: d.site_id,
          siteName: d.site_id ? (siteLookup[d.site_id] || "Unknown site") : "No site linked",
          items: [],
        });
      }
      map.get(key)!.items.push(d);
    }
    return Array.from(map.values());
  }, [filtered, siteLookup]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInGroup = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = ids.every((id) => next.has(id));
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  // Selection must belong to a single site for the RPC.
  const selectedIds = Array.from(selected);
  const selectedDefects = defects.filter((d) => selected.has(d.id));
  const selectedSiteIds = new Set(selectedDefects.map((d) => d.site_id));
  const selectionValid = selectedIds.length > 0 && selectedSiteIds.size === 1;

  const draftQuoteFromSelection = async () => {
    if (!selectionValid) {
      toast.error("Pick defects that all belong to the same site.");
      return;
    }
    setDraftingQuote(true);
    const { data, error } = await (supabase as any).rpc("draft_quote_from_defects", {
      _defect_ids: selectedIds,
    });
    setDraftingQuote(false);
    if (error) return toast.error(error.message);
    toast.success("Draft quote created");
    setSelected(new Set());
    navigate(`/invoices/${data}`);
  };

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" /> Defects Review
          </h1>
          <p className="text-sm text-muted-foreground">
            Submitted defects awaiting admin resolution.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/defects">All defects <ArrowRight className="h-4 w-4 ml-1" /></Link>
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, description, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
            No outstanding defects to review.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 pb-24">
          {grouped.map((g) => {
            const ids = g.items.map((i) => i.id);
            const allSelected = ids.every((id) => selected.has(id));
            return (
              <section key={g.key} className="space-y-2">
                <div className="flex items-center justify-between gap-2 border-b pb-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => selectAllInGroup(ids)}
                      aria-label={`Select all defects at ${g.siteName}`}
                    />
                    <h2 className="text-sm font-semibold">
                      {g.siteName}
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        {g.items.length} defect{g.items.length !== 1 ? "s" : ""}
                      </span>
                    </h2>
                  </div>
                </div>

                {g.items.map((d) => {
                  const photos = (d.photos as string[] | null) || [];
                  const isSel = selected.has(d.id);
                  return (
                    <Card key={d.id} className={isSel ? "ring-2 ring-primary/40" : ""}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <Checkbox
                              className="mt-1"
                              checked={isSel}
                              onCheckedChange={() => toggleSelect(d.id)}
                              aria-label="Select defect"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold">{d.title}</h3>
                                <Badge variant="outline" className={SEVERITY_BADGE[d.severity]}>
                                  {d.severity}
                                </Badge>
                                <Badge variant="outline" className="capitalize">
                                  {d.status.replace("_", " ")}
                                </Badge>
                                {d.category && (
                                  <Badge variant="outline" className="capitalize text-[10px]">
                                    {d.category.replace("_", " ")}
                                  </Badge>
                                )}
                              </div>
                              {d.description && (
                                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
                                  {d.description}
                                </p>
                              )}
                              <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                {d.asset_id && assetLookup[d.asset_id] && (
                                  <span>Asset: {assetLookup[d.asset_id]}</span>
                                )}
                                {d.location_on_site && <span>Location: {d.location_on_site}</span>}
                                {d.bs_standard_reference && <span>Ref: {d.bs_standard_reference}</span>}
                                <span>
                                  By {profiles[d.reported_by] || "Unknown"} ·{" "}
                                  {format(new Date(d.created_at), "d MMM yyyy")}
                                </span>
                                {d.job_id && (
                                  <Link to={`/jobs/${d.job_id}`} className="text-primary hover:underline">
                                    View job
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button
                            onClick={() => {
                              setResolving(d);
                              setResolutionNotes("");
                            }}
                            size="sm"
                            variant="outline"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Dismiss
                          </Button>
                        </div>

                        {photos.length > 0 ? (
                          <div className="flex gap-2 flex-wrap pl-7">
                            {photos.map((url, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => openLightbox(photos, i)}
                                className="h-20 w-20 rounded border overflow-hidden hover:ring-2 hover:ring-primary transition"
                              >
                                <img src={url} alt={`Defect photo ${i + 1}`} className="h-full w-full object-cover" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 pl-7">
                            <Camera className="h-3 w-3" /> No photos attached
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 shadow-lg rounded-full border bg-background px-4 py-2 flex items-center gap-3">
          <span className="text-sm">
            <strong>{selected.size}</strong> selected
            {!selectionValid && (
              <span className="ml-2 text-xs text-destructive">
                (choose defects at one site)
              </span>
            )}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
          <Button
            size="sm"
            disabled={!selectionValid || draftingQuote}
            onClick={draftQuoteFromSelection}
            className="gap-1"
          >
            {draftingQuote
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileText className="h-4 w-4" />}
            Draft quote
          </Button>
        </div>
      )}

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve defect</DialogTitle>
          </DialogHeader>
          {resolving && (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{resolving.title}</p>
            </div>
          )}
          <Textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            placeholder="Resolution notes (optional)..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
