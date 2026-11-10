import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireCurrentOrgId } from "@/lib/tenantQueries";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { buildDurableRef, resolveToSignedUrl } from "@/lib/durableStorageRef";
import { DEFAULT_ENGINEER_PAGES } from "@/lib/engineerPages";
import { SETUP_STEPS, OPTIONAL_STEPS, EMPTY_SETUP, SetupData, stepErrors, fixLine } from "@/lib/companySetupWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const PROGRESS_KEY = "company_setup_wizard";
type Member = { full_name: string; email: string; role: "engineer" | "admin" };

function Img({ src, className }: { src: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; resolveToSignedUrl(src).then(u => on && setUrl(u || src)).catch(() => on && setUrl(src)); return () => { on = false; }; }, [src]);
  return url ? <img src={url} alt="" className={className} /> : null;
}

export default function CompanySetupWizard() {
  const nav = useNavigate();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const [d, setD] = useState<SetupData>(EMPTY_SETUP);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [newType, setNewType] = useState("");
  const [team, setTeam] = useState<Member[]>([]);
  const [member, setMember] = useState<Member>({ full_name: "", email: "", role: "engineer" });
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => { (async () => {
    const id = await requireCurrentOrgId(); setOrgId(id);
    const [org, brand, prog, cats, mail] = await Promise.all([
      supabase.from("organisations").select("name, logo_url, primary_color, office_email").eq("id", id).maybeSingle(),
      supabase.from("app_settings").select("value").eq("org_id", id).eq("key", "org_branding").maybeSingle(),
      supabase.from("app_settings").select("value").eq("org_id", id).eq("key", PROGRESS_KEY).maybeSingle(),
      supabase.from("job_categories").select("id, name").eq("org_id", id).order("sort_order"),
      supabase.from("email_branding").select("address, phone, reply_to, from_address, website").eq("org_id", id).maybeSingle(),
    ]);
    const eb: any = mail.data || {};
    const b: any = brand.data?.value || {}; const o: any = org.data || {}; const p: any = prog.data?.value || {};
    setD({
      company_name: b.company_name || o.name || "", address: b.address || eb.address || "", phone: b.phone || eb.phone || "", email: b.email || o.office_email || eb.reply_to || eb.from_address || "",
      website: b.website || eb.website || "", logo_url: o.logo_url || "", primary_color: o.primary_color || "",
      report_footer_text: b.report_footer_text || "", accreditation_logo_urls: Array.isArray(b.accreditation_logo_urls) ? b.accreditation_logo_urls : [],
    });
    if (typeof p.step === "number") setStep(Math.min(4, Math.max(0, p.step)));
    if (Array.isArray(p.done)) setDone(p.done);
    setTypes((cats.data as any) || []);
  })().catch(e => toast.error("Couldn't load your company details", { description: e.message })).finally(() => setLoading(false)); }, []);

  const set = <K extends keyof SetupData>(k: K, v: SetupData[K]) => {
    const next = { ...d, [k]: v }; setD(next);
    if (tried) setErrors(stepErrors(step, next));
  };

  const saveAll = async (nextStep: number, nextDone: number[], finished = false) => {
    if (!orgId) return false;
    const { data: cur } = await supabase.from("app_settings").select("value").eq("org_id", orgId).eq("key", "org_branding").maybeSingle();
    const branding = { ...((cur?.value as any) || {}), company_name: d.company_name.trim(), address: d.address.trim(), phone: d.phone.trim(), email: d.email.trim(), website: d.website.trim(), report_footer_text: d.report_footer_text.trim(), accreditation_logo_urls: d.accreditation_logo_urls };
    const results = await Promise.all([
      supabase.from("app_settings").upsert({ org_id: orgId, key: "org_branding", value: branding, updated_at: new Date().toISOString() } as any, { onConflict: "org_id,key" }),
      supabase.from("app_settings").upsert({ org_id: orgId, key: PROGRESS_KEY, value: { step: nextStep, done: nextDone, finished }, updated_at: new Date().toISOString() } as any, { onConflict: "org_id,key" }),
      supabase.from("organisations").update({ name: d.company_name.trim() || undefined, logo_url: d.logo_url || null, primary_color: d.primary_color || null } as any).eq("id", orgId),
    ]);
    const err = results.find(r => r.error)?.error;
    if (err) { toast.error("Couldn't save this step", { description: "Only company admins can change company setup." }); return false; }
    return true;
  };

  const go = async (to: number, markDone: boolean) => {
    const nextDone = markDone ? Array.from(new Set([...done, step])) : done;
    setBusy(true); const ok = await saveAll(to, nextDone); setBusy(false);
    if (!ok) return;
    setDone(nextDone); setStep(to); setTried(false); setErrors({});
  };

  const next = async () => {
    const e = stepErrors(step, d);
    if (Object.keys(e).length) {
      setTried(true); setErrors(e);
      const first = refs.current[Object.keys(e)[0]];
      first?.scrollIntoView({ behavior: "smooth", block: "center" }); (first as HTMLInputElement | null)?.focus();
      return;
    }
    if (step === 4) {
      setBusy(true); const ok = await saveAll(4, [0, 1, 2, 3, 4], true); setBusy(false);
      if (ok) { toast.success("You're all set", { description: "Your company is ready to use." }); nav("/"); }
      return;
    }
    go(step + 1, true);
  };

  const upload = async (file: File | undefined, kind: "logo" | "accreditation") => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast.error("Choose a PNG, JPEG or WebP image"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
    setBusy(true);
    try {
      const path = await buildOrgPathAsync(`company-${kind}/${crypto.randomUUID()}.${file.type.split("/")[1]}`);
      const { error } = await supabase.storage.from("customer-logos").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const ref = buildDurableRef("customer-logos", path);
      if (kind === "logo") set("logo_url", ref); else set("accreditation_logo_urls", [...d.accreditation_logo_urls, ref]);
    } catch (e: any) { toast.error("Image not uploaded", { description: e.message }); } finally { setBusy(false); }
  };

  const addType = async () => {
    const name = newType.trim(); if (!name || !orgId) return;
    if (types.some(t => t.name.toLowerCase() === name.toLowerCase())) { toast.error("You already have that job type"); return; }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data, error } = await supabase.from("job_categories").insert({ org_id: orgId, name, slug, sort_order: types.length } as any).select("id, name").single();
    if (error) { toast.error("Couldn't add job type", { description: error.message }); return; }
    setTypes([...types, data as any]); setNewType("");
  };

  const addMember = async () => {
    if (!member.full_name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim())) { toast.error("Enter a name and a valid email"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-user", { body: {
      email: member.email.trim(), full_name: member.full_name.trim(), roles: [member.role],
      allowed_pages: member.role === "engineer" ? DEFAULT_ENGINEER_PAGES : [] } });
    setBusy(false);
    if (error || (data as any)?.error) { toast.error((data as any)?.error || "Couldn't add this person"); return; }
    setTeam([...team, member]); setMember({ full_name: "", email: "", role: "engineer" });
    toast.success(`${member.full_name} added`);
  };

  const field = (k: keyof SetupData, label: string, opts: { required?: boolean; type?: string; placeholder?: string; area?: boolean } = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`f-${k}`}>{label}{opts.required && <span className="text-destructive ml-0.5" aria-hidden>*</span>}</Label>
      {opts.area
        ? <Textarea id={`f-${k}`} ref={el => (refs.current[k] = el)} rows={2} value={d[k] as string} placeholder={opts.placeholder} onChange={e => set(k, e.target.value as any)} className={cn(errors[k] && "border-destructive focus-visible:ring-destructive")} aria-invalid={!!errors[k]} />
        : <Input id={`f-${k}`} ref={el => (refs.current[k] = el)} type={opts.type || "text"} value={d[k] as string} placeholder={opts.placeholder} onChange={e => set(k, e.target.value as any)} className={cn(errors[k] && "border-destructive focus-visible:ring-destructive")} aria-invalid={!!errors[k]} />}
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const errCount = Object.keys(errors).length;
  const summary = (s: number, rows: [string, string][]) => (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between mb-1"><span className="font-medium text-sm">{SETUP_STEPS[s]}</span><button className="text-sm text-primary hover:underline" onClick={() => go(s, false)}>Edit</button></div>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 text-sm">{rows.map(([a, b]) => <Fragment key={a}><dt className="text-muted-foreground">{a}</dt><dd className="truncate">{b || "—"}</dd></Fragment>)}</dl>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto flex flex-col min-h-[calc(100dvh-8rem)]">
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm"><h1 className="text-xl font-bold">Set up your company</h1><span className="text-muted-foreground">Step {step + 1} of {SETUP_STEPS.length}</span></div>
        <Progress value={((step + 1) / SETUP_STEPS.length) * 100} aria-label={`Step ${step + 1} of ${SETUP_STEPS.length}`} />
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {SETUP_STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-1", i === step ? "font-semibold text-foreground" : "text-muted-foreground")} aria-current={i === step ? "step" : undefined}>
              {done.includes(i) ? <Check className="h-3.5 w-3.5 text-primary" aria-label="Done" /> : <span className="h-3.5 w-3.5 rounded-full border text-[9px] grid place-items-center">{i + 1}</span>}{s}
            </li>))}
        </ol>
      </div>

      <div className="flex-1 space-y-3">
        {errCount > 0 && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{fixLine(errCount)}</p>}

        {step === 0 && <>
          <p className="text-sm text-muted-foreground">Tell us who you are. This appears on your reports and emails.</p>
          {field("company_name", "Company name", { required: true })}
          {field("address", "Address", { required: true, area: true })}
          <div className="grid sm:grid-cols-2 gap-3">{field("email", "Email", { required: true, type: "email", placeholder: "office@company.co.uk" })}{field("phone", "Phone", { type: "tel" })}</div>
          {field("website", "Website", { placeholder: "www.company.co.uk" })}
        </>}

        {step === 1 && <>
          <p className="text-sm text-muted-foreground">Add your logo and colour so paperwork looks like yours.</p>
          <div className="space-y-1"><Label>Logo</Label>
            <div className="flex items-center gap-3">
              {d.logo_url && <Img src={d.logo_url} className="h-14 w-32 object-contain border rounded bg-background" />}
              <Label className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2"><Upload className="h-4 w-4" />{d.logo_url ? "Change logo" : "Upload logo"}
                <Input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={e => upload(e.target.files?.[0], "logo")} /></Label>
              {d.logo_url && <Button variant="ghost" size="sm" onClick={() => set("logo_url", "")}>Remove</Button>}
            </div></div>
          <div className="space-y-1"><Label htmlFor="f-primary_color">Brand colour</Label>
            <div className="flex gap-2">
              <input type="color" aria-label="Pick brand colour" value={/^#[0-9a-f]{6}$/i.test(d.primary_color) ? d.primary_color : "#808080"} onChange={e => set("primary_color", e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-input bg-background" />
              <Input id="f-primary_color" ref={el => (refs.current.primary_color = el)} value={d.primary_color} onChange={e => set("primary_color", e.target.value.trim())} placeholder="#1F4E79" className={cn("w-32 font-mono", errors.primary_color && "border-destructive")} />
            </div>{errors.primary_color && <p className="text-xs text-destructive">{errors.primary_color}</p>}</div>
        </>}

        {step === 2 && <>
          <p className="text-sm text-muted-foreground">Choose what goes on your reports. All of this is optional.</p>
          {field("report_footer_text", "Report footer text", { area: true, placeholder: "e.g. Registered in England No. 1234567" })}
          <div className="space-y-1"><Label>Accreditation logos</Label>
            <div className="flex flex-wrap items-center gap-2">
              {d.accreditation_logo_urls.map((u, i) => <div key={u} className="relative"><Img src={u} className="h-10 w-16 object-contain border rounded bg-background" />
                <button aria-label="Remove logo" className="absolute -top-1.5 -right-1.5 rounded-full bg-background border" onClick={() => set("accreditation_logo_urls", d.accreditation_logo_urls.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button></div>)}
              <Label className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 text-sm"><Upload className="h-4 w-4" />Add logo
                <Input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={e => upload(e.target.files?.[0], "accreditation")} /></Label>
            </div></div>
          <div className="space-y-1"><Label>Job types</Label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">{types.length ? types.map(t => <span key={t.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{t.name}</span>) : <span className="text-xs text-muted-foreground">No job types yet.</span>}</div>
            <div className="flex gap-2"><Input value={newType} onChange={e => setNewType(e.target.value)} placeholder="e.g. Fire alarm service" onKeyDown={e => e.key === "Enter" && addType()} /><Button variant="outline" onClick={addType}>Add</Button></div></div>
        </>}

        {step === 3 && <>
          <p className="text-sm text-muted-foreground">Add your first engineers or office staff. They'll get an email to set their password. You can skip this and add people later.</p>
          <div className="grid sm:grid-cols-[1fr,1fr,auto,auto] gap-2 items-end">
            <div className="space-y-1"><Label htmlFor="m-name">Name</Label><Input id="m-name" value={member.full_name} onChange={e => setMember({ ...member, full_name: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="m-email">Email</Label><Input id="m-email" type="email" value={member.email} onChange={e => setMember({ ...member, email: e.target.value })} /></div>
            <select aria-label="Role" className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={member.role} onChange={e => setMember({ ...member, role: e.target.value as any })}><option value="engineer">Engineer</option><option value="admin">Office</option></select>
            <Button onClick={addMember} disabled={busy}>Add</Button>
          </div>
          {team.length > 0 && <ul className="text-sm space-y-1">{team.map(m => <li key={m.email} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />{m.full_name} · {m.email} · {m.role === "admin" ? "Office" : "Engineer"}</li>)}</ul>}
        </>}

        {step === 4 && <>
          <p className="text-sm text-muted-foreground">Check everything looks right, then finish.</p>
          {summary(0, [["Name", d.company_name], ["Address", d.address.replace(/\n/g, ", ")], ["Email", d.email], ["Phone", d.phone], ["Website", d.website]])}
          {summary(1, [["Logo", d.logo_url ? "Uploaded" : "None"], ["Colour", d.primary_color]])}
          {summary(2, [["Footer", d.report_footer_text], ["Accreditations", d.accreditation_logo_urls.length ? `${d.accreditation_logo_urls.length} logo(s)` : "None"], ["Job types", types.map(t => t.name).join(", ")]])}
          {summary(3, [["Added now", team.length ? team.map(m => m.full_name).join(", ") : "Nobody"]])}
        </>}
      </div>

      <div className="sticky bottom-0 bg-background border-t mt-4 py-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="lg" disabled={step === 0 || busy} onClick={() => go(step - 1, false)}>Back</Button>
        <div className="flex items-center gap-4">
          {OPTIONAL_STEPS.has(step) && <button className="text-sm text-muted-foreground hover:underline" disabled={busy} onClick={() => go(step + 1, false)}>Skip for now</button>}
          <Button size="lg" onClick={next} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{step === 4 ? "Finish setup" : "Next"}</Button>
        </div>
      </div>
    </div>
  );
}
