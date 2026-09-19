import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Eye, Loader2, Mail, Share2, Trash2 } from "lucide-react";
import { createSubmissionPhotoSignedUrl, fetchJobPhotoMeta } from "@/lib/jobPhotos";

type Gallery = {
  id: string;
  share_token: string;
  title: string | null;
  description: string | null;
  expires_at: string | null;
  is_active: boolean;
  view_count: number;
  created_at: string;
};

type Thumb = { submissionId: string; url: string; fileName: string };

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function galleryUrl(token: string) {
  return `${window.location.origin}/gallery/${token}`;
}

function formatDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB") : "Never";
}

export default function ShareGalleryDialog({
  jobId,
  jobTitle,
  siteName,
}: {
  jobId: string;
  jobTitle?: string | null;
  siteName?: string | null;
}) {
  const { toast } = useToast();
  const { user, orgId } = useAuth();

  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [open, setOpen] = useState(false);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [includeChecklist, setIncludeChecklist] = useState(true);
  const [expiry, setExpiry] = useState("30");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Gallery | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Gallery | null>(null);

  const defaultTitle = useMemo(
    () => [jobTitle, siteName].filter(Boolean).join(" — ") || "Job photos",
    [jobTitle, siteName],
  );

  const loadList = useCallback(async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from("shared_galleries")
      .select("id, share_token, title, description, expires_at, is_active, view_count, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setGalleries((data || []) as Gallery[]);
    setLoadingList(false);
  }, [jobId]);

  useEffect(() => { void loadList(); }, [loadList]);

  const openDialog = async () => {
    setCreated(null);
    setSelected(new Set());
    setTitle(defaultTitle);
    setDescription("");
    setIncludeAnnotations(true);
    setIncludeChecklist(true);
    setExpiry("30");
    setOpen(true);
    setLoadingThumbs(true);
    try {
      const meta = await fetchJobPhotoMeta(jobId);
      const subs = meta.filter((p) => p.id.startsWith("sub:") && !/\.(mp4|mov|webm|avi|mkv|m4v|mp3|m4a|wav|ogg|oga|aac|weba)$/i.test(p.fileName));
      const withUrls = await Promise.all(
        subs.slice(0, 60).map(async (p) => {
          const signed = await createSubmissionPhotoSignedUrl(p.storagePath, jobId, 3600);
          return signed
            ? { submissionId: p.id.slice(4), url: signed.signedUrl, fileName: p.fileName }
            : null;
        }),
      );
      setThumbs(withUrls.filter(Boolean) as Thumb[]);
    } finally {
      setLoadingThumbs(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const create = async () => {
    if (!orgId) return;
    setCreating(true);
    try {
      const expiresAt =
        expiry === "never"
          ? null
          : new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("shared_galleries")
        .insert({
          org_id: orgId,
          job_id: jobId,
          title: title.trim() || defaultTitle,
          description: description.trim() || null,
          selected_submission_ids: Array.from(selected),
          include_annotations: includeAnnotations,
          include_checklist_photos: includeChecklist,
          expires_at: expiresAt,
          created_by: user?.id ?? null,
        })
        .select("id, share_token, title, description, expires_at, is_active, view_count, created_at")
        .single();
      if (error) throw error;
      setCreated(data as Gallery);
      await loadList();
      toast({ title: "Share link created" });
    } catch (e: any) {
      toast({ title: "Could not create link", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(galleryUrl(token));
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const emailLink = (g: Gallery) => {
    const subject = encodeURIComponent(g.title || defaultTitle);
    const body = encodeURIComponent(`${g.description ? `${g.description}\n\n` : ""}View the photos here:\n${galleryUrl(g.share_token)}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const setActive = async (g: Gallery, next: boolean) => {
    const { error } = await supabase.from("shared_galleries").update({ is_active: next }).eq("id", g.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    toast({ title: next ? "Link reactivated" : "Link deactivated" });
    await loadList();
  };

  const remove = async (g: Gallery) => {
    const { error } = await supabase.from("shared_galleries").delete().eq("id", g.id);
    setPendingDelete(null);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    toast({ title: "Share link deleted" });
    await loadList();
  };

  const isExpired = (g: Gallery) => !!g.expires_at && new Date(g.expires_at) < new Date();

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Shared galleries</h3>
          <p className="text-xs text-muted-foreground">Public photo links for clients and building managers.</p>
        </div>
        <Button size="sm" onClick={openDialog}>
          <Share2 className="mr-1.5 h-4 w-4" /> Share photos
        </Button>
      </div>

      {loadingList ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : galleries.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No share links yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {galleries.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2 text-xs">
              <span className="font-medium">{g.title || defaultTitle}</span>
              <Badge variant={!g.is_active ? "outline" : isExpired(g) ? "destructive" : "secondary"}>
                {!g.is_active ? "Inactive" : isExpired(g) ? "Expired" : "Active"}
              </Badge>
              <span className="text-muted-foreground">Created {formatDate(g.created_at)}</span>
              <span className="text-muted-foreground">Expires {formatDate(g.expires_at)}</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Eye className="h-3 w-3" /> {g.view_count}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => copyLink(g.share_token)}>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="sr-only">Copy link</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => emailLink(g)}>
                  <Mail className="h-3.5 w-3.5" />
                  <span className="sr-only">Email link</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setActive(g, !g.is_active)}>
                  {g.is_active ? "Deactivate" : "Reactivate"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingDelete(g)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  <span className="sr-only">Delete link</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Share photos</DialogTitle>
            <DialogDescription>
              Create a public link showing selected job photos. No sign-in needed to view.
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <div className="space-y-4">
              <div>
                <Label>Share link</Label>
                <div className="mt-1 flex gap-2">
                  <Input readOnly value={galleryUrl(created.share_token)} />
                  <Button type="button" onClick={() => copyLink(created.share_token)}>
                    <Copy className="mr-1.5 h-4 w-4" /> Copy
                  </Button>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <QRCodeCanvas value={galleryUrl(created.share_token)} size={168} includeMargin />
                <p className="text-xs text-muted-foreground">Scan to open the gallery</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => copyLink(created.share_token)}>
                  <Copy className="mr-1.5 h-4 w-4" /> Copy link
                </Button>
                <Button variant="outline" onClick={() => emailLink(created)}>
                  <Mail className="mr-1.5 h-4 w-4" /> Email link
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="gallery-title">Title</Label>
                <Input id="gallery-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="gallery-desc">Description (optional)</Label>
                <Textarea
                  id="gallery-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notes for the client…"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Photos</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelected((prev) =>
                        prev.size === thumbs.length ? new Set() : new Set(thumbs.map((t) => t.submissionId)),
                      )
                    }
                  >
                    {selected.size === thumbs.length && thumbs.length > 0 ? "Clear all" : "Select all"}
                  </Button>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Leave everything unticked to share all job photos.
                </p>
                {loadingThumbs ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading photos…
                  </div>
                ) : thumbs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No photos on this job yet.</p>
                ) : (
                  <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
                    {thumbs.map((t) => {
                      const isOn = selected.has(t.submissionId);
                      return (
                        <button
                          key={t.submissionId}
                          type="button"
                          onClick={() => toggle(t.submissionId)}
                          className={`relative aspect-square overflow-hidden rounded-md border ${isOn ? "ring-2 ring-primary" : ""}`}
                        >
                          <img src={t.url} alt={t.fileName} loading="lazy" className="h-full w-full object-cover" />
                          <span className="absolute left-1 top-1 rounded bg-background/90 p-0.5">
                            <Checkbox checked={isOn} className="pointer-events-none h-3.5 w-3.5" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={includeAnnotations} onCheckedChange={(v) => setIncludeAnnotations(!!v)} />
                  Include annotated photos
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={includeChecklist} onCheckedChange={(v) => setIncludeChecklist(!!v)} />
                  Include checklist photos
                </label>
              </div>

              <div>
                <Label>Link expires</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={create} disabled={creating}>
                  {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Create link
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this share link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone holding the link will no longer be able to view the photos. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && remove(pendingDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
