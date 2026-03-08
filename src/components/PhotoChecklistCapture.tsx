import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Camera,
  CheckCircle2,
  Circle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileDown,
  RefreshCw,
  SwitchCamera,
  Image as ImageIcon,
  MessageSquare,
  CheckSquare,
  Type,
  Loader2,
  ArrowLeftRight,
} from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";

// ── Types ──────────────────────────────────────────────────────────────────────

type Template = {
  id: string;
  name: string;
  category: string;
  description: string | null;
};

type TemplateItem = {
  id: string;
  template_id: string;
  sort_order: number;
  item_type: "photo" | "before_after" | "checkbox" | "text";
  label: string;
  description: string | null;
  required: boolean;
};

type Response = {
  id?: string;
  item_id: string;
  response_type: string;
  photo_url?: string | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  text_value?: string | null;
  is_pass?: boolean | null;
  notes?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isComplete(item: TemplateItem, resp: Response | undefined): boolean {
  if (!resp) return false;
  if (item.item_type === "photo") return !!resp.photo_url;
  if (item.item_type === "before_after") return !!(resp.before_photo_url && resp.after_photo_url);
  if (item.item_type === "checkbox") return resp.is_pass !== null && resp.is_pass !== undefined;
  if (item.item_type === "text") return !!(resp.text_value?.trim());
  return false;
}

function getItemIcon(type: TemplateItem["item_type"]) {
  if (type === "photo") return Camera;
  if (type === "before_after") return ArrowLeftRight;
  if (type === "checkbox") return CheckSquare;
  return Type;
}

// ── PhotoCapture single button ─────────────────────────────────────────────────

function PhotoCaptureButton({
  label,
  photoUrl,
  onCapture,
  uploading,
  size = "normal",
}: {
  label: string;
  photoUrl: string | null | undefined;
  onCapture: (file: File) => void;
  uploading: boolean;
  size?: "normal" | "large";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoUrl) { setSignedUrl(null); return; }
    supabase.storage.from("submissions").createSignedUrl(photoUrl, 3600)
      .then(({ data }) => setSignedUrl(data?.signedUrl || null));
  }, [photoUrl]);

  const h = size === "large" ? "h-48 sm:h-56" : "h-36";

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ""; }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`relative w-full ${h} rounded-xl border-2 border-dashed overflow-hidden transition-all active:scale-98 ${
          photoUrl
            ? "border-primary/40 bg-muted/20"
            : "border-muted-foreground/30 bg-muted/30 hover:border-primary/50 hover:bg-muted/40"
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Uploading…</span>
          </div>
        ) : signedUrl ? (
          <>
            <img src={signedUrl} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
              <div className="bg-black/60 rounded-full p-2">
                <SwitchCamera className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="absolute top-2 right-2">
              <div className="bg-primary rounded-full p-0.5">
                <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="rounded-full bg-muted p-4">
              <Camera className="h-8 w-8 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium text-muted-foreground px-4 text-center">{label}</span>
            <span className="text-xs text-muted-foreground/60">Tap to capture</span>
          </div>
        )}
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PhotoChecklistCapture({
  jobId,
  jobName,
  jobCategory,
  customerName,
  siteName,
}: {
  jobId: string;
  jobName: string;
  jobCategory: string;
  customerName?: string;
  siteName?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [activeIdx, setActiveIdx] = useState(0);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load matching templates
  useEffect(() => {
    const loadTemplates = async () => {
      const { data } = await supabase
        .from("photo_checklist_templates" as any)
        .select("*")
        .eq("is_active", true)
        .order("name");
      setTemplates((data as unknown as Template[]) || []);
    };
    loadTemplates();
  }, []);

  // Load existing checklist for this job
  useEffect(() => {
    const loadExisting = async () => {
      const { data } = await supabase
        .from("job_photo_checklists" as any)
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const cl = data as any;
        setChecklistId(cl.id);
        // Load the template
        const { data: tmpl } = await supabase
          .from("photo_checklist_templates" as any)
          .select("*")
          .eq("id", cl.template_id)
          .maybeSingle();
        if (tmpl) setSelectedTemplate(tmpl as unknown as Template);
        // Load responses
        const { data: resps } = await supabase
          .from("job_photo_checklist_responses" as any)
          .select("*")
          .eq("checklist_id", cl.id);
        const map: Record<string, Response> = {};
        ((resps as unknown as Response[]) || []).forEach(r => { map[r.item_id] = r; });
        setResponses(map);
      }
    };
    loadExisting();
  }, [jobId]);

  // Load items when template selected
  useEffect(() => {
    if (!selectedTemplate) return;
    const loadItems = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("photo_checklist_items" as any)
        .select("*")
        .eq("template_id", selectedTemplate.id)
        .order("sort_order");
      setItems((data as unknown as TemplateItem[]) || []);
      setActiveIdx(0);
      setLoading(false);
    };
    loadItems();
  }, [selectedTemplate]);

  // Start or reuse checklist
  const ensureChecklist = async (templateId: string): Promise<string> => {
    if (checklistId) return checklistId;
    const { data, error } = await supabase
      .from("job_photo_checklists" as any)
      .insert({ job_id: jobId, template_id: templateId, created_by: user?.id })
      .select()
      .single();
    if (error) throw error;
    const id = (data as any).id;
    setChecklistId(id);
    return id;
  };

  const uploadPhoto = async (file: File, itemId: string, field: string) => {
    const key = `${itemId}__${field}`;
    setUploading(prev => ({ ...prev, [key]: true }));
    try {
      const path = `${jobId}/checklist_${itemId}_${field}_${Date.now()}.${file.name.split(".").pop()}`;
      const { error: upErr } = await supabase.storage.from("submissions").upload(path, file);
      if (upErr) throw upErr;

      const clId = await ensureChecklist(selectedTemplate!.id);

      const existing = responses[itemId];
      const upsertData: any = {
        checklist_id: clId,
        item_id: itemId,
        job_id: jobId,
        response_type: field === "photo_url" ? "photo" : "before_after",
        captured_by: user?.id,
        ...(existing || {}),
        [field]: path,
      };
      delete upsertData.id;

      if (existing?.id) {
        await supabase.from("job_photo_checklist_responses" as any)
          .update({ [field]: path })
          .eq("id", existing.id);
        setResponses(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: path } }));
      } else {
        const { data: newResp } = await supabase.from("job_photo_checklist_responses" as any)
          .insert(upsertData).select().single();
        setResponses(prev => ({ ...prev, [itemId]: { ...(newResp as unknown as Response), [field]: path } }));
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  const saveTextResponse = async (itemId: string, field: "text_value" | "is_pass" | "notes", value: any) => {
    const clId = await ensureChecklist(selectedTemplate!.id);
    const existing = responses[itemId];
    const item = items.find(i => i.id === itemId);

    if (existing?.id) {
      await supabase.from("job_photo_checklist_responses" as any)
        .update({ [field]: value }).eq("id", existing.id);
      setResponses(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
    } else {
      const { data: newResp } = await supabase.from("job_photo_checklist_responses" as any).insert({
        checklist_id: clId,
        item_id: itemId,
        job_id: jobId,
        response_type: item?.item_type || "text",
        captured_by: user?.id,
        [field]: value,
      }).select().single();
      setResponses(prev => ({ ...prev, [itemId]: newResp as unknown as Response }));
    }
  };

  const getSignedUrl = async (path: string): Promise<string | null> => {
    const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  };

  const imageToBase64 = (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = url;
    });

  const generatePdf = async () => {
    if (!selectedTemplate) return;
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, margin = 14;
      let y = margin;

      // Header bar
      doc.setFillColor(30, 64, 175);
      doc.rect(0, 0, W, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("PHOTO COMPLIANCE REPORT", margin, 14);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(format(new Date(), "dd/MM/yyyy HH:mm"), W - margin, 14, { align: "right" });
      y = 30;

      // Job info block
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Job:", margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(jobName, margin + 18, y);
      y += 6;
      if (customerName) {
        doc.setFont("helvetica", "bold");
        doc.text("Customer:", margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(customerName, margin + 22, y);
        y += 6;
      }
      if (siteName) {
        doc.setFont("helvetica", "bold");
        doc.text("Site:", margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(siteName, margin + 18, y);
        y += 6;
      }
      doc.setFont("helvetica", "bold");
      doc.text("Checklist:", margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(selectedTemplate.name, margin + 23, y);
      y += 10;

      // Summary line
      const completedCount = items.filter(i => isComplete(i, responses[i.id])).length;
      doc.setFillColor(240, 250, 240);
      doc.roundedRect(margin, y, W - margin * 2, 10, 2, 2, "F");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 130, 60);
      doc.setFont("helvetica", "bold");
      doc.text(`${completedCount} / ${items.length} items completed`, margin + 3, y + 6.5);
      y += 16;

      // Items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const resp = responses[item.id];
        const done = isComplete(item, resp);

        // Item header
        if (y > 260) { doc.addPage(); y = margin; }
        doc.setFillColor(done ? 240 : 255, done ? 250 : 240, done ? 240 : 240);
        doc.roundedRect(margin, y, W - margin * 2, 8, 1.5, 1.5, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        doc.text(`${i + 1}. ${item.label}`, margin + 3, y + 5.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(done ? 30 : 200, done ? 130 : 50, done ? 60 : 50);
        doc.text(done ? "✓ COMPLETE" : "○ PENDING", W - margin - 3, y + 5.5, { align: "right" });
        y += 11;

        if (item.item_type === "photo" && resp?.photo_url) {
          const signed = await getSignedUrl(resp.photo_url);
          if (signed) {
            try {
              const b64 = await imageToBase64(signed);
              if (y + 55 > 280) { doc.addPage(); y = margin; }
              doc.addImage(b64, "JPEG", margin, y, 80, 55);
              y += 58;
            } catch { /* skip if image fails */ }
          }
        }

        if (item.item_type === "before_after") {
          const beforeSigned = resp?.before_photo_url ? await getSignedUrl(resp.before_photo_url) : null;
          const afterSigned = resp?.after_photo_url ? await getSignedUrl(resp.after_photo_url) : null;
          if (beforeSigned || afterSigned) {
            if (y + 58 > 280) { doc.addPage(); y = margin; }
            const halfW = (W - margin * 2 - 4) / 2;
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            if (beforeSigned) {
              doc.text("BEFORE", margin, y + 4);
              try {
                const b64 = await imageToBase64(beforeSigned);
                doc.addImage(b64, "JPEG", margin, y + 5, halfW, 48);
              } catch { /* skip */ }
            }
            if (afterSigned) {
              doc.text("AFTER", margin + halfW + 4, y + 4);
              try {
                const b64 = await imageToBase64(afterSigned);
                doc.addImage(b64, "JPEG", margin + halfW + 4, y + 5, halfW, 48);
              } catch { /* skip */ }
            }
            y += 56;
          }
        }

        if (item.item_type === "checkbox") {
          if (y > 270) { doc.addPage(); y = margin; }
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(40, 40, 40);
          const result = resp?.is_pass === true ? "PASS ✓" : resp?.is_pass === false ? "FAIL ✗" : "Not answered";
          doc.text(`Result: ${result}`, margin + 3, y);
          y += 6;
        }

        if (item.item_type === "text" && resp?.text_value) {
          if (y > 270) { doc.addPage(); y = margin; }
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(40, 40, 40);
          const lines = doc.splitTextToSize(`Value: ${resp.text_value}`, W - margin * 2 - 6);
          doc.text(lines, margin + 3, y);
          y += lines.length * 4.5 + 2;
        }

        if (resp?.notes) {
          if (y > 270) { doc.addPage(); y = margin; }
          doc.setFontSize(7.5);
          doc.setTextColor(100, 100, 100);
          const lines = doc.splitTextToSize(`Notes: ${resp.notes}`, W - margin * 2 - 6);
          doc.text(lines, margin + 3, y);
          y += lines.length * 4 + 2;
        }

        y += 3;
      }

      // Footer
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.setFont("helvetica", "normal");
        doc.text(`Servexa Field Service Platform  •  ${selectedTemplate.name}  •  Page ${p} of ${pages}`, W / 2, 292, { align: "center" });
      }

      doc.save(`photo-report-${jobId}-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
      toast({ title: "PDF report downloaded" });
    } catch (err: any) {
      toast({ title: "PDF error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const completedCount = items.filter(i => isComplete(i, responses[i.id])).length;
  const requiredCount = items.filter(i => i.required).length;
  const completedRequired = items.filter(i => i.required && isComplete(i, responses[i.id])).length;
  const pct = items.length ? Math.round((completedCount / items.length) * 100) : 0;
  const activeItem = items[activeIdx];

  // ── Template selection screen ──
  if (!selectedTemplate) {
    return (
      <div className="space-y-4">
        <div className="text-center py-6">
          <Camera className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold text-sm mb-1">Photo Documentation</h3>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Select an inspection template to start capturing photos and completing your compliance checklist.
          </p>
        </div>
        <div className="space-y-2">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t)}
              className="w-full text-left rounded-xl border bg-card hover:bg-muted/40 p-4 transition-colors active:scale-99"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{t.name}</p>
                  {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                </div>
                <Badge variant="outline" className="text-[10px] capitalize shrink-0 mt-0.5">
                  {t.category.replace(/_/g, " ")}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading checklist…
      </div>
    );
  }

  // ── Main capture UI ──
  return (
    <div className="space-y-4">
      {/* Header + progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedTemplate(null); setItems([]); setChecklistId(null); setResponses({}); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <h3 className="font-semibold text-sm">{selectedTemplate.name}</h3>
              <p className="text-[10px] text-muted-foreground">
                {completedCount}/{items.length} captured · {completedRequired}/{requiredCount} required
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={generatePdf}
            disabled={generatingPdf || completedCount === 0}
          >
            {generatingPdf
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <FileDown className="mr-1.5 h-3.5 w-3.5" />}
            {generatingPdf ? "Generating…" : "PDF Report"}
          </Button>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      {/* Item navigation pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {items.map((item, idx) => {
          const done = isComplete(item, responses[item.id]);
          const Icon = getItemIcon(item.item_type);
          return (
            <button
              key={item.id}
              onClick={() => setActiveIdx(idx)}
              className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                idx === activeIdx
                  ? "bg-primary text-primary-foreground"
                  : done
                  ? "bg-primary/15 text-primary"
                  : item.required
                  ? "bg-muted text-muted-foreground border border-dashed border-destructive/40"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {done
                ? <CheckCircle2 className="h-3 w-3" />
                : item.required
                ? <AlertCircle className="h-3 w-3 text-destructive/60" />
                : <Circle className="h-3 w-3" />}
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* Active item card */}
      {activeItem && (
        <Card className="overflow-hidden">
          <div className={`px-4 py-3 flex items-start justify-between gap-2 ${
            isComplete(activeItem, responses[activeItem.id])
              ? "bg-primary/8"
              : "bg-muted/40"
          }`}>
            <div className="flex items-start gap-2.5 min-w-0">
              <div className={`mt-0.5 rounded-full p-1.5 shrink-0 ${
                isComplete(activeItem, responses[activeItem.id]) ? "bg-primary/20" : "bg-muted"
              }`}>
                {(() => { const I = getItemIcon(activeItem.item_type); return <I className="h-3.5 w-3.5" />; })()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-snug">{activeItem.label}</p>
                {activeItem.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{activeItem.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {activeItem.required && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-destructive border-destructive/30">
                  Required
                </Badge>
              )}
              {isComplete(activeItem, responses[activeItem.id]) && (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )}
            </div>
          </div>

          <CardContent className="p-4 space-y-3">
            {/* Photo capture */}
            {activeItem.item_type === "photo" && (
              <PhotoCaptureButton
                label="Tap to capture photo"
                photoUrl={responses[activeItem.id]?.photo_url}
                onCapture={f => uploadPhoto(f, activeItem.id, "photo_url")}
                uploading={!!uploading[`${activeItem.id}__photo_url`]}
                size="large"
              />
            )}

            {/* Before / After */}
            {activeItem.item_type === "before_after" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-destructive/60 inline-block" /> BEFORE
                  </p>
                  <PhotoCaptureButton
                    label="Before photo"
                    photoUrl={responses[activeItem.id]?.before_photo_url}
                    onCapture={f => uploadPhoto(f, activeItem.id, "before_photo_url")}
                    uploading={!!uploading[`${activeItem.id}__before_photo_url`]}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary inline-block" /> AFTER
                  </p>
                  <PhotoCaptureButton
                    label="After photo"
                    photoUrl={responses[activeItem.id]?.after_photo_url}
                    onCapture={f => uploadPhoto(f, activeItem.id, "after_photo_url")}
                    uploading={!!uploading[`${activeItem.id}__after_photo_url`]}
                  />
                </div>
              </div>
            )}

            {/* Checkbox / Pass-Fail */}
            {activeItem.item_type === "checkbox" && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => saveTextResponse(activeItem.id, "is_pass", true)}
                  className={`rounded-xl p-4 border-2 flex flex-col items-center gap-2 transition-all ${
                    responses[activeItem.id]?.is_pass === true
                      ? "bg-primary/15 border-primary text-primary"
                      : "bg-muted/30 border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  <CheckCircle2 className="h-8 w-8" />
                  <span className="font-bold text-sm">PASS</span>
                </button>
                <button
                  onClick={() => saveTextResponse(activeItem.id, "is_pass", false)}
                  className={`rounded-xl p-4 border-2 flex flex-col items-center gap-2 transition-all ${
                    responses[activeItem.id]?.is_pass === false
                      ? "bg-destructive/15 border-destructive text-destructive"
                      : "bg-muted/30 border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  <AlertCircle className="h-8 w-8" />
                  <span className="font-bold text-sm">FAIL</span>
                </button>
              </div>
            )}

            {/* Text input */}
            {activeItem.item_type === "text" && (
              <Textarea
                placeholder="Enter value…"
                value={responses[activeItem.id]?.text_value || ""}
                onChange={e => setResponses(prev => ({
                  ...prev,
                  [activeItem.id]: { ...prev[activeItem.id], item_id: activeItem.id, response_type: "text", text_value: e.target.value },
                }))}
                onBlur={e => saveTextResponse(activeItem.id, "text_value", e.target.value)}
                className="text-sm min-h-[80px]"
              />
            )}

            {/* Notes */}
            <div>
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  const el = document.getElementById(`notes-${activeItem.id}`);
                  el?.classList.toggle("hidden");
                }}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Add note
              </button>
              <div id={`notes-${activeItem.id}`} className="hidden mt-2">
                <Textarea
                  placeholder="Notes or observations…"
                  value={responses[activeItem.id]?.notes || ""}
                  onChange={e => setResponses(prev => ({
                    ...prev,
                    [activeItem.id]: { ...prev[activeItem.id], item_id: activeItem.id, response_type: activeItem.item_type, notes: e.target.value },
                  }))}
                  onBlur={e => saveTextResponse(activeItem.id, "notes", e.target.value)}
                  className="text-xs min-h-[60px]"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prev / Next navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
          disabled={activeIdx === 0}
          className="flex-1"
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        {activeIdx < items.length - 1 ? (
          <Button
            size="sm"
            onClick={() => setActiveIdx(i => i + 1)}
            className="flex-1"
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={generatePdf}
            disabled={generatingPdf || completedCount === 0}
            className="flex-1"
          >
            {generatingPdf
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Generating…</>
              : <><FileDown className="mr-1.5 h-4 w-4" />Generate Report</>}
          </Button>
        )}
      </div>

      {/* Item overview grid */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-muted/40 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">All Items</p>
        </div>
        <div className="divide-y">
          {items.map((item, idx) => {
            const done = isComplete(item, responses[item.id]);
            const Icon = getItemIcon(item.item_type);
            return (
              <button
                key={item.id}
                onClick={() => setActiveIdx(idx)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors ${
                  idx === activeIdx ? "bg-primary/5" : ""
                }`}
              >
                <div className={`shrink-0 rounded-full p-1 ${done ? "bg-primary/20" : "bg-muted"}`}>
                  <Icon className={`h-3.5 w-3.5 ${done ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium truncate ${idx === activeIdx ? "text-primary" : ""}`}>
                    {idx + 1}. {item.label}
                  </p>
                </div>
                <div className="shrink-0">
                  {done
                    ? <CheckCircle2 className="h-4 w-4 text-primary" />
                    : item.required
                    ? <AlertCircle className="h-4 w-4 text-destructive/50" />
                    : <Circle className="h-4 w-4 text-muted-foreground/30" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
