import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, FileText, Pencil, Trash2, Eye } from "lucide-react";
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
}

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

  const fetchReports = async () => {
    const { data } = await supabase
      .from("field_reports")
      .select("*")
      .eq("job_id", jobId)
      .order("updated_at", { ascending: false });
    const items = data || [];
    setReports(items);

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
      const { error } = await supabase
        .from("field_reports")
        .insert({ job_id: jobId, author_id: user.id, title: title.trim(), content });
      if (error) {
        toast({ title: "Error", description: "Failed to create report.", variant: "destructive" });
      } else {
        toast({ title: "Created", description: "Report saved." });
      }
    }

    setSaving(false);
    setEditorOpen(false);
    fetchReports();
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
              <div className="mt-2 flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); openEdit(report); }}>
                  <Pencil className="mr-1 h-3 w-3" /> Edit
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
          <div className="flex-1 overflow-auto">
            {viewReport && <RichTextEditor content={viewReport.content} onChange={() => {}} editable={false} />}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setViewReport(null)}>Close</Button>
            <Button onClick={() => { if (viewReport) { openEdit(viewReport); setViewReport(null); } }}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
