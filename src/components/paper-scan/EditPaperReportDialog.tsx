// Edit a converted paper report with the original scan alongside.
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, AlertTriangle, PenLine } from "lucide-react";
import ZoomPane from "@/components/ZoomPane";
import InlineSignaturePad from "@/components/InlineSignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { plainError } from "@/lib/plainError";
import { sheetDateProblem, paperDateText } from "@/lib/paperReportDate";
import { cleanUnmapped, paperScanPaths, savePaperReportEdit, type UnmappedItem } from "@/lib/paperReportEdit";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  responseId: string | null;
  jobId: string;
  /** Scroll to and highlight the riser picker (used by "Link to riser"). */
  focusRiser?: boolean;
  onSaved: () => void;
};

import { isRatingField, RATING_OPTIONS } from "@/lib/ratingFields";
const SKIP_TYPES = new Set(["date", "section", "heading", "info", "photo", "photos", "signature", "repeating_table", "image"]);
const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function choicesFor(f: any): string[] | null {
  if (isRatingField(f)) return RATING_OPTIONS;
  if (f.type === "checkbox") return ["yes", "no", "N/A"];
  if (f.type === "pass_fail") return ["pass", "fail", "N/A"];
  if (f.type === "select" && Array.isArray(f.options)) return f.options.map(String);
  return null;
}

export default function EditPaperReportDialog({ open, onOpenChange, responseId, jobId, focusRiser, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [fields, setFields] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [scanUrls, setScanUrls] = useState<string[]>([]);
  const [dateText, setDateText] = useState("");
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [siteId, setSiteId] = useState("");
  const [risers, setRisers] = useState<{ id: string; label: string }[]>([]);
  const [riserId, setRiserId] = useState("");
  const [engineer, setEngineer] = useState("");
  const [notes, setNotes] = useState("");
  const [unmapped, setUnmapped] = useState<UnmappedItem[]>([]);
  const [hasCustSig, setHasCustSig] = useState(false);
  const [sigAction, setSigAction] = useState<{ action: "keep" } | { action: "remove" } | { action: "add"; dataUrl: string }>({ action: "keep" });
  const [drawing, setDrawing] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    if (!open || !responseId) return;
    setLoading(true);
    setSigAction({ action: "keep" });
    setDrawing(false);
    (async () => {
      try {
        const { data: row, error } = await supabase.from("job_sheet_responses").select("template_id, responses").eq("id", responseId).single();
        if (error) throw error;
        const r = ((row as any).responses || {}) as Record<string, any>;
        const [{ data: tpl }, { data: job }, { data: cs }, { data: me }] = await Promise.all([
          supabase.from("job_sheet_templates").select("name, fields").eq("id", (row as any).template_id).single(),
          supabase.from("jobs").select("customer_id, site_id, asset_id").eq("id", jobId).single(),
          supabase.from("customers").select("id, name").order("name"),
          supabase.from("profiles").select("full_name").eq("user_id", user?.id || "").maybeSingle(),
        ]);
        setUserName((me as any)?.full_name || user?.email || "");
        setTemplateName((tpl as any)?.name || "");
        setFields(((tpl as any)?.fields || []).filter((f: any) => f?.id && !SKIP_TYPES.has(f.type)));
        setAnswers(r);
        setDateText(r._paper_completion_at ? paperDateText(String(r._paper_completion_at)) : String(r.date || ""));
        setCustomers((cs as any[]) || []);
        setCustomerId((job as any)?.customer_id || "");
        setSiteId((job as any)?.site_id || "");
        setRiserId(r.riser_asset_id || (job as any)?.asset_id || "");
        setEngineer(String(r.technician_name || r._paper_pdf_input?.header?.engineer || ""));
        setNotes(String(r.additional_notes ?? r._paper_pdf_input?.header?.additional_notes ?? ""));
        setUnmapped(cleanUnmapped(r._sheet_unmapped ?? r._paper_pdf_input?.header?.unmapped_items));
        setHasCustSig(!!r._paper_pdf_input?.manualCustomerSignaturePath);
        const urls: string[] = [];
        for (const p of paperScanPaths(r)) {
          const { data } = await supabase.storage.from("submissions").createSignedUrl(p, 900);
          if (data?.signedUrl) urls.push(data.signedUrl);
        }
        setScanUrls(urls);
      } catch (e: any) {
        toast({ title: "Couldn't open the report", description: plainError(e), variant: "destructive" });
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, responseId]);

  useEffect(() => {
    if (!open || !customerId) { setSites([]); return; }
    (supabase as any).from("sites").select("id, name").eq("customer_id", customerId).is("deleted_at", null).order("name")
      .then(({ data }: any) => setSites(data || []));
  }, [open, customerId]);

  useEffect(() => {
    if (!open || !siteId) { setRisers([]); return; }
    (supabase as any).from("assets").select("id, asset_type, riser_location, asset_tag").eq("site_id", siteId).in("asset_type", ["Dry Riser", "Wet Riser"])
      .then(({ data }: any) => setRisers((data || []).map((a: any) => ({ id: a.id, label: `${a.asset_type}${a.riser_location ? ` — ${a.riser_location}` : ""}${a.asset_tag ? ` (${a.asset_tag})` : ""}` }))));
  }, [open, siteId]);

  useEffect(() => {
    if (open && focusRiser && !loading) setTimeout(() => document.getElementById("edit-paper-riser")?.scrollIntoView({ block: "center" }), 200);
  }, [open, focusRiser, loading]);

  const dateProblem = useMemo(() => sheetDateProblem(dateText) || (!dateText.trim() ? "Enter the date written on the sheet (dd/mm/yyyy)." : null), [dateText]);

  const save = async () => {
    if (!user || !responseId) return;
    if (dateProblem) { toast({ title: "Check the date", description: dateProblem, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const fieldAnswers: Record<string, any> = {};
      for (const f of fields) fieldAnswers[f.id] = answers[f.id] ?? null;
      await savePaperReportEdit({
        responseId, jobId, userId: user.id, userName, answers: fieldAnswers, dateText,
        customerId: customerId || null, siteId: siteId || null, riserId: riserId || null,
        engineerName: engineer, additionalNotes: notes, unmapped, customerSignature: sigAction,
      });
      toast({ title: "Report updated", description: "The PDF has been rebuilt. The original scan is still attached." });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Couldn't save the report", description: plainError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setA = (id: string, v: any) => setAnswers((a) => ({ ...a, [id]: v }));
  const sigShown = sigAction.action === "add" || (sigAction.action === "keep" && hasCustSig);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit report{templateName ? ` — ${templateName}` : ""}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />Loading…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 overflow-hidden">
            <div className="border rounded-md bg-muted/20 min-h-[240px] flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b text-xs font-medium">Original scan</div>
              {scanUrls.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">No scan pages attached.</div>
              ) : (
                <ZoomPane className="flex-1 min-h-0">
                  <div className="p-2 space-y-3">{scanUrls.map((u, i) => <img key={i} src={u} alt={`Scan page ${i + 1}`} className="w-full rounded border bg-background" draggable={false} />)}</div>
                </ZoomPane>
              )}
            </div>
            <div className="overflow-y-auto pr-1 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Date on the sheet</Label>
                  <Input value={dateText} onChange={(e) => setDateText(e.target.value)} placeholder="dd/mm/yyyy" />
                  {dateProblem && <p className="text-xs text-destructive mt-1">{dateProblem}</p>}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Engineer name</Label>
                  <Input value={engineer} onChange={(e) => setEngineer(e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Customer</Label>
                  <select className={sel} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setSiteId(""); setRiserId(""); }}>
                    <option value="">— Choose —</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Site</Label>
                  <select className={sel} value={siteId} onChange={(e) => { setSiteId(e.target.value); setRiserId(""); }}>
                    <option value="">— Choose —</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    {siteId && !sites.some((s) => s.id === siteId) && <option value={siteId}>Current site</option>}
                  </select>
                </div>
                <div id="edit-paper-riser" className={`col-span-2 rounded-md ${focusRiser && !riserId ? "ring-2 ring-primary p-2" : ""}`}>
                  <Label className="text-xs">Riser record</Label>
                  <select className={sel} value={riserId} onChange={(e) => setRiserId(e.target.value)}>
                    <option value="">Not linked to a riser</option>
                    {risers.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  {siteId && risers.length === 0 && <p className="text-xs text-muted-foreground mt-1">This site has no riser records yet. Add one on the site page, then link it here.</p>}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Answers</div>
                {fields.map((f) => {
                  const v = answers[f.id];
                  const choices = choicesFor(f);
                  const val = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
                  return (
                    <div key={f.id}>
                      <Label className="text-xs">{f.label}</Label>
                      {choices ? (
                        <select className={sel} value={val} onChange={(e) => setA(f.id, e.target.value || null)}>
                          <option value="">— Blank —</option>
                          {choices.map((c) => <option key={c} value={c}>{c}</option>)}
                          {val && !choices.some((c) => c.toLowerCase() === val.toLowerCase()) && <option value={val}>{val} (as written)</option>}
                        </select>
                      ) : f.type === "textarea" || val.includes("\n") ? (
                        <Textarea rows={2} value={val} onChange={(e) => setA(f.id, e.target.value)} />
                      ) : (
                        <Input type={f.type === "number" ? "number" : "text"} value={val} onChange={(e) => setA(f.id, f.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <Label className="text-xs">Additional notes</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="rounded border p-3 space-y-2">
                <div className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-primary" /> On the sheet but not on this template</div>
                <p className="text-xs text-muted-foreground">Printed on the report under "Also on the paper sheet".</p>
                {unmapped.map((u, i) => (
                  <div key={i} className="flex gap-2">
                    <Input className="flex-[2]" value={u.label} onChange={(e) => setUnmapped((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Question" />
                    <Input className="flex-1" value={u.value || ""} onChange={(e) => setUnmapped((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Answer" />
                    <Button size="icon" variant="ghost" onClick={() => setUnmapped((l) => l.filter((_, j) => j !== i))} aria-label="Remove item"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setUnmapped((l) => [...l, { label: "", value: "" }])}><Plus className="h-3.5 w-3.5 mr-1" />Add item</Button>
              </div>

              <div className="rounded border p-3 space-y-2">
                <div className="text-sm font-medium">Customer signature</div>
                {drawing ? (
                  <InlineSignaturePad onCancel={() => setDrawing(false)} onCapture={(dataUrl) => { setSigAction({ action: "add", dataUrl }); setDrawing(false); }} />
                ) : (
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span>{sigShown ? (sigAction.action === "add" ? "New signature will be added." : "Signature on the report.") : "No customer signature on the report."}</span>
                    <Button size="sm" variant="outline" onClick={() => setDrawing(true)}><PenLine className="h-3.5 w-3.5 mr-1" />{sigShown ? "Replace" : "Add signature"}</Button>
                    {sigShown && <Button size="sm" variant="outline" onClick={() => setSigAction({ action: "remove" })}><Trash2 className="h-3.5 w-3.5 mr-1" />Remove</Button>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save and rebuild PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
