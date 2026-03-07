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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FolderOpen, Plus, Trash2, Camera, X, ChevronDown, ChevronUp,
  Download, Share2, CheckCircle2, Circle, Pencil, Loader2, Image as ImageIcon,
  Building2, User, FileText, Mic, MicOff, Tag, ArrowUpRight, Pen,
  LayoutList, AlertTriangle, CheckCheck, PackageOpen, History, Send, Clock, Link2
} from "lucide-react";
import jsPDF from "jspdf";
import PhotoAnnotator from "@/components/PhotoAnnotator";
import PreCompletionChecklist from "@/components/PreCompletionChecklist";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Photo {
  id: string; photo_url: string; file_name: string | null;
  signed_url?: string; is_resolution?: boolean;
}
interface Issue {
  id: string; project_id: string; title: string; description: string | null;
  status: string; sort_order: number; photos: Photo[];
  priority: string; area: string | null; assignee_id: string | null;
  resolution_photo_url: string | null; resolution_photo_file_name: string | null;
  resolution_signed_url?: string;
}
interface Project {
  id: string; job_id: string; title: string; reference: string;
  client_name: string; company_name: string; company_address: string | null;
  company_phone: string | null; company_email: string | null;
  created_by: string; created_at: string; issues: Issue[];
}

interface Props { jobId: string; job?: any; }

// ─── Priority config ──────────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  low:      { label: "Low",      color: "text-blue-600 bg-blue-50 border-blue-200" },
  medium:   { label: "Medium",   color: "text-amber-600 bg-amber-50 border-amber-200" },
  high:     { label: "High",     color: "text-orange-600 bg-orange-50 border-orange-200" },
  critical: { label: "Critical", color: "text-red-700 bg-red-50 border-red-200" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getSignedUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from("installation-photos").createSignedUrl(path, 3600);
  return data?.signedUrl || path;
}

// ─── Issue Card ───────────────────────────────────────────────────────────────
function IssueCard({
  issue, issueNumber, onUpdateTitle, onUpdateDescription, onToggleStatus,
  onDelete, onAddPhoto, onDeletePhoto, onUpdatePriority, onUpdateArea,
  onAddResolutionPhoto, onDeleteResolutionPhoto, uploadingIssueId, initiallyExpanded,
}: {
  issue: Issue; issueNumber: number; initiallyExpanded?: boolean;
  onUpdateTitle: (id: string, val: string) => void;
  onUpdateDescription: (id: string, val: string) => void;
  onToggleStatus: (id: string, current: string) => void;
  onDelete: (id: string) => void;
  onAddPhoto: (issueId: string, files: FileList, annotatedDataUrl?: string) => void;
  onDeletePhoto: (issueId: string, photoId: string, photoUrl: string) => void;
  onUpdatePriority: (id: string, priority: string) => void;
  onUpdateArea: (id: string, area: string) => void;
  onAddResolutionPhoto: (issueId: string, file: File) => void;
  onDeleteResolutionPhoto: (issueId: string) => void;
  uploadingIssueId: string | null;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded ?? false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(issue.title);
  const [descVal, setDescVal] = useState(issue.description || "");
  const [areaVal, setAreaVal] = useState(issue.area || "");
  const fileRef = useRef<HTMLInputElement>(null);
  const resolutionRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  const [annotatorImage, setAnnotatorImage] = useState<string | null>(null);
  const [pendingAnnotationFile, setPendingAnnotationFile] = useState<File | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (initiallyExpanded && expanded) {
      const t = setTimeout(() => descRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, []);

  const loadHistory = async () => {
    if (history.length > 0) { setShowHistory(h => !h); return; }
    setHistoryLoading(true);
    const { data } = await supabase
      .from("installation_issue_history" as any)
      .select("*")
      .eq("issue_id", issue.id)
      .order("changed_at", { ascending: false });
    setHistory((data as any[]) || []);
    setHistoryLoading(false);
    setShowHistory(true);
  };

  const resolved = issue.status === "resolved";
  const pc = PRIORITY_CONFIG[issue.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

  const openAnnotator = (file: File) => {
    setPendingAnnotationFile(file);
    setAnnotatorImage(URL.createObjectURL(file));
    setAnnotatorOpen(true);
  };

  const handleAnnotationSave = async (dataUrl: string) => {
    setAnnotatorOpen(false);
    // Convert dataUrl to File and upload
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], pendingAnnotationFile?.name || "annotated.jpg", { type: "image/jpeg" });
    const dt = new DataTransfer();
    dt.items.add(file);
    onAddPhoto(issue.id, dt.files, dataUrl);
    setPendingAnnotationFile(null);
    setAnnotatorImage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    if (files.length === 1) {
      openAnnotator(files[0]);
    } else {
      onAddPhoto(issue.id, files);
    }
    e.target.value = "";
  };

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
            autoFocus value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onBlur={() => { onUpdateTitle(issue.id, titleVal); setEditingTitle(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onUpdateTitle(issue.id, titleVal); setEditingTitle(false); }
              if (e.key === "Escape") { setTitleVal(issue.title); setEditingTitle(false); }
            }}
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

        {/* Priority badge */}
        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border font-medium ${pc.color}`}>
          {pc.label}
        </span>

        {issue.photos.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />{issue.photos.length}
          </span>
        )}

        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive">
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

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          {/* Priority + Area row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Priority</Label>
              <Select value={issue.priority} onValueChange={(v) => onUpdatePriority(issue.id, v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">🔵 Low</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="high">🟠 High</SelectItem>
                  <SelectItem value="critical">🔴 Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Area / Floor</Label>
              <Input
                className="h-8 text-xs" placeholder="e.g. Floor 3 / Stairwell B"
                value={areaVal}
                onChange={(e) => setAreaVal(e.target.value)}
                onBlur={() => { if (areaVal !== (issue.area || "")) onUpdateArea(issue.id, areaVal); }}
              />
            </div>
          </div>

          <Textarea
            ref={descRef}
            placeholder="Add a description…"
            value={descVal}
            onChange={(e) => setDescVal(e.target.value)}
            onBlur={() => { if (descVal !== (issue.description || "")) onUpdateDescription(issue.id, descVal); }}
            className="text-sm min-h-[60px] resize-none"
          />

          {/* Before photos */}
          {issue.photos.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Photos</p>
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
            </div>
          )}

          {/* Resolution / after photo */}
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <CheckCheck className="h-3.5 w-3.5 text-green-500" /> After / Resolution Photo
            </p>
            {issue.resolution_photo_url && issue.resolution_signed_url ? (
              <div className="flex items-start gap-2">
                <div className="relative group h-20 w-20 rounded-md overflow-hidden border bg-muted cursor-pointer shrink-0">
                  <img
                    src={issue.resolution_signed_url}
                    alt="Resolution photo"
                    className="w-full h-full object-cover"
                    onClick={() => setLightbox(issue.resolution_signed_url!)}
                  />
                  <button
                    onClick={() => onDeleteResolutionPhoto(issue.id)}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Resolution photo attached. Replace by uploading again.</p>
              </div>
            ) : (
              <>
                <input ref={resolutionRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) onAddResolutionPhoto(issue.id, e.target.files[0]); e.target.value = ""; }} />
                <Button size="sm" variant="outline" className="gap-1.5 text-xs border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => resolutionRef.current?.click()}
                >
                  <Camera className="h-3.5 w-3.5" /> Add "After" Photo
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingIssueId === issue.id}
            >
              {uploadingIssueId === issue.id
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                : <><Camera className="h-3.5 w-3.5" /> Add Photo</>
              }
            </Button>
            <span className="text-xs text-muted-foreground">(Single photo opens annotator)</span>
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs ml-auto text-muted-foreground" onClick={loadHistory} disabled={historyLoading}>
              {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
              History
            </Button>
          </div>

          {/* Revision history */}
          {showHistory && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <History className="h-3 w-3" /> Revision History
              </p>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {history.map((h: any) => (
                    <div key={h.id} className="flex items-start gap-2 text-xs">
                      <Clock className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium capitalize">{h.field}</span>
                        {h.old_value && <span className="text-muted-foreground"> from <s>{h.old_value}</s></span>}
                        {h.new_value && <span className="text-muted-foreground"> → <span className="text-foreground">{h.new_value}</span></span>}
                        <span className="text-muted-foreground ml-2">{new Date(h.changed_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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

      {/* Annotator */}
      {annotatorOpen && annotatorImage && (
        <PhotoAnnotator
          open={annotatorOpen}
          imageUrl={annotatorImage}
          onClose={() => { setAnnotatorOpen(false); setAnnotatorImage(null); setPendingAnnotationFile(null); }}
          onSave={handleAnnotationSave}
        />
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
  const sitePostcode = job?.sites?.postcode || "";
  const rawAddress = job?.address || job?.sites?.address || "";
  const siteAddress = rawAddress && sitePostcode && !rawAddress.includes(sitePostcode)
    ? `${rawAddress}, ${sitePostcode}` : rawAddress;
  const clientName = job?.customer || job?.customers?.name || siteName || "";
  const jobRef = job?.reference_number || "";

  const [form, setForm] = useState({
    title: siteName ? `${siteName} Installation` : "",
    reference: jobRef, client_name: clientName,
    company_name: "Viva Fire & Protection Ltd",
    company_address: siteAddress, company_phone: "", company_email: "",
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!form.title.trim()) { toast({ title: "Project title is required", variant: "destructive" }); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("installation_projects" as any)
      .insert({ job_id: jobId, created_by: userId, ...form })
      .select().single();
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
              <Label className="text-xs">Snag List Title *</Label>
              <Input className="mt-1" placeholder="e.g. Dry Riser Installation – Block A"
                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Input className="mt-1" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
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
            {saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creating…</> : "Create Snag List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Handover Pack PDF ────────────────────────────────────────────────────────
async function generateHandoverPDF(
  project: Project,
  issues: Issue[],
  checklist: { label: string; checked: boolean; category: string }[]
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210; const pageH = 297; const margin = 14; const contentW = pageW - margin * 2;
  let y = 0;

  const addPage = () => { doc.addPage(); y = margin; };
  const checkY = (needed: number) => { if (y + needed > pageH - margin - 10) addPage(); };

  // ── Cover page ──
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, pageW, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22); doc.setFont("helvetica", "bold");
  doc.text("INSTALLATION HANDOVER PACK", margin, 16);
  doc.setFontSize(11); doc.setFont("helvetica", "normal");
  doc.text(project.title, margin, 25);
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  doc.setFontSize(9);
  doc.text(dateStr, pageW - margin, 25, { align: "right" });

  y = 50;

  // Project info box
  doc.setTextColor(17, 24, 39);
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, y, contentW, 42, 2, 2, "F");
  const infoRows = [
    ["Reference", project.reference],
    ["Client", project.client_name],
    ["Site Address", project.company_address || ""],
    ["Company", project.company_name],
    ["Contact", [project.company_phone, project.company_email].filter(Boolean).join(" · ")],
  ].filter(([, v]) => v);
  doc.setFontSize(9); let iy = y + 8;
  for (const [k, v] of infoRows) {
    doc.setFont("helvetica", "bold"); doc.setTextColor(107, 114, 128);
    doc.text(k, margin + 4, iy);
    doc.setFont("helvetica", "normal"); doc.setTextColor(17, 24, 39);
    doc.text(String(v), margin + 38, iy);
    iy += 6;
  }
  y += 48;

  // Summary stats
  const open = issues.filter(i => i.status !== "resolved").length;
  const resolved = issues.filter(i => i.status === "resolved").length;
  const critical = issues.filter(i => i.priority === "critical").length;
  const clChecked = checklist.filter(c => c.checked).length;

  const statBoxes = [
    { label: "Total Snags", value: issues.length, color: [241, 245, 249] as [number,number,number] },
    { label: "Open", value: open, color: [255, 247, 237] as [number,number,number] },
    { label: "Resolved", value: resolved, color: [240, 253, 244] as [number,number,number] },
    { label: "Critical", value: critical, color: [254, 242, 242] as [number,number,number] },
    { label: "Checklist", value: `${clChecked}/${checklist.length}`, color: [245, 243, 255] as [number,number,number] },
  ];
  const bw = (contentW - 8) / statBoxes.length;
  statBoxes.forEach((box, i) => {
    const bx = margin + i * (bw + 2);
    doc.setFillColor(...box.color);
    doc.roundedRect(bx, y, bw, 18, 1, 1, "F");
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
    doc.text(String(box.value), bx + bw / 2, y + 10, { align: "center" });
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
    doc.text(box.label, bx + bw / 2, y + 15.5, { align: "center" });
  });
  y += 26;

  // ── Snag List section ──
  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
  doc.text("Snag List", margin, y); y += 8;
  doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 40, y); y += 6;

  // Group by area
  const byArea: Record<string, Issue[]> = {};
  for (const issue of issues) {
    const area = issue.area || "General";
    (byArea[area] = byArea[area] || []).push(issue);
  }

  let issueCounter = 1;
  for (const [area, areaIssues] of Object.entries(byArea)) {
    checkY(12);
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(margin, y, contentW, 8, 1, 1, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(55, 65, 81);
    doc.text(`📍 ${area}  (${areaIssues.length} issue${areaIssues.length !== 1 ? "s" : ""})`, margin + 3, y + 5.5);
    y += 12;

    for (const issue of areaIssues) {
      checkY(14);
      const priColor = issue.priority === "critical" ? [220, 38, 38] :
        issue.priority === "high" ? [234, 88, 12] :
        issue.priority === "medium" ? [217, 119, 6] : [37, 99, 235];

      // Issue row
      doc.setFillColor(issue.status === "resolved" ? 240 : 255, issue.status === "resolved" ? 253 : 255, issue.status === "resolved" ? 244 : 255);
      doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
      doc.setTextColor(issue.status === "resolved" ? 22 : 17, issue.status === "resolved" ? 163 : 24, issue.status === "resolved" ? 74 : 39);
      doc.text(`#${issueCounter}  ${issue.title || "Untitled issue"}`, margin + 3, y + 6.5);
      // Priority pill
      doc.setFontSize(6.5); doc.setFont("helvetica", "bold");
      doc.setTextColor(...(priColor as [number,number,number]));
      doc.text(issue.priority.toUpperCase(), pageW - margin - 24, y + 6.5);
      // Status
      doc.setTextColor(107, 114, 128);
      const statusLabel = issue.status === "resolved" ? "✓ Resolved" : "Open";
      doc.text(statusLabel, pageW - margin - 3, y + 6.5, { align: "right" });
      y += 13;

      if (issue.description) {
        checkY(10);
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(55, 65, 81);
        const lines = doc.splitTextToSize(issue.description, contentW - 6);
        for (const line of lines) { checkY(5); doc.text(line, margin + 3, y); y += 5; }
        y += 2;
      }

      // Photos
      if (issue.photos.length > 0 || issue.resolution_signed_url) {
        checkY(10);
        const photoSize = 42; const gap = 3;
        let px = margin + 3;

        const allPhotos = [
          ...issue.photos.filter(p => p.signed_url).map(p => ({ url: p.signed_url!, label: "Issue" })),
          ...(issue.resolution_signed_url ? [{ url: issue.resolution_signed_url, label: "After" }] : []),
        ];

        let rowStarted = false;
        for (const ph of allPhotos) {
          try {
            const resp = await fetch(ph.url);
            const blob = await resp.blob();
            const reader = new FileReader();
            const b64 = await new Promise<string>((res) => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(blob); });
            const imgType = b64.split(";")[0].split("/")[1].toUpperCase() as any;
            checkY(photoSize + gap + 6);
            doc.addImage(b64, imgType, px, y, photoSize, photoSize);
            // Label
            doc.setFontSize(6); doc.setFont("helvetica", "italic");
            doc.setTextColor(ph.label === "After" ? 22 : 107, ph.label === "After" ? 163 : 114, ph.label === "After" ? 74 : 128);
            doc.text(ph.label, px + photoSize / 2, y + photoSize + 4, { align: "center" });
            px += photoSize + gap;
            rowStarted = true;
            if (px + photoSize > pageW - margin) { y += photoSize + gap + 5; px = margin + 3; rowStarted = false; }
          } catch { /* skip */ }
        }
        if (rowStarted) y += photoSize + gap + 5;
      }

      y += 4;
      doc.setDrawColor(243, 244, 246); doc.line(margin, y, pageW - margin, y); y += 4;
      issueCounter++;
    }
    y += 4;
  }

  // ── Pre-completion Checklist section ──
  if (checklist.length > 0) {
    doc.addPage(); y = margin;
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
    doc.text("Pre-Completion Checklist", margin, y); y += 8;
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.8);
    doc.line(margin, y, margin + 70, y); y += 6;

    // Progress
    const pct = Math.round((clChecked / checklist.length) * 100);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
    doc.text(`${clChecked} of ${checklist.length} items complete (${pct}%)`, margin, y); y += 8;
    // Bar
    doc.setFillColor(229, 231, 235); doc.roundedRect(margin, y, contentW, 4, 2, 2, "F");
    if (pct > 0) {
      doc.setFillColor(pct === 100 ? 34 : 220, pct === 100 ? 197 : 38, pct === 100 ? 94 : 38);
      doc.roundedRect(margin, y, contentW * (pct / 100), 4, 2, 2, "F");
    }
    y += 10;

    // Group by category
    const clByCategory: Record<string, typeof checklist> = {};
    for (const item of checklist) {
      (clByCategory[item.category] = clByCategory[item.category] || []).push(item);
    }
    for (const [cat, catItems] of Object.entries(clByCategory)) {
      checkY(12);
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(margin, y, contentW, 7, 1, 1, "F");
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(55, 65, 81);
      doc.text(cat, margin + 3, y + 4.8);
      y += 10;
      for (const item of catItems) {
        checkY(7);
        doc.setFontSize(8.5); doc.setFont("helvetica", item.checked ? "normal" : "normal");
        doc.setTextColor(item.checked ? 22 : 55, item.checked ? 163 : 65, item.checked ? 74 : 81);
        const tick = item.checked ? "☑" : "☐";
        doc.text(`${tick}  ${item.label}`, margin + 3, y);
        y += 6;
      }
      y += 3;
    }
  }

  // ── Footer on all pages ──
  const pages = (doc as any).internal.pages.length - 1;
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
    doc.text(`${project.company_name} · Handover Pack · ${dateStr} · Page ${p} of ${pages}`, pageW / 2, pageH - 6, { align: "center" });
  }

  return doc;
}

// ─── Project Detail View ──────────────────────────────────────────────────────
function ProjectDetail({
  project, onBack, onRefresh, jobId,
}: {
  project: Project; onBack: () => void; onRefresh: () => void; jobId: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [issues, setIssues] = useState<Issue[]>(project.issues);
  const [addingIssue, setAddingIssue] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newIssuePriority, setNewIssuePriority] = useState("medium");
  const [newIssueArea, setNewIssueArea] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [uploadingIssueId, setUploadingIssueId] = useState<string | null>(null);
  const [newlyAddedIssueId, setNewlyAddedIssueId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<"pdf" | "handover" | null>(null);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"snags" | "checklist">("snags");
  const [editForm, setEditForm] = useState({
    title: project.title, reference: project.reference,
    client_name: project.client_name, company_name: project.company_name,
    company_address: project.company_address || "", company_phone: project.company_phone || "",
    company_email: project.company_email || "",
  });
  const [groupByArea, setGroupByArea] = useState(false);
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [signOffEmail, setSignOffEmail] = useState(project.company_email || "");
  const [signOffName, setSignOffName] = useState(project.client_name || "");
  const [signOffLoading, setSignOffLoading] = useState(false);
  const [signOffLink, setSignOffLink] = useState<string | null>(null);
  const [checklistPct, setChecklistPct] = useState<number | null>(null);
  const newPhotoRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load checklist % for the progress gauge
  useEffect(() => {
    supabase.from("pre_completion_checklist_items" as any)
      .select("checked")
      .eq("job_id", jobId)
      .then(({ data }) => {
        if (!data || !(data as any[]).length) { setChecklistPct(null); return; }
        const pct = Math.round(((data as any[]).filter((d: any) => d.checked).length / (data as any[]).length) * 100);
        setChecklistPct(pct);
      });
  }, [jobId]);

  const openCount = issues.filter((i) => i.status !== "resolved").length;
  const resolvedCount = issues.filter((i) => i.status === "resolved").length;
  const criticalCount = issues.filter((i) => i.priority === "critical" && i.status !== "resolved").length;

  const addIssue = async () => {
    const title = newIssueTitle.trim();
    const { data, error } = await supabase
      .from("installation_issues" as any)
      .insert({ project_id: project.id, title, sort_order: issues.length, priority: newIssuePriority, area: newIssueArea || null })
      .select().single();
    if (error) { toast({ title: "Failed to add issue", variant: "destructive" }); return; }
    const newIssue = { ...(data as any), photos: [] };
    setIssues((prev) => [...prev, newIssue]);
    setNewlyAddedIssueId(newIssue.id);
    setNewIssueTitle(""); setAddingIssue(false);
    const photos = pendingPhotos; setPendingPhotos([]);
    if (photos.length > 0) {
      const dt = new DataTransfer();
      photos.forEach((f) => dt.items.add(f));
      await addPhoto(newIssue.id, dt.files);
    }
  };

  const toggleVoice = useCallback(() => {
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "Voice not supported", description: "Use Chrome or Edge.", variant: "destructive" }); return; }
    const r = new SR(); r.continuous = false; r.interimResults = true; r.lang = "en-GB";
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onresult = (event: any) => setNewIssueTitle(Array.from(event.results).map((res: any) => res[0].transcript).join(""));
    r.onerror = (e: any) => { setIsListening(false); if (e.error !== "aborted") toast({ title: "Voice error", variant: "destructive" }); };
    recognitionRef.current = r; r.start(); setAddingIssue(true);
  }, [isListening, toast]);

  const updateIssueTitle = useCallback(async (id: string, title: string) => {
    const old = issues.find(i => i.id === id)?.title;
    await supabase.from("installation_issues" as any).update({ title }).eq("id", id);
    setIssues((prev) => prev.map((i) => i.id === id ? { ...i, title } : i));
    if (old !== title) {
      supabase.from("installation_issue_history" as any).insert({ issue_id: id, changed_by: user?.id, field: "title", old_value: old || null, new_value: title }).then(() => {});
    }
  }, [issues, user]);

  const updateIssueDescription = useCallback(async (id: string, description: string) => {
    await supabase.from("installation_issues" as any).update({ description }).eq("id", id);
    setIssues((prev) => prev.map((i) => i.id === id ? { ...i, description } : i));
  }, []);

  const toggleIssueStatus = useCallback(async (id: string, current: string) => {
    const next = current === "resolved" ? "open" : "resolved";
    await supabase.from("installation_issues" as any).update({ status: next }).eq("id", id);
    setIssues((prev) => prev.map((i) => i.id === id ? { ...i, status: next } : i));
    supabase.from("installation_issue_history" as any).insert({ issue_id: id, changed_by: user?.id, field: "status", old_value: current, new_value: next }).then(() => {});
  }, [user]);

  const updatePriority = useCallback(async (id: string, priority: string) => {
    const old = issues.find(i => i.id === id)?.priority;
    await supabase.from("installation_issues" as any).update({ priority }).eq("id", id);
    setIssues((prev) => prev.map((i) => i.id === id ? { ...i, priority } : i));
    if (old !== priority) {
      supabase.from("installation_issue_history" as any).insert({ issue_id: id, changed_by: user?.id, field: "priority", old_value: old || null, new_value: priority }).then(() => {});
    }
  }, [issues, user]);

  const updateArea = useCallback(async (id: string, area: string) => {
    await supabase.from("installation_issues" as any).update({ area: area || null }).eq("id", id);
    setIssues((prev) => prev.map((i) => i.id === id ? { ...i, area: area || null } : i));
  }, []);

  const deleteIssue = useCallback(async (id: string) => {
    const issue = issues.find((i) => i.id === id);
    for (const photo of issue?.photos || []) {
      const path = photo.photo_url.split("installation-photos/")[1];
      if (path) await supabase.storage.from("installation-photos").remove([path]);
    }
    if (issue?.resolution_photo_url) {
      await supabase.storage.from("installation-photos").remove([issue.resolution_photo_url]).catch(() => {});
    }
    await supabase.from("installation_issues" as any).delete().eq("id", id);
    setIssues((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Issue deleted" });
  }, [issues, toast]);

  const addPhoto = useCallback(async (issueId: string, files: FileList, annotatedDataUrl?: string) => {
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
        .select().single();
      if (dbErr) { toast({ title: "Failed to save photo", variant: "destructive" }); continue; }
      const signedUrl = annotatedDataUrl || await getSignedUrl(path);
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

  const addResolutionPhoto = useCallback(async (issueId: string, file: File) => {
    setUploadingIssueId(issueId);
    const ext = file.name.split(".").pop();
    const path = `${issueId}/resolution-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("installation-photos").upload(path, file);
    if (upErr) { toast({ title: "Upload failed", variant: "destructive" }); setUploadingIssueId(null); return; }
    await supabase.from("installation_issues" as any).update({ resolution_photo_url: path, resolution_photo_file_name: file.name }).eq("id", issueId);
    const signed = await getSignedUrl(path);
    setIssues((prev) => prev.map((i) => i.id === issueId ? { ...i, resolution_photo_url: path, resolution_photo_file_name: file.name, resolution_signed_url: signed } : i));
    setUploadingIssueId(null);
    toast({ title: "After photo saved" });
  }, [toast]);

  const deleteResolutionPhoto = useCallback(async (issueId: string) => {
    const issue = issues.find(i => i.id === issueId);
    if (issue?.resolution_photo_url) {
      await supabase.storage.from("installation-photos").remove([issue.resolution_photo_url]).catch(() => {});
    }
    await supabase.from("installation_issues" as any).update({ resolution_photo_url: null, resolution_photo_file_name: null }).eq("id", issueId);
    setIssues((prev) => prev.map((i) => i.id === issueId ? { ...i, resolution_photo_url: null, resolution_photo_file_name: null, resolution_signed_url: undefined } : i));
  }, [issues]);

  const saveProjectEdit = async () => {
    await supabase.from("installation_projects" as any).update(editForm).eq("id", project.id);
    toast({ title: "Snag list updated" });
    setEditProjectOpen(false); onRefresh();
  };

  const handleShareSnags = async () => {
    setSharing("pdf");
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210; const pageH = 297; const margin = 14; const contentW = pageW - margin * 2;
      let y = 0;
      const addPage = () => { doc.addPage(); y = margin; };
      const checkY = (needed: number) => { if (y + needed > pageH - margin) addPage(); };
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
      doc.setTextColor(17, 24, 39);
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(margin, y, contentW, 32, 2, 2, "F");
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(project.title, margin + 4, y + 8);
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(107, 114, 128);
      const infoItems = [
        project.reference ? `Ref: ${project.reference}` : null,
        project.client_name ? `Client: ${project.client_name}` : null,
      ].filter(Boolean) as string[];
      let ix = margin + 4; let iy2 = y + 16;
      for (const item of infoItems) { doc.text(item, ix, iy2); ix += doc.getTextWidth(item) + 14; }
      y += 38;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      doc.text(`Total: ${issues.length}   ·   Open: ${openCount}   ·   Resolved: ${resolvedCount}`, margin, y);
      y += 8;
      for (let idx = 0; idx < issues.length; idx++) {
        const issue = issues[idx];
        checkY(14);
        doc.setFillColor(issue.status === "resolved" ? 240 : 255, issue.status === "resolved" ? 253 : 255, issue.status === "resolved" ? 244 : 255);
        doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        doc.setTextColor(issue.status === "resolved" ? 22 : 17, issue.status === "resolved" ? 163 : 24, issue.status === "resolved" ? 74 : 39);
        doc.text(`#${idx + 1}  ${issue.title || "Untitled issue"}`, margin + 3, y + 6.5);
        doc.setFontSize(7.5);
        doc.text(issue.status === "resolved" ? "✓ Resolved" : "Open", pageW - margin - 3, y + 6.5, { align: "right" });
        y += 13;
        if (issue.description) {
          checkY(10);
          doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(55, 65, 81);
          const descLines = doc.splitTextToSize(issue.description, contentW - 6);
          for (const line of descLines) { checkY(5); doc.text(line, margin + 3, y); y += 5; }
          y += 2;
        }
        if (issue.photos.length > 0) {
          checkY(10);
          doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(107, 114, 128);
          doc.text(`${issue.photos.length} photo${issue.photos.length > 1 ? "s" : ""} attached`, margin + 3, y); y += 4;
          const photoSize = 45; let px = margin + 3; let rowStarted = false;
          for (const photo of issue.photos) {
            if (!photo.signed_url) continue;
            try {
              const resp = await fetch(photo.signed_url);
              const blob = await resp.blob();
              const reader = new FileReader();
              const b64 = await new Promise<string>((res) => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(blob); });
              checkY(photoSize + 3);
              doc.addImage(b64, b64.split(";")[0].split("/")[1].toUpperCase() as any, px, y, photoSize, photoSize);
              px += photoSize + 3; rowStarted = true;
              if (px + photoSize > pageW - margin) { y += photoSize + 3; px = margin + 3; rowStarted = false; }
            } catch { }
          }
          if (rowStarted) y += photoSize + 3;
        }
        y += 4;
        doc.setDrawColor(243, 244, 246); doc.line(margin, y, pageW - margin, y); y += 4;
      }
      const pages = (doc as any).internal.pages.length - 1;
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
        doc.text(`${project.company_name || ""} · Generated ${dateStr} · Page ${p} of ${pages}`, pageW / 2, pageH - 6, { align: "center" });
      }
      const fileName = `${project.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-snag-report.pdf`;
      const pdfBlob = doc.output("blob");
      if (navigator.share && navigator.canShare?.({ files: [new File([pdfBlob], fileName, { type: "application/pdf" })] })) {
        await navigator.share({ title: `Snag Report: ${project.title}`, files: [new File([pdfBlob], fileName, { type: "application/pdf" })] });
      } else { doc.save(fileName); }
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally { setSharing(null); }
  };

  const handleHandoverPack = async () => {
    setSharing("handover");
    try {
      // Fetch checklist items
      const { data: clData } = await supabase
        .from("pre_completion_checklist_items" as any)
        .select("label, checked, category")
        .eq("job_id", jobId)
        .order("sort_order");
      const checklist = (clData as any[]) || [];
      const doc = await generateHandoverPDF(project, issues, checklist);
      const fileName = `${project.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-handover-pack.pdf`;
      const blob = doc.output("blob");
      if (navigator.share && navigator.canShare?.({ files: [new File([blob], fileName, { type: "application/pdf" })] })) {
        await navigator.share({ title: `Handover Pack: ${project.title}`, files: [new File([blob], fileName, { type: "application/pdf" })] });
      } else { doc.save(fileName); }
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally { setSharing(null); }
  };

  const handleCreateSignOff = async () => {
    if (!signOffName.trim()) { toast({ title: "Client name required", variant: "destructive" }); return; }
    setSignOffLoading(true);
    const { data, error } = await supabase
      .from("installation_handover_tokens" as any)
      .insert({
        project_id: project.id,
        job_id: jobId,
        created_by: user?.id,
        client_name: signOffName.trim(),
        client_email: signOffEmail.trim() || null,
      })
      .select("token")
      .single();
    setSignOffLoading(false);
    if (error || !data) { toast({ title: "Failed to create sign-off link", variant: "destructive" }); return; }
    const link = `${window.location.origin}/handover/${(data as any).token}`;
    setSignOffLink(link);
    if (signOffEmail.trim()) {
      toast({ title: "Sign-off link created", description: `Share it with ${signOffEmail}` });
    }
  };

  // Determine unique areas for group-by
  const areas = Array.from(new Set(issues.map(i => i.area || "General").filter(Boolean)));

  const renderIssues = (issueList: Issue[]) => issueList.map((issue, idx) => (
    <IssueCard
      key={issue.id}
      issue={issue}
      issueNumber={issues.indexOf(issue) + 1}
      onUpdateTitle={updateIssueTitle}
      onUpdateDescription={updateIssueDescription}
      onToggleStatus={toggleIssueStatus}
      onDelete={deleteIssue}
      onAddPhoto={addPhoto}
      onDeletePhoto={deletePhoto}
      onUpdatePriority={updatePriority}
      onUpdateArea={updateArea}
      onAddResolutionPhoto={addResolutionPhoto}
      onDeleteResolutionPhoto={deleteResolutionPhoto}
      uploadingIssueId={uploadingIssueId}
      initiallyExpanded={issue.id === newlyAddedIssueId}
    />
  ));

  return (
    <div>
      {/* Project Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1 transition-colors">
            ← All snag lists
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
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button size="sm" variant="outline" onClick={() => setEditProjectOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
          <Button size="sm" variant="outline" onClick={handleShareSnags} disabled={sharing !== null}>
            {sharing === "pdf" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
            Snag Report
          </Button>
          <Button size="sm" onClick={handleHandoverPack} disabled={sharing !== null}>
            {sharing === "handover" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <PackageOpen className="h-3.5 w-3.5 mr-1.5" />}
            Handover Pack
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSignOffOpen(true)}>
            <Send className="h-3.5 w-3.5 mr-1.5" /> Send for Sign-Off
          </Button>
        </div>
      </div>

      {/* Progress Gauge */}
      {issues.length > 0 && (
        <div className="rounded-lg border bg-card p-3 mb-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{resolvedCount}</span>/{issues.length} snags resolved</span>
              {checklistPct !== null && (
                <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{checklistPct}%</span> checklist done</span>
              )}
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" /> {criticalCount} critical open
                </span>
              )}
            </div>
            {/* RAG status indicator */}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
              openCount === 0 ? "text-green-700 bg-green-50 border-green-200" :
              criticalCount > 0 ? "text-destructive bg-destructive/10 border-destructive/20" :
              "text-amber-700 bg-amber-50 border-amber-200"
            }`}>
              {openCount === 0 ? "✓ Complete" : criticalCount > 0 ? "! Critical" : "In Progress"}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                openCount === 0 ? "bg-green-500" : criticalCount > 0 ? "bg-destructive" : "bg-amber-500"
              }`}
              style={{ width: `${issues.length > 0 ? Math.round((resolvedCount / issues.length) * 100) : 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
          <Circle className="h-3.5 w-3.5 text-amber-500" /> {openCount} open
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {resolvedCount} resolved
        </div>
        {criticalCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {criticalCount} critical
          </div>
        )}
        <Button
          size="sm" variant={groupByArea ? "default" : "outline"}
          className="ml-auto h-7 text-xs gap-1.5"
          onClick={() => setGroupByArea(g => !g)}
        >
          <LayoutList className="h-3.5 w-3.5" /> {groupByArea ? "Flat list" : "Group by area"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-4">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "snags" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("snags")}
        >
          Snags ({issues.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "checklist" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("checklist")}
        >
          Pre-Completion Checklist
        </button>
      </div>

      {/* Snags tab */}
      {activeTab === "snags" && (
        <div className="space-y-2">
          {issues.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
              No issues yet. Add your first snag below.
            </div>
          )}

          {groupByArea && areas.length > 0 ? (
            areas.map(area => {
              const areaIssues = issues.filter(i => (i.area || "General") === area);
              return (
                <div key={area}>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{area}</span>
                    <span className="text-xs text-muted-foreground">({areaIssues.length})</span>
                  </div>
                  <div className="space-y-2 pl-1 border-l-2 border-muted ml-1.5">
                    {renderIssues(areaIssues)}
                  </div>
                </div>
              );
            })
          ) : (
            renderIssues(issues)
          )}

          {/* Add Snag form */}
          {addingIssue ? (
            <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  autoFocus placeholder="Snag title… or tap 🎤 to dictate"
                  value={newIssueTitle}
                  onChange={(e) => setNewIssueTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newIssueTitle.trim()) addIssue(); if (e.key === "Escape") { setAddingIssue(false); setNewIssueTitle(""); setPendingPhotos([]); recognitionRef.current?.stop(); } }}
                  className={`h-8 text-sm flex-1 ${isListening ? "border-destructive ring-1 ring-destructive" : ""}`}
                />
                <Button size="icon" variant={isListening ? "destructive" : "outline"} className="h-8 w-8 shrink-0" onClick={toggleVoice}>
                  {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </Button>
                <input ref={newPhotoRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { if (e.target.files) { setPendingPhotos(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ""; } }} />
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => newPhotoRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={addIssue} disabled={!newIssueTitle.trim()}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAddingIssue(false); setNewIssueTitle(""); setPendingPhotos([]); recognitionRef.current?.stop(); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={newIssuePriority} onValueChange={setNewIssuePriority}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🔵 Low</SelectItem>
                    <SelectItem value="medium">🟡 Medium</SelectItem>
                    <SelectItem value="high">🟠 High</SelectItem>
                    <SelectItem value="critical">🔴 Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="h-7 text-xs" placeholder="Area / Floor (optional)"
                  value={newIssueArea} onChange={(e) => setNewIssueArea(e.target.value)} />
              </div>
              {isListening && (
                <p className="text-xs text-destructive flex items-center gap-1.5 animate-pulse">
                  <span className="inline-block h-2 w-2 rounded-full bg-destructive" /> Listening…
                </p>
              )}
              {pendingPhotos.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center">
                  {pendingPhotos.map((file, i) => (
                    <div key={i} className="relative group">
                      <img src={URL.createObjectURL(file)} alt="" className="h-12 w-12 object-cover rounded border" />
                      <button onClick={() => setPendingPhotos(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                  <span className="text-xs text-muted-foreground">{pendingPhotos.length} photo{pendingPhotos.length > 1 ? "s" : ""} ready</span>
                </div>
              )}
            </div>
          ) : (
            <Button variant="outline" className="w-full gap-2 text-sm border-dashed" onClick={() => setAddingIssue(true)}>
              <Plus className="h-4 w-4" /> Add Snag
            </Button>
          )}
        </div>
      )}

      {/* Checklist tab */}
      {activeTab === "checklist" && (
        <PreCompletionChecklist jobId={jobId} />
      )}

      {/* Edit Project Dialog */}
      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Notes / Snag List</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Snag List Title</Label>
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
      .from("installation_projects" as any).select("*").eq("job_id", jobId).order("created_at");
    if (!projectRows) { setLoading(false); return; }

    const enriched: Project[] = await Promise.all(
      (projectRows as any[]).map(async (proj) => {
        const { data: issueRows } = await supabase
          .from("installation_issues" as any).select("*").eq("project_id", proj.id).order("sort_order");

        const issues: Issue[] = await Promise.all(
          ((issueRows as any[]) || []).map(async (issue) => {
            const { data: photoRows } = await supabase
              .from("installation_issue_photos" as any).select("*").eq("issue_id", issue.id).order("created_at");
            const photos: Photo[] = await Promise.all(
              ((photoRows as any[]) || []).map(async (p) => ({ ...p, signed_url: await getSignedUrl(p.photo_url) }))
            );
            const resolutionSignedUrl = issue.resolution_photo_url
              ? await getSignedUrl(issue.resolution_photo_url) : undefined;
            return { ...issue, photos, resolution_signed_url: resolutionSignedUrl };
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
    const proj = projects.find((p) => p.id === projectId);
    for (const issue of proj?.issues || []) {
      for (const photo of issue.photos) {
        const path = photo.photo_url.includes("installation-photos/") ? photo.photo_url.split("installation-photos/")[1] : photo.photo_url;
        await supabase.storage.from("installation-photos").remove([path]).catch(() => {});
      }
      if (issue.resolution_photo_url) {
        await supabase.storage.from("installation-photos").remove([issue.resolution_photo_url]).catch(() => {});
      }
    }
    await supabase.from("installation_projects" as any).delete().eq("id", projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (selectedProjectId === projectId) setSelectedProjectId(null);
    toast({ title: "Snag list deleted" });
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading snag lists…
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
          jobId={jobId}
        />
      ) : (
        <>
          {projects.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                <FolderOpen className="h-6 w-6 text-primary" />
              </div>
              <p className="font-medium">No snag lists yet</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Create a snag list to track installation issues, add annotated photos and generate a handover pack.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Create Snag List
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">{projects.length} snag list{projects.length !== 1 ? "s" : ""}</p>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> New Note / Snag
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {projects.map((proj) => {
                  const open = proj.issues.filter((i) => i.status !== "resolved").length;
                  const resolved = proj.issues.filter((i) => i.status === "resolved").length;
                  const critical = proj.issues.filter((i) => i.priority === "critical" && i.status !== "resolved").length;
                  return (
                    <div key={proj.id} className="group rounded-lg border bg-card hover:border-primary/40 transition-colors cursor-pointer p-4"
                      onClick={() => setSelectedProjectId(proj.id)}>
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
                            <Button size="icon" variant="ghost"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Snag List</AlertDialogTitle>
                              <AlertDialogDescription>Delete "{proj.title}" and all its issues and photos?</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteProject(proj.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Circle className="h-3 w-3 text-amber-500" /> {open} open
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-green-500" /> {resolved} resolved
                        </span>
                        {critical > 0 && (
                          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                            <AlertTriangle className="h-3 w-3" /> {critical} critical
                          </span>
                        )}
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
