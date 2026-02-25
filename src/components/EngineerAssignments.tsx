import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, X, Paperclip, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Engineer = { user_id: string; full_name: string; whatsapp_number: string | null };
type Assignment = { id: string; engineer_id: string; assigned_at: string; profile?: Engineer };
type EngDoc = { id: string; title: string; document_type: string; file_url: string; file_name: string; expiry_date: string | null };

export default function EngineerAssignments({ jobId }: { jobId: string }) {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allEngineers, setAllEngineers] = useState<Engineer[]>([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [loading, setLoading] = useState(false);

  // Attach docs dialog
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [justAssignedEng, setJustAssignedEng] = useState<Engineer | null>(null);
  const [engDocs, setEngDocs] = useState<EngDoc[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [attaching, setAttaching] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);

  const fetchAssignments = async () => {
    const { data } = await supabase.from("job_assignments").select("id, engineer_id, assigned_at").eq("job_id", jobId);
    if (!data || data.length === 0) { setAssignments([]); return; }
    const engineerIds = data.map((a) => a.engineer_id);
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, whatsapp_number").in("user_id", engineerIds);
    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    setAssignments(data.map((a) => ({ ...a, profile: profileMap.get(a.engineer_id) })));
  };

  const fetchEngineers = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "engineer");
    if (!roles || roles.length === 0) return;
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, whatsapp_number").in("user_id", roles.map((r) => r.user_id));
    setAllEngineers(profiles || []);
  };

  useEffect(() => {
    fetchAssignments();
    if (userRole === "admin") fetchEngineers();
  }, [jobId, userRole]);

  const handleAssign = async () => {
    if (!selectedEngineerId) return;
    setLoading(true);
    const { error } = await supabase.from("job_assignments").insert({ job_id: jobId, engineer_id: selectedEngineerId });
    if (error) {
      toast({ title: "Error", description: error.code === "23505" ? "Engineer already assigned." : "Failed to assign.", variant: "destructive" });
      setLoading(false);
      return;
    }

    toast({ title: "Engineer assigned" });
    const eng = allEngineers.find((e) => e.user_id === selectedEngineerId);
    setSelectedEngineerId("");
    fetchAssignments();
    setLoading(false);

    // Fetch engineer's docs and offer to attach
    if (eng) {
      setJustAssignedEng(eng);
      setSelectedDocIds(new Set());
      setDocsLoading(true);
      setAttachDialogOpen(true);
      const { data: docs } = await supabase
        .from("engineer_documents" as any)
        .select("id, title, document_type, file_url, file_name, expiry_date")
        .eq("engineer_id", eng.user_id)
        .order("created_at", { ascending: false });
      setEngDocs((docs as unknown as EngDoc[]) || []);
      setDocsLoading(false);
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    const { error } = await supabase.from("job_assignments").delete().eq("id", assignmentId);
    if (error) {
      toast({ title: "Error", description: "Failed to unassign.", variant: "destructive" });
    } else {
      toast({ title: "Engineer unassigned" });
      fetchAssignments();
    }
  };

  const handleAttachDocs = async () => {
    if (!justAssignedEng || selectedDocIds.size === 0) { setAttachDialogOpen(false); return; }
    setAttaching(true);
    const docsToAttach = engDocs.filter((d) => selectedDocIds.has(d.id));
    let attached = 0;
    for (const doc of docsToAttach) {
      // Copy from engineer-documents bucket to submissions bucket
      const destPath = `${jobId}/${Date.now()}-${doc.file_name}`;
      const { data: fileData } = await supabase.storage.from("engineer-documents").download(doc.file_url);
      if (!fileData) continue;
      const { error: uploadError } = await supabase.storage.from("submissions").upload(destPath, fileData);
      if (uploadError) continue;
      const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(destPath);
      await supabase.from("submissions").insert({
        job_id: jobId,
        engineer_id: justAssignedEng.user_id,
        type: "document",
        file_url: urlData.publicUrl,
        file_name: `[Cert] ${doc.title} — ${doc.file_name}`,
      });
      attached++;
    }
    setAttaching(false);
    setAttachDialogOpen(false);
    if (attached > 0) toast({ title: `${attached} document${attached > 1 ? "s" : ""} attached to job` });
  };

  const assignedIds = new Set(assignments.map((a) => a.engineer_id));
  const availableEngineers = allEngineers.filter((e) => !assignedIds.has(e.user_id));

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Assigned Engineers</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">No engineers assigned yet.</p>
          ) : (
            <div className="mb-3 flex flex-wrap gap-2">
              {assignments.map((a) => (
                <Badge key={a.id} variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1.5">
                  {a.profile?.full_name || "Unknown"}
                  {userRole === "admin" && (
                    <button onClick={() => handleUnassign(a.id)} className="ml-0.5 rounded-full p-0.5 hover:bg-muted">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}

          {userRole === "admin" && availableEngineers.length > 0 && (
            <div className="flex gap-2">
              <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select engineer..." />
                </SelectTrigger>
                <SelectContent>
                  {availableEngineers.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>{e.full_name || e.user_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleAssign} disabled={!selectedEngineerId || loading}>
                <UserPlus className="mr-1.5 h-4 w-4" /> Assign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attach Docs Dialog */}
      <Dialog open={attachDialogOpen} onOpenChange={(open) => { if (!open) setAttachDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Attach Certificates to Job
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select documents from <span className="font-medium text-foreground">{justAssignedEng?.full_name}</span>'s certification folder to attach to this job.
          </p>

          {docsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : engDocs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No certification documents on file for this engineer.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {engDocs.map((doc) => {
                const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                return (
                  <label key={doc.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
                    <Checkbox
                      checked={selectedDocIds.has(doc.id)}
                      onCheckedChange={(checked) => setSelectedDocIds((prev) => {
                        const next = new Set(prev);
                        checked ? next.add(doc.id) : next.delete(doc.id);
                        return next;
                      })}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">{doc.title}</span>
                        <Badge variant="outline" className="shrink-0 capitalize text-xs">{doc.document_type.replace(/_/g, " ")}</Badge>
                      </div>
                      {doc.expiry_date && (
                        <p className={`mt-0.5 text-xs ${isExpired ? "text-destructive" : "text-muted-foreground"}`}>
                          {isExpired ? "Expired" : "Expires"} {format(new Date(doc.expiry_date), "dd MMM yyyy")}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAttachDialogOpen(false)}>Skip</Button>
            <Button onClick={handleAttachDocs} disabled={attaching || selectedDocIds.size === 0}>
              {attaching ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Attaching…</> : `Attach ${selectedDocIds.size > 0 ? selectedDocIds.size : ""} Document${selectedDocIds.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
