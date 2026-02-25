import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, FileText, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type JobTemplate = {
  id: string;
  name: string;
  category: string;
  priority: string;
  pressure_test_qty: number;
  visual_qty: number;
  address: string | null;
  description: string | null;
  created_at: string;
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

export default function JobTemplateSettings() {
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load job templates");
    else setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const startEdit = (t: JobTemplate) => {
    setEditingId(t.id);
    setEditName(t.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    setSavingId(id);
    const { error } = await supabase
      .from("job_templates")
      .update({ name: editName.trim(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Failed to rename template");
    } else {
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, name: editName.trim() } : t));
      toast.success("Template renamed");
      setEditingId(null);
    }
    setSavingId(null);
  };

  const deleteTemplate = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("job_templates").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete template");
    } else {
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success("Template deleted");
    }
    setDeletingId(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">Job Templates</CardTitle>
        </div>
        <CardDescription>
          Manage saved job configurations. Templates can be loaded when creating new jobs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No templates saved yet. Create jobs and save them as templates to see them here.
          </p>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  {editingId === t.id ? (
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveEdit(t.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="h-7 text-sm"
                      autoFocus
                    />
                  ) : (
                    <p className="text-sm font-medium truncate">{t.name}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant={PRIORITY_COLORS[t.priority] as any || "outline"} className="text-xs capitalize">
                      {t.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground capitalize">{t.category}</span>
                    {t.pressure_test_qty > 0 && (
                      <span className="text-xs text-muted-foreground">PT×{t.pressure_test_qty}</span>
                    )}
                    {t.visual_qty > 0 && (
                      <span className="text-xs text-muted-foreground">V×{t.visual_qty}</span>
                    )}
                    {t.address && (
                      <span className="text-xs text-muted-foreground truncate max-w-[160px]">{t.address}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {editingId === t.id ? (
                    <>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-green-600"
                        onClick={() => saveEdit(t.id)}
                        disabled={savingId === t.id}
                      >
                        {savingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                        {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete template?</AlertDialogTitle>
                        <AlertDialogDescription>
                          "{t.name}" will be permanently deleted. Existing jobs created from this template are not affected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deleteTemplate(t.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
