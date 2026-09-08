import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, FilePlus2, Loader2, Plus, Trash2, ShieldCheck, AlertTriangle, Save,
} from "lucide-react";
import {
  ContractClause, ContractTemplate, MERGE_FIELDS, STARTER_CLAUSES,
} from "@/lib/contractTemplates";
import { formatDate } from "@/lib/dateFormat";

const MAX_BYTES = 20 * 1024 * 1024;

export default function ContractTemplates() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [approving, setApproving] = useState<ContractTemplate | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("contract_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setTemplates((data || []) as any);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const createStarter = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("contract_templates").insert({
      name: "Maintenance agreement (example wording)",
      description: "Example wording — have your own terms reviewed before approving.",
      clauses: STARTER_CLAUSES as any,
      source: "starter",
      is_starter: true,
      created_by: user.id,
    } as any).select("*").single();
    if (error || !data) { toast.error(error?.message || "Could not create the template"); return; }
    toast.success("Example skeleton created as a draft");
    setTemplates((t) => [data as any, ...t]);
    setEditing(data as any);
  };

  const onFile = async (file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".docx", ".pdf"].includes(ext)) { toast.error("Please upload a .docx or .pdf"); return; }
    if (file.size > MAX_BYTES) { toast.error("File is larger than 20 MB"); return; }
    if (!user) return;
    setImporting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("parse-contract-document", {
        body: { file_base64: base64, file_name: file.name },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const clauses: ContractClause[] = Array.isArray((data as any)?.clauses) ? (data as any).clauses : [];
      if (clauses.length === 0) throw new Error("No wording could be read from that file.");

      const { data: created, error: insErr } = await supabase.from("contract_templates").insert({
        name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Imported contract",
        description: `Imported from ${file.name} — wording kept exactly as supplied.`,
        clauses: clauses as any,
        source: "import",
        source_file: file.name,
        created_by: user.id,
      } as any).select("*").single();
      if (insErr || !created) throw new Error(insErr?.message || "Could not save the template");
      toast.success(`Imported ${clauses.length} sections as a draft`);
      setTemplates((t) => [created as any, ...t]);
      setEditing(created as any);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const remove = async (t: ContractTemplate) => {
    if (!confirm(`Delete "${t.name}"? Agreements already created keep their own copy of the wording.`)) return;
    const { error } = await supabase.from("contract_templates").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    setTemplates((list) => list.filter((x) => x.id !== t.id));
    toast.success("Template deleted");
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/agreements" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Agreements
          </Link>
          <h1 className="text-2xl font-bold">Contract templates</h1>
          <p className="text-sm text-muted-foreground">Your own agreement wording. Nothing is written for you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".docx,.pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Import your contract
          </Button>
          <Button variant="outline" onClick={createStarter}>
            <FilePlus2 className="mr-1.5 h-4 w-4" /> Start from example
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <p>
          Templates hold <strong>your</strong> wording. Imported documents are kept word for word, and the example
          skeleton is a starting point only — have your own terms reviewed. A template can't be used for a real
          agreement until someone in your company approves it.
        </p>
      </div>

      {templates.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          No templates yet. Import your existing agreement, or start from the example.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  <StatusBadge status={t.status} />
                </div>
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {(t.clauses || []).length} sections · {t.source === "import" ? "imported" : t.source === "starter" ? "example skeleton" : "typed"}
                  {t.approved_at ? ` · approved ${formatDate(t.approved_at)} by ${t.approved_by_name || "—"}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)}>Edit wording</Button>
                  {t.status !== "approved" && (
                    <Button size="sm" onClick={() => setApproving(t)}>
                      <ShieldCheck className="mr-1.5 h-4 w-4" /> Approve for use
                    </Button>
                  )}
                  {t.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={async () => {
                      await supabase.from("contract_templates").update({ status: "draft", approved_at: null } as any).eq("id", t.id);
                      load();
                    }}>Withdraw approval</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <EditTemplateDialog
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {approving && (
        <ApproveDialog
          template={approving}
          onClose={() => setApproving(null)}
          onDone={() => { setApproving(null); load(); }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge>;
  if (status === "archived") return <Badge variant="secondary">Archived</Badge>;
  return <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">Draft — not usable yet</Badge>;
}

function EditTemplateDialog({ template, onClose, onSaved }: {
  template: ContractTemplate; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || "");
  const [clauses, setClauses] = useState<ContractClause[]>(
    Array.isArray(template.clauses) && template.clauses.length ? template.clauses : [{ heading: "", text: "" }]
  );
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<ContractClause>) =>
    setClauses((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setSaving(true);
    const cleaned = clauses.filter((c) => (c.heading || "").trim() || (c.text || "").trim());
    const { error } = await supabase.from("contract_templates").update({
      name: name.trim() || "Untitled template",
      description: description.trim() || null,
      clauses: cleaned as any,
      // Editing the wording puts the template back for review.
      status: "draft",
      approved_at: null,
    } as any).eq("id", template.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Wording saved — approve it when you're happy");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit contract wording</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {template.is_starter && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <strong>Example wording.</strong> Replace it with your own terms and have them reviewed before approving.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Template name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="font-medium mb-1">Fill-in-the-blank fields you can type into the wording:</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {MERGE_FIELDS.map((f) => (
                <span key={f.token}><code className="font-mono">{f.token}</code> — {f.describes}</span>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {clauses.map((c, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Section heading (optional)" value={c.heading}
                    onChange={(e) => update(i, { heading: e.target.value })} />
                  <Button size="sm" variant="ghost" onClick={() => setClauses((cl) => cl.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea rows={5} value={c.text} onChange={(e) => update(i, { text: e.target.value })} />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setClauses((c) => [...c, { heading: "", text: "" }])}>
              <Plus className="mr-1.5 h-4 w-4" /> Add section
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ template, onClose, onDone }: {
  template: ContractTemplate; onClose: () => void; onDone: () => void;
}) {
  const { user } = useAuth();
  const [approver, setApprover] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const approve = async () => {
    if (!approver.trim() || !confirmed) { toast.error("Enter your name and confirm the wording has been reviewed"); return; }
    setSaving(true);
    const { error } = await supabase.from("contract_templates").update({
      status: "approved",
      approved_by: user?.id ?? null,
      approved_by_name: approver.trim(),
      approved_at: new Date().toISOString(),
      review_note: note.trim() || null,
    } as any).eq("id", template.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Template approved — you can now build agreements from it");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Approve "{template.name}"</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Approving confirms this is your company's own wording and that it has been reviewed by someone
            competent to do so. Only approved templates can be used for real agreements.
          </p>
          <div><Label>Your name</Label><Input value={approver} onChange={(e) => setApprover(e.target.value)} /></div>
          <div><Label>Review note (optional)</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I confirm this wording has been reviewed and is approved for use.</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={approve} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
