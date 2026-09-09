import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, Minus, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateFormat";

/**
 * Compliance record — a pure view over evidence that already exists on the job.
 * Nothing is stored or invented here: every line is a live, RLS-scoped read.
 * The completeness score counts only the items this job SHOULD have.
 */

type Item = {
  key: string;
  label: string;
  state: "yes" | "no" | "na";
  detail?: string | null;
};

function StateIcon({ state }: { state: Item["state"] }) {
  if (state === "yes") return <Check className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (state === "no") return <X className="h-4 w-4 shrink-0 text-destructive" />;
  return <Minus className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export default function ComplianceRecord({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [links, setLinks] = useState<{ quotes: any[]; invoices: any[] }>({ quotes: [], invoices: [] });
  const [amendments, setAmendments] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setItems(null);

      const [
        jobRes,
        assignRes,
        sheetRes,
        sigRes,
        defectRes,
        emailRes,
        docRes,
        ramsDocRes,
        ramsRes,
        signoffRes,
        subRes,
        checklistRes,
      ] = await Promise.all([
        supabase.from("jobs").select("id, status, completed_at").eq("id", jobId).maybeSingle(),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_sheet_responses").select("id, status, submitted_at, template_id, last_amended_at").eq("job_id", jobId),
        supabase.from("job_signatures").select("id, signer_role, signer_name, created_at").eq("job_id", jobId),
        supabase.from("defects").select("id, title, severity, resolved_at").eq("job_id", jobId),
        supabase.from("job_emails").select("id, subject, received_at, created_at").eq("job_id", jobId).eq("direction", "outbound"),
        supabase.from("invoices").select("id, invoice_number, document_type, status, total").eq("job_id", jobId),
        supabase.from("rams_documents").select("id").eq("job_id", jobId),
        supabase.from("rams").select("id").eq("job_id", jobId),
        supabase.from("rams_signoffs").select("id, engineer_name, signed_at").eq("job_id", jobId),
        supabase.from("submissions").select("id", { count: "exact", head: true }).eq("job_id", jobId).eq("type", "photo"),
        supabase
          .from("job_photo_checklist_responses")
          .select("photo_url, before_photo_url, after_photo_url")
          .eq("job_id", jobId),
      ]);

      // Engineer names
      const engineerIds = (assignRes.data || []).map((a: any) => a.engineer_id).filter(Boolean);
      let engineerNames: string[] = [];
      if (engineerIds.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engineerIds);
        engineerNames = (profs || []).map((p: any) => p.full_name).filter(Boolean);
      }

      // Amendments
      const responseIds = (sheetRes.data || []).map((r: any) => r.id);
      let edits: any[] = [];
      if (responseIds.length) {
        const { data } = await supabase
          .from("job_sheet_response_edits")
          .select("id, field_label, old_value, new_value, edited_at")
          .in("response_id", responseIds)
          .order("edited_at", { ascending: false })
          .limit(20);
        edits = data || [];
      }

      if (cancelled) return;

      const job: any = jobRes.data || {};
      const sheets = sheetRes.data || [];
      const submitted = sheets.filter((r: any) => !!r.submitted_at || r.status === "submitted" || r.status === "approved");
      const sigs = sigRes.data || [];
      const role = (s: any) => (s.signer_role || "").toLowerCase();
      const engineerSig = sigs.find((s) => role(s).includes("engineer") || role(s).includes("operative"));
      const customerSig = sigs.find((s) => role(s).includes("customer") || role(s).includes("client"));

      let photoCount = subRes.count || 0;
      for (const c of checklistRes.data || []) {
        if ((c as any).photo_url) photoCount++;
        if ((c as any).before_photo_url) photoCount++;
        if ((c as any).after_photo_url) photoCount++;
      }

      const ramsAttached = (ramsDocRes.data || []).length + (ramsRes.data || []).length;
      const signoffs = signoffRes.data || [];
      const defects = defectRes.data || [];
      const emails = emailRes.data || [];
      const docs = docRes.data || [];
      const quotes = docs.filter((d: any) => d.document_type === "quote");
      const invoices = docs.filter((d: any) => d.document_type === "invoice");

      setLinks({ quotes, invoices });
      setAmendments(edits);

      setItems([
        {
          key: "engineer",
          label: "Engineer recorded",
          state: engineerNames.length ? "yes" : "no",
          detail: engineerNames.join(", ") || "No engineer assigned",
        },
        {
          key: "completed",
          label: "Completion date",
          state: job.completed_at ? "yes" : "no",
          detail: job.completed_at ? formatDate(job.completed_at) : "Not recorded",
        },
        {
          key: "report",
          label: "Report submitted",
          state: submitted.length ? "yes" : "no",
          detail: submitted.length ? `${submitted.length} report${submitted.length === 1 ? "" : "s"} submitted` : "No submitted report",
        },
        {
          key: "engsig",
          label: "Engineer signature",
          state: engineerSig ? "yes" : "no",
          detail: engineerSig ? engineerSig.signer_name || "Signed" : "Missing",
        },
        {
          key: "custsig",
          label: "Customer signature",
          state: customerSig ? "yes" : "no",
          detail: customerSig ? customerSig.signer_name || "Signed" : "Missing",
        },
        {
          key: "photos",
          label: "Photo evidence",
          state: photoCount > 0 ? "yes" : "no",
          detail: `${photoCount} photo${photoCount === 1 ? "" : "s"}`,
        },
        {
          key: "rams",
          label: "RAMS acknowledged",
          state: ramsAttached === 0 ? "na" : signoffs.length ? "yes" : "no",
          detail:
            ramsAttached === 0
              ? "No RAMS attached to this job"
              : signoffs.length
                ? `${signoffs.length} of ${ramsAttached} acknowledged`
                : `${ramsAttached} attached, not acknowledged`,
        },
        {
          key: "sent",
          label: "Sent to customer",
          state: emails.length ? "yes" : "no",
          detail: emails.length ? `${emails.length} email${emails.length === 1 ? "" : "s"} sent` : "Not sent yet",
        },
        {
          key: "defects",
          label: "Defects raised",
          state: defects.length === 0 ? "na" : "yes",
          detail:
            defects.length === 0
              ? "None raised on this visit"
              : `${defects.length} raised · ${defects.filter((d: any) => !d.resolved_at).length} still open`,
        },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (!items) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compliance record</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const scored = items.filter((i) => i.state !== "na");
  const have = scored.filter((i) => i.state === "yes").length;
  const missing = scored.filter((i) => i.state === "no").map((i) => i.label.toLowerCase());
  const complete = missing.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ShieldCheck className={cn("h-4 w-4", complete ? "text-emerald-600" : "text-amber-600")} />
          Compliance record
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-semibold",
              complete ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-amber-500/40 bg-amber-500/10 text-amber-700",
            )}
          >
            {have}/{scored.length} evidence items
          </span>
        </CardTitle>
        {!complete && (
          <p className="text-xs text-muted-foreground">Missing: {missing.join(", ")}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.key} className="flex items-start gap-2 text-sm">
              <StateIcon state={i.state} />
              <span className="min-w-0">
                <span className="font-medium">{i.label}</span>
                {i.detail && <span className="block text-xs text-muted-foreground">{i.detail}</span>}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 border-t pt-3 text-sm">
          {links.quotes.length === 0 && links.invoices.length === 0 ? (
            <span className="text-muted-foreground">No quote or invoice linked to this job.</span>
          ) : (
            <>
              {links.quotes.map((q: any) => (
                <Link key={q.id} to="/quotes" className="rounded border px-2 py-1 text-xs hover:border-primary/60">
                  Quote {q.invoice_number} · {q.status}
                </Link>
              ))}
              {links.invoices.map((v: any) => (
                <Link key={v.id} to="/invoices" className="rounded border px-2 py-1 text-xs hover:border-primary/60">
                  Invoice {v.invoice_number} · {v.status}
                </Link>
              ))}
            </>
          )}
        </div>

        <div className="border-t pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amendments</p>
          {amendments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes made after submission.</p>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {amendments.map((a: any) => (
                <li key={a.id}>
                  <span className="font-medium text-foreground">{a.field_label || "Field"}</span> changed{" "}
                  {a.edited_at ? `on ${formatDate(a.edited_at)}` : ""} — “{String(a.old_value ?? "").slice(0, 40)}” → “
                  {String(a.new_value ?? "").slice(0, 40)}”
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
