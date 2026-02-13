import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Pencil, Trash2, Send } from "lucide-react";

interface SubmissionCommentsProps {
  submissionId: string;
}

interface Comment {
  id: string;
  content: string;
  author_id: string;
  created_at: string;
  updated_at: string;
}

export default function SubmissionComments({ submissionId }: SubmissionCommentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("submission_comments")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });
    const items = data || [];
    setComments(items);

    const authorIds = [...new Set(items.map((c) => c.author_id))];
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", authorIds);
      const names: Record<string, string> = {};
      (profiles || []).forEach((p) => { names[p.user_id] = p.full_name || "Unknown"; });
      setAuthorNames(names);
    }
  };

  useEffect(() => {
    if (expanded) fetchComments();
  }, [submissionId, expanded]);

  const handleAdd = async () => {
    if (!user || !newComment.trim()) return;
    setSending(true);
    const { error } = await supabase.from("submission_comments").insert({
      submission_id: submissionId,
      author_id: user.id,
      content: newComment.trim(),
    });
    if (error) {
      toast({ title: "Error", description: "Failed to add comment.", variant: "destructive" });
    } else {
      setNewComment("");
      fetchComments();
    }
    setSending(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;
    const { error } = await supabase.from("submission_comments").update({ content: editContent.trim() }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    } else {
      setEditingId(null);
      fetchComments();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("submission_comments").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    } else {
      setComments((prev) => prev.filter((c) => c.id !== id));
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <MessageSquare className="h-3 w-3" />
        {comments.length > 0 ? `${comments.length} comment${comments.length > 1 ? "s" : ""}` : "Comment"}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-md bg-muted/50 p-2 text-sm">
              {editingId === c.id ? (
                <div className="space-y-1">
                  <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="min-h-[60px] text-sm" />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleUpdate(c.id)}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="whitespace-pre-wrap">{c.content}</p>
                    {user?.id === c.author_id && (
                      <div className="flex shrink-0 gap-0.5">
                        <button onClick={() => { setEditingId(c.id); setEditContent(c.content); }} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {authorNames[c.author_id] || "Unknown"} • {new Date(c.created_at).toLocaleString()}
                  </p>
                </>
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[40px] text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
            />
            <Button size="sm" variant="ghost" className="shrink-0 self-end" onClick={handleAdd} disabled={sending || !newComment.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
