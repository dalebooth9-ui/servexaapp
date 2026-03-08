import { useEffect, useState, useRef } from "react";
import ProfileSignatureCapture from "@/components/ProfileSignatureCapture";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Phone, Pencil, Plus, UserMinus, ArrowLeft, KeyRound, FileText, Upload, Trash2, Download, X, Loader2, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUndoAction } from "@/hooks/useUndoAction";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import TableSkeleton from "@/components/TableSkeleton";

const DOC_TYPES = ["certificate", "id", "training", "insurance", "dbs", "first_aid", "other"];

type EngineerDoc = {
  id: string;
  title: string;
  file_name: string;
  file_url: string;
  document_type: string;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
};

export default function Engineers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [engineers, setEngineers] = useState<any[]>([]);
  const [engLoading, setEngLoading] = useState(true);
  const [editEng, setEditEng] = useState<any | null>(null);
  const [form, setForm] = useState({ full_name: "", phone: "", whatsapp_number: "" });
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: "", email: "", phone: "", whatsapp_number: "", send_reset_email: true });
  const [adding, setAdding] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [onboardingEng, setOnboardingEng] = useState<any | null>(null);
  const [onboardingEmail, setOnboardingEmail] = useState("");
  const [sendingOnboarding, setSendingOnboarding] = useState(false);
  const [onboardingLogs, setOnboardingLogs] = useState<Record<string, { sent_to_email: string; sent_at: string }>>({});
  const { toast } = useToast();
  const { deleteWithUndo, editWithUndo } = useUndoAction();

  // Documents state
  const [docsEng, setDocsEng] = useState<any | null>(null);
  const [docs, setDocs] = useState<EngineerDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({ title: "", document_type: "certificate", expiry_date: "", notes: "" });
  const [pendingDocFiles, setPendingDocFiles] = useState<File[]>([]);
  const docFileRef = useRef<HTMLInputElement>(null);

  const handleSendOnboarding = async () => {
    if (!onboardingEng || !onboardingEmail) return;
    setSendingOnboarding(true);
    const { data, error } = await supabase.functions.invoke("send-engineer-onboarding", {
      body: { to_email: onboardingEmail, engineer_name: onboardingEng.full_name, engineer_user_id: onboardingEng.user_id },
    });
    setSendingOnboarding(false);
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || "Failed to send onboarding email.", variant: "destructive" });
    } else {
      toast({ title: "Onboarding email sent", description: `Install link sent to ${onboardingEmail}.` });
      // Update local log state immediately
      setOnboardingLogs((prev) => ({
        ...prev,
        [onboardingEng.user_id]: { sent_to_email: onboardingEmail, sent_at: new Date().toISOString() },
      }));
      setOnboardingEng(null);
      setOnboardingEmail("");
    }
  };

  const handleSendReset = async (eng: any) => {
    setResettingId(eng.id);
    const { data, error } = await supabase.functions.invoke("send-password-reset", {
      body: { user_id: eng.user_id, full_name: eng.full_name },
    });
    setResettingId(null);
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || "Failed to send reset email.", variant: "destructive" });
    } else {
      toast({ title: "Email sent", description: `Password reset email sent to ${eng.full_name}.` });
    }
  };

  const fetchEngineers = async () => {
    setEngLoading(true);
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "engineer");
    if (!roles || roles.length === 0) { setEngineers([]); setEngLoading(false); return; }
    const userIds = roles.map((r) => r.user_id);
    const [{ data: profiles }, { data: assignments }, { data: logs }] = await Promise.all([
      supabase.from("profiles").select("*").in("user_id", userIds),
      supabase.from("job_assignments").select("engineer_id, job_id").in("engineer_id", userIds),
      supabase.from("engineer_onboarding_logs" as any).select("engineer_user_id, sent_to_email, sent_at").in("engineer_user_id", userIds).order("sent_at", { ascending: false }),
    ]);
    const counts: Record<string, number> = {};
    (assignments || []).forEach((a) => { counts[a.engineer_id] = (counts[a.engineer_id] || 0) + 1; });
    // Keep only the most recent log per engineer
    const logMap: Record<string, { sent_to_email: string; sent_at: string }> = {};
    ((logs as any) || []).forEach((l: any) => {
      if (!logMap[l.engineer_user_id]) logMap[l.engineer_user_id] = { sent_to_email: l.sent_to_email, sent_at: l.sent_at };
    });
    setOnboardingLogs(logMap);
    setEngineers((profiles || []).map((p) => ({ ...p, job_count: counts[p.user_id] || 0 })));
    setEngLoading(false);
  };

  useEffect(() => { fetchEngineers(); }, []);

  const openEdit = (eng: any) => {
    setEditEng(eng);
    setForm({ full_name: eng.full_name || "", phone: eng.phone || "", whatsapp_number: eng.whatsapp_number || "" });
  };

  const handleSave = async () => {
    if (!editEng) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: form.full_name, phone: form.phone || null, whatsapp_number: form.whatsapp_number || null,
    }).eq("id", editEng.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Failed to update engineer.", variant: "destructive" });
    } else {
      const oldValues = { full_name: editEng.full_name, phone: editEng.phone || null, whatsapp_number: editEng.whatsapp_number || null };
      const engId = editEng.id;
      setEditEng(null);
      fetchEngineers();
      editWithUndo({ label: "Engineer updated", onUndo: async () => { await supabase.from("profiles").update(oldValues).eq("id", engId); fetchEngineers(); } });
    }
  };

  const handleDeactivate = async (eng: any) => {
    setEngineers((prev) => prev.filter((e) => e.id !== eng.id));
    deleteWithUndo({
      key: eng.user_id, label: `${eng.full_name} deactivated`,
      onConfirm: async () => {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", eng.user_id).eq("role", "engineer");
        if (error) { toast({ title: "Error", description: "Failed to deactivate engineer.", variant: "destructive" }); fetchEngineers(); }
      },
      onUndo: () => fetchEngineers(),
    });
  };

  const handleAddEngineer = async () => {
    if (!addForm.email || !addForm.full_name) {
      toast({ title: "Error", description: "Name and email are required.", variant: "destructive" }); return;
    }
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("create-engineer", { body: addForm });
    setAdding(false);
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || "Failed to create engineer.", variant: "destructive" });
    } else {
      toast({ title: "Engineer added", description: `${addForm.full_name} has been created.${data?.email_sent ? " Password reset email sent." : ""}` });
      setAddOpen(false);
      setAddForm({ full_name: "", email: "", phone: "", whatsapp_number: "", send_reset_email: true });
      fetchEngineers();
    }
  };

  // Documents
  const openDocs = async (eng: any) => {
    setDocsEng(eng);
    setDocsLoading(true);
    const { data } = await supabase.from("engineer_documents" as any).select("*").eq("engineer_id", eng.user_id).order("created_at", { ascending: false });
    setDocs((data as any) || []);
    setDocsLoading(false);
  };

  const handleAddDoc = async () => {
    if (pendingDocFiles.length === 0) {
      toast({ title: "Error", description: "Please select at least one file.", variant: "destructive" }); return;
    }
    setUploadingDoc(true);
    let uploaded = 0;
    for (const file of pendingDocFiles) {
      const filePath = `${docsEng.user_id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("engineer-documents").upload(filePath, file);
      if (uploadError) {
        toast({ title: "Upload failed", description: `${file.name}: ${uploadError.message}`, variant: "destructive" });
        continue;
      }
      const { error: insertError } = await supabase.from("engineer_documents" as any).insert({
        engineer_id: docsEng.user_id,
        uploaded_by: user?.id,
        file_name: file.name,
        file_url: filePath,
        file_size: file.size,
        title: docForm.title || file.name.replace(/\.[^.]+$/, ""),
        document_type: docForm.document_type,
        expiry_date: docForm.expiry_date || null,
        notes: docForm.notes || null,
      });
      if (!insertError) uploaded++;
    }
    setUploadingDoc(false);
    if (uploaded > 0) {
      toast({ title: `${uploaded} document${uploaded > 1 ? "s" : ""} added` });
      setAddDocOpen(false);
      setDocForm({ title: "", document_type: "certificate", expiry_date: "", notes: "" });
      setPendingDocFiles([]);
      openDocs(docsEng);
    }
  };

  const handleDeleteDoc = async (doc: EngineerDoc) => {
    await supabase.storage.from("engineer-documents").remove([doc.file_url]);
    await supabase.from("engineer_documents" as any).delete().eq("id", doc.id);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    toast({ title: "Document deleted" });
  };

  const handleDownloadDoc = async (doc: EngineerDoc) => {
    const { data } = await supabase.storage.from("engineer-documents").createSignedUrl(doc.file_url, 3600);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Engineers</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Engineer
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {engLoading ? (
            <div className="p-4"><TableSkeleton rows={5} cols={5} showHeader={false} /></div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Assigned Jobs</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {engineers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No engineers found. Users need to be assigned the engineer role.
                  </TableCell>
                </TableRow>
              ) : (
                engineers.map((eng) => (
                  <TableRow key={eng.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{eng.full_name || "—"}</span>
                        {onboardingLogs[eng.user_id] && (
                          <Badge variant="secondary" className="text-[10px] gap-1 text-primary border-primary/30 bg-primary/10">
                            <Mail className="h-2.5 w-2.5" /> Onboarding sent
                          </Badge>
                        )}
                      </div>
                      {onboardingLogs[eng.user_id] && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {onboardingLogs[eng.user_id].sent_to_email} · {new Date(onboardingLogs[eng.user_id].sent_at).toLocaleDateString()}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {eng.whatsapp_number ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Phone className="h-3.5 w-3.5 text-accent" />{eng.whatsapp_number}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{eng.phone || "—"}</TableCell>
                    <TableCell className="text-right"><Badge variant="secondary">{eng.job_count}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" title="Certification documents" onClick={() => openDocs(eng)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Send onboarding email"
                          onClick={() => { setOnboardingEng(eng); setOnboardingEmail(""); }}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Send password reset email" disabled={resettingId === eng.id}>
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Send Password Reset</AlertDialogTitle>
                              <AlertDialogDescription>This will send a password reset email to {eng.full_name}. Are you sure?</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleSendReset(eng)}>Send Email</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(eng)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Deactivate Engineer</AlertDialogTitle>
                              <AlertDialogDescription>This will remove the engineer role from {eng.full_name}. They will no longer have access to assigned jobs. This does not delete their account.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeactivate(eng)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Deactivate</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Engineer Dialog */}
      <Dialog open={!!editEng} onOpenChange={(open) => { if (!open) setEditEng(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Engineer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input id="edit-name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+44..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-wa">WhatsApp Number</Label>
              <Input id="edit-wa" value={form.whatsapp_number} onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))} placeholder="+44..." />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Digital Signature</Label>
              {editEng && <ProfileSignatureCapture userId={editEng.user_id} />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEng(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Engineer Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Engineer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-name">Full Name *</Label>
              <Input id="add-name" value={addForm.full_name} onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email *</Label>
              <Input id="add-email" type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-phone">Phone</Label>
              <Input id="add-phone" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+44..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-wa">WhatsApp Number</Label>
              <Input id="add-wa" value={addForm.whatsapp_number} onChange={(e) => setAddForm((f) => ({ ...f, whatsapp_number: e.target.value }))} placeholder="+44..." />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="add-reset" checked={addForm.send_reset_email} onCheckedChange={(checked) => setAddForm((f) => ({ ...f, send_reset_email: !!checked }))} />
              <Label htmlFor="add-reset" className="text-sm font-normal">Send password setup email to engineer</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEngineer} disabled={adding}>{adding ? "Adding…" : "Add Engineer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Documents Dialog */}
      <Dialog open={!!docsEng} onOpenChange={(open) => { if (!open) { setDocsEng(null); setDocs([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {docsEng?.full_name} — Certification Documents
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddDocOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add Document
              </Button>
            </div>

            {docsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : docs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No documents uploaded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((doc) => {
                    const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                    const isExpiringSoon = doc.expiry_date && !isExpired && new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="font-medium">{doc.title}</div>
                          <div className="text-xs text-muted-foreground">{doc.file_name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{doc.document_type.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell>
                          {doc.expiry_date ? (
                            <span className={isExpired ? "text-destructive font-medium" : isExpiringSoon ? "text-amber-500 font-medium" : ""}>
                              {format(new Date(doc.expiry_date), "dd MMM yyyy")}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleDownloadDoc(doc)}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                  <AlertDialogDescription>Permanently delete "{doc.title}"? This cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteDoc(doc)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Document Dialog */}
      <Dialog open={addDocOpen} onOpenChange={(open) => { if (!open) { setAddDocOpen(false); setPendingDocFiles([]); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Certification Documents</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title <span className="text-muted-foreground text-xs">(optional — defaults to filename)</span></Label>
              <Input value={docForm.title} onChange={(e) => setDocForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Gas Safe Certificate" />
            </div>
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={docForm.document_type} onValueChange={(v) => setDocForm((f) => ({ ...f, document_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expiry Date</Label>
              <Input type="date" value={docForm.expiry_date} onChange={(e) => setDocForm((f) => ({ ...f, expiry_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Files *</Label>
              <input ref={docFileRef} type="file" multiple className="hidden" onChange={(e) => setPendingDocFiles(Array.from(e.target.files || []))} />
              {pendingDocFiles.length > 0 ? (
                <div className="space-y-1.5 rounded-md border border-border p-2">
                  {pendingDocFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingDocFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="mt-1 w-full text-xs" onClick={() => docFileRef.current?.click()}>
                    <Plus className="mr-1 h-3 w-3" /> Add more files
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => docFileRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Choose Files
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={docForm.notes} onChange={(e) => setDocForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDocOpen(false); setPendingDocFiles([]); }}>Cancel</Button>
            <Button onClick={handleAddDoc} disabled={uploadingDoc}>
              {uploadingDoc ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : `Save ${pendingDocFiles.length > 1 ? `${pendingDocFiles.length} Documents` : "Document"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Onboarding Email Dialog */}
      <Dialog open={!!onboardingEng} onOpenChange={(open) => { if (!open) { setOnboardingEng(null); setOnboardingEmail(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Send Onboarding Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Send <strong>{onboardingEng?.full_name}</strong> the app install link with a QR code so they can add FieldReport to their home screen.
            </p>
            <div className="space-y-2">
              <Label htmlFor="onboarding-email">Engineer's Email *</Label>
              <Input
                id="onboarding-email"
                type="email"
                placeholder="engineer@example.com"
                value={onboardingEmail}
                onChange={(e) => setOnboardingEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOnboardingEng(null); setOnboardingEmail(""); }}>Cancel</Button>
            <Button onClick={handleSendOnboarding} disabled={sendingOnboarding || !onboardingEmail}>
              {sendingOnboarding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : "Send Install Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
