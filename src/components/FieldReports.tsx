import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, FileText, Pencil, Trash2, Download, Sparkles, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import DOMPurify from "dompurify";
import RichTextEditor from "./RichTextEditor";

interface FieldReportsProps {
  jobId: string;
}

interface FieldReport {
  id: string;
  title: string;
  content: string;
  author_id: string;
  created_at: string;
  updated_at: string;
  summary?: string | null;
}

const triggerSummarization = async (reportId: string) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-report`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ reportId }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Summarization failed:", err.error || response.statusText);
    }
  } catch (e) {
    console.error("Summarization error:", e);
  }
};

export default function FieldReports({ jobId }: FieldReportsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewReport, setViewReport] = useState<FieldReport | null>(null);
  const [editingReport, setEditingReport] = useState<FieldReport | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(new Set());

  const fetchReports = async () => {
    const { data } = await supabase
      .from("field_reports")
      .select("*")
      .eq("job_id", jobId)
      .order("updated_at", { ascending: false });
    const items = (data || []) as FieldReport[];
    setReports(items);

    // Clear summarizing state for reports that now have summaries
    setSummarizingIds((prev) => {
      const next = new Set(prev);
      items.forEach((r) => {
        if (r.summary) next.delete(r.id);
      });
      return next;
    });

    const authorIds = [...new Set(items.map((r) => r.author_id))];
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", authorIds);
      const names: Record<string, string> = {};
      (profiles || []).forEach((p) => { names[p.user_id] = p.full_name || "Unknown"; });
      setAuthorNames(names);
    }
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, [jobId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`field-reports-${jobId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'field_reports', filter: `job_id=eq.${jobId}` },
        () => { fetchReports(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  const openNew = () => {
    setEditingReport(null);
    setTitle("");
    setContent("");
    setEditorOpen(true);
  };

  const openEdit = (report: FieldReport) => {
    setEditingReport(report);
    setTitle(report.title);
    setContent(report.content);
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!user || !title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);

    if (editingReport) {
      const { error } = await supabase
        .from("field_reports")
        .update({ title: title.trim(), content })
        .eq("id", editingReport.id);
      if (error) {
        toast({ title: "Error", description: "Failed to update report.", variant: "destructive" });
      } else {
        toast({ title: "Saved", description: "Report updated." });
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("field_reports")
        .insert({ job_id: jobId, author_id: user.id, title: title.trim(), content })
        .select("id")
        .single();
      if (error) {
        toast({ title: "Error", description: "Failed to create report.", variant: "destructive" });
      } else {
        toast({ title: "Created", description: "Report saved. Generating summary..." });
        if (inserted) {
          setSummarizingIds((prev) => new Set(prev).add(inserted.id));
          triggerSummarization(inserted.id);
        }
      }
    }

    setSaving(false);
    setEditorOpen(false);
    fetchReports();
  };

  const handleResummarize = async (reportId: string) => {
    setSummarizingIds((prev) => new Set(prev).add(reportId));
    toast({ title: "Re-summarizing..." });
    await triggerSummarization(reportId);
    fetchReports();
  };

  const exportToPdf = async (report: FieldReport) => {
    const escapeHtml = (str: string) => str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m] || m));
    const sanitizedTitle = escapeHtml(report.title || "Untitled Report");
    const sanitizedAuthor = escapeHtml(authorNames[report.author_id] || "Unknown");
    const sanitizedSummary = report.summary ? escapeHtml(report.summary) : "";
    const sanitizedContent = DOMPurify.sanitize(report.content);

    const container = document.createElement("div");
    container.style.width = "794px";
    container.style.padding = "40px";
    container.style.fontFamily = "Arial, sans-serif";
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.innerHTML = `
      <h1 style="font-size: 24px; margin-bottom: 4px;">${sanitizedTitle}</h1>
      <p style="font-size: 12px; color: #666; margin-bottom: 20px;">
        Author: ${sanitizedAuthor} • ${new Date(report.updated_at).toLocaleString()}
      </p>
      ${sanitizedSummary ? `<p style="font-size: 13px; color: #444; background: #f5f5f5; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px;"><strong>Summary:</strong> ${sanitizedSummary}</p>` : ""}
      <hr style="margin-bottom: 16px;" />
      <div style="font-size: 14px; line-height: 1.6;">${sanitizedContent}</div>
    `;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, { scale: 2 });
      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${(report.title || "report").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
    } finally {
      document.body.removeChild(container);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("field_reports").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete report.", variant: "destructive" });
    } else {
      toast({ title: "Deleted" });
      setReports((prev) => prev.filter((r) => r.id !== id));
    }
  };

  // Keep viewReport in sync with latest data
  useEffect(() => {
    if (viewReport) {
      const updated = reports.find((r) => r.id === viewReport.id);
      if (updated) setViewReport(updated);
    }
  }, [reports]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Field Reports ({reports.length})</h2>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" /> New Report
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!loading && reports.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No field reports yet. Create one to get started.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <Card key={report.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewReport(report)}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span className="truncate">{report.title || "Untitled"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">
                {authorNames[report.author_id] || "Unknown"} • {new Date(report.updated_at).toLocaleDateString()}
              </p>
              {summarizingIds.has(report.id) && !report.summary ? (
                <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Summarizing...
                </p>
              ) : report.summary ? (
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{report.summary}</p>
              ) : null}
              <div className="mt-2 flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); openEdit(report); }}>
                  <Pencil className="mr-1 h-3 w-3" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); exportToPdf(report); }}>
                  <Download className="mr-1 h-3 w-3" /> PDF
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={(e) => e.stopPropagation()}>
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete report?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently delete "{report.title}". This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDelete(report.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingReport ? "Edit Report" : "New Field Report"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            <Input placeholder="Report title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <RichTextEditor content={content} onChange={setContent} placeholder="Write your field report..." />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Report"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewReport} onOpenChange={(open) => !open && setViewReport(null)}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {viewReport?.title || "Untitled"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {viewReport && authorNames[viewReport.author_id]} • Last updated {viewReport && new Date(viewReport.updated_at).toLocaleString()}
            </p>
          </DialogHeader>

          {/* Summary box */}
          {viewReport && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Summary
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={summarizingIds.has(viewReport.id)}
                  onClick={() => handleResummarize(viewReport.id)}
                >
                  {summarizingIds.has(viewReport.id) ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Summarizing...</>
                  ) : (
                    <><Sparkles className="mr-1 h-3 w-3" /> Re-summarize</>
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {summarizingIds.has(viewReport.id) && !viewReport.summary
                  ? "Generating summary..."
                  : viewReport.summary || "No summary yet."}
              </p>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {viewReport && <RichTextEditor content={viewReport.content} onChange={() => {}} editable={false} />}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setViewReport(null)}>Close</Button>
            <Button variant="outline" onClick={() => { if (viewReport) exportToPdf(viewReport); }}>
              <Download className="mr-1.5 h-4 w-4" /> Export PDF
            </Button>
            <Button onClick={() => { if (viewReport) { openEdit(viewReport); setViewReport(null); } }}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
