/**
 * JobRemedialChecklist — works-completion checklist for remedial jobs.
 *
 * Renders on desktop admin view and mobile engineer view. Items are shown
 * only when at least one exists (engineers never see an empty section) or
 * when the job is flagged `is_remedial` on the admin view (which enables
 * inline "Add item" for the coordinator).
 *
 * Engineers can flip status pending → done → na and optionally leave a
 * comment. Completion of the job is gated in JobCompleteAction on all
 * items being resolved (done or na).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check, Ban, RotateCcw, ClipboardList, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import RemedialItemPhotos from "@/components/jobs/RemedialItemPhotos";

type RemedialItem = {
  id: string;
  seq: number;
  description: string;
  status: "pending" | "done" | "na";
  comment: string | null;
  done_by: string | null;
  done_at: string | null;
  source: string;
};

type Props = {
  jobId: string;
  jobOrgId?: string | null;
  isRemedial: boolean;
  isAdmin: boolean;
  isAssignedEngineer: boolean;
  /** When true, always render on admin view (used by the "Add works checklist" action on non-remedial jobs). */
  forceShow?: boolean;
  onItemsChanged?: () => void;
};

export default function JobRemedialChecklist({
  jobId, jobOrgId, isRemedial, isAdmin, isAssignedEngineer, forceShow, onItemsChanged,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<RemedialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const canEdit = isAdmin || isAssignedEngineer;
  const canAdd = isAdmin; // office adds items; engineer only marks status/comment

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job_remedial_items" as any)
      .select("id, seq, description, status, comment, done_by, done_at, source")
      .eq("job_id", jobId)
      .order("seq", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) console.error("load remedial items failed", error);
    setItems(((data || []) as any) as RemedialItem[]);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // Auto-hide when no items and not remedial (engineers see nothing).
  // On admin desktop view, still render when `isRemedial` so they can add items,
  // OR when items exist (works-checklist opt-in on any job).
  if (loading) return null;
  const hasItems = items.length > 0;
  if (!hasItems && !(isAdmin && (isRemedial || forceShow))) return null;

  const addItem = async () => {
    const desc = newDesc.trim();
    if (!desc) return;
    setAdding(true);
    const maxSeq = items.reduce((m, i) => Math.max(m, i.seq), -1);
    const { error } = await supabase.from("job_remedial_items" as any).insert({
      job_id: jobId,
      org_id: jobOrgId ?? null,
      description: desc,
      seq: maxSeq + 1,
      status: "pending",
      source: "manual",
      created_by: user?.id ?? null,
    } as any);
    setAdding(false);
    if (error) {
      toast({ title: "Failed to add item", description: error.message, variant: "destructive" });
    } else {
      setNewDesc("");
      await load();
      onItemsChanged?.();
    }
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("job_remedial_items" as any).delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { await load(); onItemsChanged?.(); }
  };

  const setStatus = async (item: RemedialItem, status: RemedialItem["status"]) => {
    const patch: Record<string, unknown> = { status };
    if (status === "done") {
      patch.done_by = user?.id ?? null;
      patch.done_at = new Date().toISOString();
    } else {
      patch.done_by = null;
      patch.done_at = null;
    }
    const { error } = await supabase.from("job_remedial_items" as any).update(patch as any).eq("id", item.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else { await load(); onItemsChanged?.(); }
  };

  const saveComment = async (item: RemedialItem) => {
    const { error } = await supabase
      .from("job_remedial_items" as any)
      .update({ comment: commentDraft.trim() || null } as any)
      .eq("id", item.id);
    if (error) toast({ title: "Comment failed", description: error.message, variant: "destructive" });
    else {
      setEditingCommentId(null);
      setCommentDraft("");
      await load();
    }
  };

  const doneCount = items.filter((i) => i.status !== "pending").length;
  const outstanding = items.length - doneCount;

  return (
    <div className="mb-6 rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Remedial works checklist</h3>
          {hasItems && (
            <Badge variant={outstanding > 0 ? "destructive" : "default"} className="ml-1">
              {doneCount} / {items.length} resolved
            </Badge>
          )}
        </div>
      </div>

      {!hasItems ? (
        <p className="text-sm text-muted-foreground mb-3">
          No items yet. Add each unit of work below — the engineer will tick them off on site.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {items.map((item) => {
            const isEditingComment = editingCommentId === item.id;
            const statusColor =
              item.status === "done" ? "text-emerald-600 dark:text-emerald-400"
              : item.status === "na" ? "text-muted-foreground"
              : "text-amber-600 dark:text-amber-400";
            return (
              <li key={item.id} className="rounded-md border bg-background p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm break-words", item.status === "done" && "line-through opacity-70", item.status === "na" && "italic opacity-60")}>
                      {item.description}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className={cn("font-medium capitalize", statusColor)}>
                        {item.status === "na" ? "N/A" : item.status}
                      </span>
                      {item.source === "po_inference" && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">auto</Badge>
                      )}
                    </div>
                    {item.comment && !isEditingComment && (
                      <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">💬 {item.comment}</p>
                    )}
                    {isEditingComment && (
                      <div className="mt-2 space-y-1">
                        <Textarea
                          value={commentDraft}
                          onChange={(e) => setCommentDraft(e.target.value)}
                          placeholder="Comment (optional)"
                          rows={2}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveComment(item)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingCommentId(null); setCommentDraft(""); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                      {item.status !== "done" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(item, "done")} className="h-8 px-2" title="Mark done">
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {item.status !== "na" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(item, "na")} className="h-8 px-2" title="Mark N/A">
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                      {item.status !== "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => setStatus(item, "pending")} className="h-8 px-2" title="Reset">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {!isEditingComment && (
                        <Button size="sm" variant="ghost" onClick={() => { setEditingCommentId(item.id); setCommentDraft(item.comment || ""); }} className="h-8 px-2 text-xs">
                          {item.comment ? "Edit note" : "Add note"}
                        </Button>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => removeItem(item.id)} className="h-8 px-2 text-destructive" title="Remove item">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canAdd && (
        <div className="flex gap-2">
          <Input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
            placeholder="Describe a piece of remedial work…"
            className="flex-1"
          />
          <Button onClick={addItem} disabled={adding || !newDesc.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" /> Add</>}
          </Button>
        </div>
      )}
    </div>
  );
}
