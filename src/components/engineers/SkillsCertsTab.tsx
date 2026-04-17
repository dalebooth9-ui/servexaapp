import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Loader2, FileText, Download, Trash2, Upload, X, ShieldCheck, AlertTriangle, ShieldAlert, ShieldX } from "lucide-react";
import { CERTIFICATION_TYPES, ISSUING_BODIES, certTypeLabel, getCertStatus, statusLabel, type CertStatus } from "@/lib/certStatus";

type CertDoc = {
  id: string;
  title: string;
  file_name: string;
  file_url: string;
  document_type: string;
  certification_type: string | null;
  issuing_body: string | null;
  certificate_number: string | null;
  date_obtained: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<CertStatus, { badge: string; icon: any }> = {
  valid: { badge: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400", icon: ShieldCheck },
  expiring_soon: { badge: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400", icon: AlertTriangle },
  expired: { badge: "bg-destructive/15 text-destructive border-destructive/30", icon: ShieldX },
  no_expiry: { badge: "bg-muted text-muted-foreground border-border", icon: ShieldAlert },
};

interface Props {
  engineerId: string;
  engineerName: string;
}

export default function SkillsCertsTab({ engineerId, engineerName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<CertDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    title: "",
    document_type: "certificate",
    certification_type: "fire_alarm",
    issuing_body: "",
    certificate_number: "",
    date_obtained: "",
    expiry_date: "",
    notes: "",
  });

  const fetchDocs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("engineer_documents" as any)
      .select("*")
      .eq("engineer_id", engineerId)
      .order("created_at", { ascending: false });
    setDocs((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [engineerId]);

  const handleSave = async () => {
    if (pendingFiles.length === 0) {
      toast({ title: "Select at least one file", variant: "destructive" });
      return;
    }
    setSaving(true);
    let inserted = 0;
    for (const file of pendingFiles) {
      const filePath = `${engineerId}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("engineer-documents").upload(filePath, file);
      if (up.error) {
        toast({ title: `Upload failed: ${file.name}`, description: up.error.message, variant: "destructive" });
        continue;
      }
      const { error } = await supabase.from("engineer_documents" as any).insert({
        engineer_id: engineerId,
        uploaded_by: user?.id,
        file_name: file.name,
        file_url: filePath,
        file_size: file.size,
        title: form.title || file.name.replace(/\.[^.]+$/, ""),
        document_type: form.document_type,
        certification_type: form.certification_type || null,
        issuing_body: form.issuing_body || null,
        certificate_number: form.certificate_number || null,
        date_obtained: form.date_obtained || null,
        expiry_date: form.expiry_date || null,
        notes: form.notes || null,
      });
      if (!error) inserted++;
    }
    setSaving(false);
    if (inserted > 0) {
      toast({ title: `${inserted} certification${inserted > 1 ? "s" : ""} added` });
      setAddOpen(false);
      setPendingFiles([]);
      setForm({ title: "", document_type: "certificate", certification_type: "fire_alarm", issuing_body: "", certificate_number: "", date_obtained: "", expiry_date: "", notes: "" });
      fetchDocs();
    }
  };

  const handleDownload = async (d: CertDoc) => {
    const { data } = await supabase.storage.from("engineer-documents").createSignedUrl(d.file_url, 3600);
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

  const handleDelete = async (d: CertDoc) => {
    await supabase.storage.from("engineer-documents").remove([d.file_url]);
    await supabase.from("engineer_documents" as any).delete().eq("id", d.id);
    setDocs((p) => p.filter((x) => x.id !== d.id));
    toast({ title: "Certification deleted" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{engineerName}</p>
          <p className="text-xs text-muted-foreground">{docs.length} certification{docs.length !== 1 ? "s" : ""} on file</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Certification
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
          <ShieldCheck className="mx-auto h-8 w-8 opacity-30" />
          <p className="mt-2 text-sm">No certifications yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {docs.map((d) => {
            const status = getCertStatus(d.expiry_date);
            const styles = STATUS_STYLE[status];
            const Icon = styles.icon;
            return (
              <Card key={d.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{d.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {certTypeLabel(d.certification_type)}
                        {d.issuing_body && <> · <span className="font-medium">{d.issuing_body}</span></>}
                      </p>
                    </div>
                    <Badge variant="outline" className={`gap-1 shrink-0 ${styles.badge}`}>
                      <Icon className="h-3 w-3" />{statusLabel(status)}
                    </Badge>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    {d.certificate_number && (<><dt className="text-muted-foreground">Cert no.</dt><dd className="truncate font-medium">{d.certificate_number}</dd></>)}
                    {d.date_obtained && (<><dt className="text-muted-foreground">Obtained</dt><dd>{format(new Date(d.date_obtained), "dd MMM yyyy")}</dd></>)}
                    {d.expiry_date && (<><dt className="text-muted-foreground">Expires</dt><dd className={status === "expired" ? "text-destructive font-medium" : status === "expiring_soon" ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>{format(new Date(d.expiry_date), "dd MMM yyyy")}</dd></>)}
                  </dl>

                  <div className="mt-3 flex items-center gap-1 border-t pt-2">
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleDownload(d)}>
                      <Download className="h-3.5 w-3.5" /> Scan
                    </Button>
                    <span className="ml-auto truncate text-[11px] text-muted-foreground"><FileText className="mr-1 inline h-3 w-3" />{d.file_name}</span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete certification</AlertDialogTitle>
                          <AlertDialogDescription>Permanently delete "{d.title}"?</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(d)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Certification Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setPendingFiles([]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Certification</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. FIA Fire Alarm Foundation" />
            </div>
            <div className="space-y-1.5">
              <Label>Certification type</Label>
              <Select value={form.certification_type} onValueChange={(v) => setForm((f) => ({ ...f, certification_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CERTIFICATION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Issuing body</Label>
              <Select value={form.issuing_body || "__none"} onValueChange={(v) => setForm((f) => ({ ...f, issuing_body: v === "__none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {ISSUING_BODIES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Certificate number</Label>
              <Input value={form.certificate_number} onChange={(e) => setForm((f) => ({ ...f, certificate_number: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={form.document_type} onValueChange={(v) => setForm((f) => ({ ...f, document_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["certificate", "id", "training", "insurance", "dbs", "first_aid", "other"].map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date obtained</Label>
              <Input type="date" value={form.date_obtained} onChange={(e) => setForm((f) => ({ ...f, date_obtained: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry date</Label>
              <Input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Files *</Label>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => setPendingFiles(Array.from(e.target.files || []))} />
              {pendingFiles.length > 0 ? (
                <div className="space-y-1.5 rounded-md border p-2">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="mt-1 w-full text-xs" onClick={() => fileRef.current?.click()}>
                    <Plus className="mr-1 h-3 w-3" /> Add more
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Choose files
                </Button>
              )}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setPendingFiles([]); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
