import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  FolderOpen, Plus, Trash2, Camera, X, ChevronDown, ChevronUp,
  Download, Share2, CheckCircle2, Circle, Pencil, Loader2, Image as ImageIcon,
  Building2, User, FileText
} from "lucide-react";
import jsPDF from "jspdf";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Photo { id: string; photo_url: string; file_name: string | null; signed_url?: string; }
interface Issue {
  id: string; project_id: string; title: string; description: string | null;
  status: string; sort_order: number; photos: Photo[];
}
interface Project {
  id: string; job_id: string; title: string; reference: string;
  client_name: string; company_name: string; company_address: string | null;
  company_phone: string | null; company_email: string | null;
  created_by: string; created_at: string; issues: Issue[];
}

interface Props { jobId: string; job?: any; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSignedUrl(path: string): Promise<string> {
  const { data } = await supabase.storage
    .from("installation-photos")
    .createSignedUrl(path, 3600);
  return data?.signedUrl || path;
}

// ─── Issue Card ───────────────────────────────────────────────────────────────

function IssueCard({
  issue, issueNumber, onUpdateTitle, onUpdateDescription, onToggleStatus,
  onDelete, onAddPhoto, onDeletePhoto, uploadingIssueId,
}: {
  issue: Issue; issueNumber: number;
  onUpdateTitle: (id: string, val: string) => void;
  onUpdateDescription: (id: string, val: string) => void;
  onToggleStatus: (id: string, current: string) => void;
  onDelete: (id: string) => void;
  onAddPhoto: (issueId: string, files: FileList) => void;
  onDeletePhoto: (issueId: string, photoId: string, photoUrl: string) => void;
  uploadingIssueId: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(issue.title);
  const [descVal, setDescVal] = useState(issue.description || "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const resolved = issue.status === "resolved";

  return (
    <div className={`rounded-lg border bg-card transition-all ${resolved ? "opacity-70" : ""}`}>
      {/* Issue Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => onToggleStatus(issue.id, issue.status)}
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
          title={resolved ? "Mark as open" : "Mark as resolved"}
        >
          {resolved
            ? <CheckCircle2 className="h-5 w-5 text-green-500" />
            : <Circle className="h-5 w-5" />
          }
        </button>

        <span className="shrink-0 text-xs font-semibold text-muted-foreground w-6">#{issueNumber}</span>

        {editingTitle ? (
          <Input
            autoFocus
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onBlur={() => { onUpdateTitle(issue.id, titleVal); setEditingTitle(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onUpdateTitle(issue.id, titleVal); setEditingTitle(false); } if (e.key === "Escape") { setTitleVal(issue.title); setEditingTitle(false); } }}
            className="h-7 text-sm flex-1"
          />
        ) : (
          <span
            className={`flex-1 text-sm font-medium cursor-pointer hover:text-primary transition-colors ${resolved ? "line-through text-muted-foreground" : ""}`}
            onClick={() => setEditingTitle(true)}
          >
            {issue.title || <span className="text-muted-foreground italic">Untitled issue</span>}
          </span>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {issue.photos.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
              <ImageIcon className="h-3.5 w-3.5" />{issue.photos.length}
            </span>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Issue</AlertDialogTitle>
                <AlertDialogDescription>Delete this issue and all its photos? This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(issue.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          <Textarea
            placeholder="Add a description…"
            value={descVal}
            onChange={(e) => setDescVal(e.target.value)}
            onBlur={() => { if (descVal !== (issue.description || "")) onUpdateDescription(issue.id, descVal); }}
            className="text-sm min-h-[60px] resize-none"
          />

          {/* Photos */}
          {issue.photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {issue.photos.map((photo) => (
                <div key={photo.id} className="relative group aspect-square rounded-md overflow-hidden border bg-muted cursor-pointer">
                  <img
                    src={photo.signed_url || photo.photo_url}
                    alt={photo.file_name || "Issue photo"}
                    className="w-full h-full object-cover"
                    onClick={() => setLightbox(photo.signed_url || photo.photo_url)}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeletePhoto(issue.id, photo.id, photo.photo_url); }}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) { onAddPhoto(issue.id, e.target.files); e.target.value = ""; } }} />

          <Button size="sm" variant="outline" className="gap-1.5 text-xs"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingIssueId === issue.id}
          >
            {uploadingIssueId === issue.id
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
              : <><Camera className="h-3.5 w-3.5" /> Add Photo</>
            }
          </Button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <Dialog open onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-3xl p-2">
            <img src={lightbox} alt="Issue photo" className="w-full rounded object-contain max-h-[80vh]" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Create Project Dialog ────────────────────────────────────────────────────

function CreateProjectDialog({
  open, onClose, onCreated, jobId, userId, job,
}: {
  open: boolean; onClose: () => void; onCreated: (p: Project) => void;
  jobId: string; userId: string; job?: any;
}) {
  const siteName = job?.sites?.name || "";
  const siteAddress = job?.address || job?.sites?.address || "";
  const clientName = job?.customer || job?.customers?.name || siteName || "";
  const jobRef = job?.reference_number || "";

  const [form, setForm] = useState({
    title: siteName ? `${siteName} Installation` : "",
    reference: jobRef,
    client_name: clientName,
    company_name: "Viva Fire & Protection Ltd",
    company_address: siteAddress,
    company_phone: "",
    company_email: "",
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!form.title.trim()) { toast({ title: "Project title is required", variant: "destructive" }); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("installation_projects" as any)
      .insert({ job_id: jobId, created_by: userId, ...form })
      .select()
      .single();
    setSaving(false);
    if (error) { toast({ title: "Failed to create snag list", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Snag list created" });
    onCreated({ ...(data as any), issues: [] });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" /> New Notes / Snag List
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Project Title *</Label>
              <Input className="mt-1" placeholder="e.g. Dry Riser Installation – Block A"
                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Input className="mt-1" placeholder="e.g. PROJ-001"
                value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Client Name</Label>
              <Input className="mt-1" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </div>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Your Company Details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Company Name</Label>
                <Input className="mt-1" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Site Address</Label>
                <Input className="mt-1" value={form.company_address} onChange={(e) => setForm({ ...form, company_address: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input className="mt-1" value={form.company_phone} onChange={(e) => setForm({ ...form, company_phone: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input className="mt-1" value={form.company_email} onChange={(e) => setForm({ ...form, company_email: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creating…</> : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Detail View ──────────────────────────────────────────────────────

function ProjectDetail({ project, onBack, onRefresh }: { project: Project; onBack: () => void; onRefresh: () => void; }) {
  const { toast } = useToast();
  const [issues, setIssues] = useState<Issue[]>(project.issues);
  const [addingIssue, setAddingIssue] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [uploadingIssueId, setUploadingIssueId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: project.title, reference: project.reference,
    client_name: project.client_name, company_name: project.company_name,
    company_address: project.company_address || "", company_phone: project.company_phone || "",
    company_email: project.company_email || "",
  });

  const openCount = issues.filter((i) => i.status === "open").length;
  const resolvedCount = issues.filter((i) => i.status === "resolved").length;

  const addIssue = async () => {
    const title = newIssueTitle.trim();
    const { data, error } = await supabase
      .from("installation_issues" as any)
      .insert({ project_id: project.id, title, sort_order: issues.length })
      .select()
      .single();
    if (error) { toast({ title: "Failed to add issue", variant: "destructive" }); return; }
    setIssues((prev) => [...prev, { ...(data as any), photos: [] }]);
    setNewIssueTitle("");
    setAddingIssue(false);
  };

  const updateIssueTitle = useCallback(async (id: string, title: string) => {
    await supabase.from("installation_issues" as any).update({ title }).eq("id", id);
    setIssues((prev) => prev.map((i) => i.id === id ? { ...i, title } : i));
  }, []);

  const updateIssueDescription = useCallback(async (id: string, description: string) => {
    await supabase.from("installation_issues" as any).update({ description }).eq("id", id);
    setIssues((prev) => prev.map((i) => i.id === id ? { ...i, description } : i));
  }, []);

  const toggleIssueStatus = useCallback(async (id: string, current: string) => {
    const next = current === "resolved" ? "open" : "resolved";
    await supabase.from("installation_issues" as any).update({ status: next }).eq("id", id);
    setIssues((prev) => prev.map((i) => i.id === id ? { ...i, status: next } : i));
  }, []);

  const deleteIssue = useCallback(async (id: string) => {
    // Delete photos from storage first
    const issue = issues.find((i) => i.id === id);
    for (const photo of issue?.photos || []) {
      const path = photo.photo_url.split("installation-photos/")[1];
      if (path) await supabase.storage.from("installation-photos").remove([path]);
    }
    await supabase.from("installation_issues" as any).delete().eq("id", id);
    setIssues((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Issue deleted" });
  }, [issues, toast]);

  const addPhoto = useCallback(async (issueId: string, files: FileList) => {
    setUploadingIssueId(issueId);
    const newPhotos: Photo[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${issueId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("installation-photos").upload(path, file);
      if (upErr) { toast({ title: `Upload failed: ${file.name}`, variant: "destructive" }); continue; }
      const { data: photoRow, error: dbErr } = await supabase
        .from("installation_issue_photos" as any)
        .insert({ issue_id: issueId, photo_url: path, file_name: file.name })
        .select()
        .single();
      if (dbErr) { toast({ title: "Failed to save photo", variant: "destructive" }); continue; }
      const signedUrl = await getSignedUrl(path);
      newPhotos.push({ ...(photoRow as any), signed_url: signedUrl });
    }
    setIssues((prev) => prev.map((i) => i.id === issueId ? { ...i, photos: [...i.photos, ...newPhotos] } : i));
    setUploadingIssueId(null);
  }, [toast]);

  const deletePhoto = useCallback(async (issueId: string, photoId: string, photoUrl: string) => {
    const path = photoUrl.includes("installation-photos/") ? photoUrl.split("installation-photos/")[1] : photoUrl;
    await supabase.storage.from("installation-photos").remove([path]).catch(() => {});
    await supabase.from("installation_issue_photos" as any).delete().eq("id", photoId);
    setIssues((prev) => prev.map((i) => i.id === issueId ? { ...i, photos: i.photos.filter((p) => p.id !== photoId) } : i));
  }, []);

  const saveProjectEdit = async () => {
    await supabase.from("installation_projects" as any).update(editForm).eq("id", project.id);
    toast({ title: "Project updated" });
    setEditProjectOpen(false);
    onRefresh();
  };

  // ── PDF / Share ──────────────────────────────────────────────────────────
  const handleShare = async () => {
    setSharing(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210; const pageH = 297; const margin = 14; const contentW = pageW - margin * 2;
      let y = 0;

      const addPage = () => { doc.addPage(); y = margin; };
      const checkY = (needed: number) => { if (y + needed > pageH - margin) addPage(); };

      // ── Header ──
      doc.setFillColor(220, 38, 38);
      doc.rect(0, 0, pageW, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16); doc.setFont("helvetica", "bold");
      doc.text(editForm.company_name || project.company_name || "Installation Report", margin, 11);
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      doc.text("Installation Project Report", margin, 17);
      const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      doc.text(dateStr, pageW - margin, 17, { align: "right" });

      y = 36;

      // ── Project Info ──
      doc.setTextColor(17, 24, 39);
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(margin, y, contentW, 32, 2, 2, "F");
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(project.title, margin + 4, y + 8);
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
      const infoItems = [
        project.reference ? `Ref: ${project.reference}` : null,
        project.client_name ? `Client: ${project.client_name}` : null,
        (editForm.company_phone || project.company_phone) ? `Tel: ${editForm.company_phone || project.company_phone}` : null,
        (editForm.company_email || project.company_email) ? `Email: ${editForm.company_email || project.company_email}` : null,
      ].filter(Boolean) as string[];
      let ix = margin + 4; let iy = y + 16;
      for (const item of infoItems) {
        if (ix + doc.getTextWidth(item) + 10 > pageW - margin) { iy += 6; ix = margin + 4; }
        doc.text(item, ix, iy); ix += doc.getTextWidth(item) + 14;
      }

      y += 38;

      // ── Summary ──
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      doc.text(`Total issues: ${issues.length}   ·   Open: ${openCount}   ·   Resolved: ${resolvedCount}`, margin, y);
      y += 8;
      doc.setDrawColor(229, 231, 235); doc.line(margin, y, pageW - margin, y);
      y += 6;

      // ── Issues ──
      for (let idx = 0; idx < issues.length; idx++) {
        const issue = issues[idx];
        checkY(14);

        // Issue header row
        doc.setFillColor(issue.status === "resolved" ? 240 : 255, issue.status === "resolved" ? 253 : 255, issue.status === "resolved" ? 244 : 255);
        doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        doc.setTextColor(issue.status === "resolved" ? 22 : 17, issue.status === "resolved" ? 163 : 24, issue.status === "resolved" ? 74 : 39);
        doc.text(`#${idx + 1}  ${issue.title || "Untitled issue"}`, margin + 3, y + 6.5);
        const statusLabel = issue.status === "resolved" ? "✓ Resolved" : "Open";
        doc.setFontSize(7.5);
        doc.text(statusLabel, pageW - margin - 3, y + 6.5, { align: "right" });
        y += 13;

        if (issue.description) {
          checkY(10);
          doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(55, 65, 81);
          const descLines = doc.splitTextToSize(issue.description, contentW - 6);
          for (const line of descLines) { checkY(5); doc.text(line, margin + 3, y); y += 5; }
          y += 2;
        }

        // Photos
        if (issue.photos.length > 0) {
          checkY(10);
          doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(107, 114, 128);
          doc.text(`${issue.photos.length} photo${issue.photos.length > 1 ? "s" : ""} attached`, margin + 3, y); y += 4;

          const photoSize = 45; const photoCols = 4; const gap = 3;
          let px = margin + 3; let rowStarted = false;

          for (const photo of issue.photos) {
            if (!photo.signed_url) continue;
            try {
              const resp = await fetch(photo.signed_url);
              const blob = await resp.blob();
              const reader = new FileReader();
              const b64 = await new Promise<string>((res) => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(blob); });
              const imgType = b64.split(";")[0].split("/")[1].toUpperCase() as any;
              checkY(photoSize + gap);
              doc.addImage(b64, imgType, px, y, photoSize, photoSize);
              px += photoSize + gap;
              rowStarted = true;
              if (px + photoSize > pageW - margin) { y += photoSize + gap; px = margin + 3; rowStarted = false; }
            } catch { /* skip failed image */ }
          }
          if (rowStarted) y += photoSize + gap;
        }

        y += 4;
        doc.setDrawColor(243, 244, 246); doc.line(margin, y, pageW - margin, y); y += 4;
      }

      // ── Footer ──
      const pages = (doc as any).internal.pages.length - 1;
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
        doc.text(`${project.company_name || ""} · Generated ${dateStr} · Page ${p} of ${pages}`, pageW / 2, pageH - 6, { align: "center" });
      }

      const fileName = `${project.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-report.pdf`;

      // Try Web Share API first (mobile-friendly)
      const pdfBlob = doc.output("blob");
      if (navigator.share && navigator.canShare?.({ files: [new File([pdfBlob], fileName, { type: "application/pdf" })] })) {
        const file = new File([pdfBlob], fileName, { type: "application/pdf" });
        await navigator.share({ title: `Installation Report: ${project.title}`, files: [file] });
      } else {
        // Fallback: download
        doc.save(fileName);
      }
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div>
      {/* Project Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1 transition-colors">
            ← All projects
          </button>
          <h3 className="font-semibold text-base">{project.title}</h3>
          <div className="flex flex-wrap gap-2 mt-1">
            {project.reference && <Badge variant="outline" className="text-xs">{project.reference}</Badge>}
            {project.client_name && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />{project.client_name}
              </span>
            )}
            {project.company_name && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />{project.company_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setEditProjectOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
          <Button size="sm" onClick={handleShare} disabled={sharing}>
            {sharing
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Exporting…</>
              : <><Share2 className="h-3.5 w-3.5 mr-1.5" /> Share</>
            }
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
          <Circle className="h-3.5 w-3.5 text-amber-500" /> {openCount} open
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {resolvedCount} resolved
        </div>
      </div>

      {/* Issues List */}
      <div className="space-y-2">
        {issues.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
            No issues yet. Add your first issue below.
          </div>
        )}
        {issues.map((issue, idx) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            issueNumber={idx + 1}
            onUpdateTitle={updateIssueTitle}
            onUpdateDescription={updateIssueDescription}
            onToggleStatus={toggleIssueStatus}
            onDelete={deleteIssue}
            onAddPhoto={addPhoto}
            onDeletePhoto={deletePhoto}
            uploadingIssueId={uploadingIssueId}
          />
        ))}

        {/* Add Issue */}
        {addingIssue ? (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2">
            <Input
              autoFocus
              placeholder="Issue title…"
              value={newIssueTitle}
              onChange={(e) => setNewIssueTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newIssueTitle.trim()) addIssue(); if (e.key === "Escape") { setAddingIssue(false); setNewIssueTitle(""); } }}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={addIssue} disabled={!newIssueTitle.trim()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddingIssue(false); setNewIssueTitle(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full gap-2 text-sm border-dashed" onClick={() => setAddingIssue(true)}>
            <Plus className="h-4 w-4" /> Add Issue
          </Button>
        )}
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Project Title</Label>
                <Input className="mt-1" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div><Label className="text-xs">Reference</Label><Input className="mt-1" value={editForm.reference} onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })} /></div>
              <div><Label className="text-xs">Client Name</Label><Input className="mt-1" value={editForm.client_name} onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label className="text-xs">Company Name</Label><Input className="mt-1" value={editForm.company_name} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label className="text-xs">Company Address</Label><Input className="mt-1" value={editForm.company_address} onChange={(e) => setEditForm({ ...editForm, company_address: e.target.value })} /></div>
              <div><Label className="text-xs">Phone</Label><Input className="mt-1" value={editForm.company_phone} onChange={(e) => setEditForm({ ...editForm, company_phone: e.target.value })} /></div>
              <div><Label className="text-xs">Email</Label><Input className="mt-1" value={editForm.company_email} onChange={(e) => setEditForm({ ...editForm, company_email: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProjectOpen(false)}>Cancel</Button>
            <Button onClick={saveProjectEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InstallationProjects({ jobId, job }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data: projectRows } = await supabase
      .from("installation_projects" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at");

    if (!projectRows) { setLoading(false); return; }

    const enriched: Project[] = await Promise.all(
      (projectRows as any[]).map(async (proj) => {
        const { data: issueRows } = await supabase
          .from("installation_issues" as any)
          .select("*")
          .eq("project_id", proj.id)
          .order("sort_order");

        const issues: Issue[] = await Promise.all(
          ((issueRows as any[]) || []).map(async (issue) => {
            const { data: photoRows } = await supabase
              .from("installation_issue_photos" as any)
              .select("*")
              .eq("issue_id", issue.id)
              .order("created_at");

            const photos: Photo[] = await Promise.all(
              ((photoRows as any[]) || []).map(async (p) => ({
                ...p,
                signed_url: await getSignedUrl(p.photo_url),
              }))
            );
            return { ...issue, photos };
          })
        );
        return { ...proj, issues };
      })
    );

    setProjects(enriched);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleDeleteProject = async (projectId: string) => {
    // Clean up all photos in storage
    const proj = projects.find((p) => p.id === projectId);
    for (const issue of proj?.issues || []) {
      for (const photo of issue.photos) {
        const path = photo.photo_url.includes("installation-photos/")
          ? photo.photo_url.split("installation-photos/")[1]
          : photo.photo_url;
        await supabase.storage.from("installation-photos").remove([path]).catch(() => {});
      }
    }
    await supabase.from("installation_projects" as any).delete().eq("id", projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (selectedProjectId === projectId) setSelectedProjectId(null);
    toast({ title: "Project deleted" });
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading projects…
      </div>
    );
  }

  return (
    <div>
      {selectedProject ? (
        <ProjectDetail
          project={selectedProject}
          onBack={() => setSelectedProjectId(null)}
          onRefresh={fetchProjects}
        />
      ) : (
        <>
          {/* Project List */}
          {projects.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                <FolderOpen className="h-6 w-6 text-primary" />
              </div>
              <p className="font-medium">No installation projects yet</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Create a project to track installation issues, add photos and generate a sharable report.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Create Project
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> New Note / Snag
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {projects.map((proj) => {
                  const open = proj.issues.filter((i) => i.status === "open").length;
                  const resolved = proj.issues.filter((i) => i.status === "resolved").length;
                  return (
                    <div
                      key={proj.id}
                      className="group rounded-lg border bg-card hover:border-primary/40 transition-colors cursor-pointer p-4"
                      onClick={() => setSelectedProjectId(proj.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                            <p className="font-semibold text-sm truncate">{proj.title}</p>
                          </div>
                          {proj.reference && <p className="text-xs text-muted-foreground">Ref: {proj.reference}</p>}
                          {proj.client_name && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <User className="h-3 w-3" />{proj.client_name}
                            </p>
                          )}
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon" variant="ghost"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Project</AlertDialogTitle>
                              <AlertDialogDescription>Delete "{proj.title}" and all its issues and photos?</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteProject(proj.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <div className="flex gap-3 mt-3 pt-3 border-t">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Circle className="h-3 w-3 text-amber-500" /> {open} open
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-green-500" /> {resolved} resolved
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                          <FileText className="h-3 w-3" /> {proj.issues.length} issue{proj.issues.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(p) => { setProjects((prev) => [...prev, p]); setSelectedProjectId(p.id); }}
        jobId={jobId}
        userId={user?.id || ""}
        job={job}
      />
    </div>
  );
}
