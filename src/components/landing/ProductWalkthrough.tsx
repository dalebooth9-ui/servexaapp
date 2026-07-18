/**
 * ProductWalkthrough — auto-cycling 5-step interactive demo of Servexa.
 */
import { useState, useEffect, useRef } from "react";
import {
  Briefcase, CalendarDays, ClipboardCheck, FileSignature, Receipt,
  Users, BarChart3, Settings, Lock, Minus, Square, X,
  CheckCircle2, Sparkles, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEP_MS = 4500;

type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: { id: StepId; title: string; desc: string; activeNav: string; url: string; icon: typeof Briefcase }[] = [
  { id: 1, title: "Create a job",       desc: "Start with the customer, site and service. Auto-generate a RAMS in seconds.",  activeNav: "jobs",     url: "app.servexaapp.com/jobs/new",         icon: Briefcase },
  { id: 2, title: "Assign an engineer", desc: "AI suggests the closest engineer with capacity. One tap to assign.",            activeNav: "planner",  url: "app.servexaapp.com/planner",          icon: CalendarDays },
  { id: 3, title: "Complete on-site",   desc: "Engineers tick off BS-compliant checks from their phone — fully offline.",       activeNav: "jobs",     url: "app.servexaapp.com/jobs/2847/sheet",  icon: ClipboardCheck },
  { id: 4, title: "Customer sign-off",  desc: "Capture a digital signature, generate a branded certificate PDF.",               activeNav: "jobs",     url: "app.servexaapp.com/sign-off/tk_38f2", icon: FileSignature },
  { id: 5, title: "Invoice & sync",     desc: "Auto-build the invoice from labour & parts, push straight to Xero.",             activeNav: "invoices", url: "app.servexaapp.com/invoices/INV-2847",icon: Receipt },
];

const SIDEBAR_NAV = [
  { slug: "jobs",      icon: Briefcase },
  { slug: "planner",   icon: CalendarDays },
  { slug: "engineers", icon: Users },
  { slug: "invoices",  icon: Receipt },
  { slug: "reports",   icon: BarChart3 },
  { slug: "settings",  icon: Settings },
];

export default function ProductWalkthrough() {
  const [active, setActive] = useState<StepId>(1);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    timer.current = setInterval(() => {
      setActive((prev) => ((prev % 5) + 1) as StepId);
    }, STEP_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [paused]);

  const current = STEPS[active - 1];
  const Icon = current.icon;

  return (
    <div
      className="relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
        {STEPS.map((s) => {
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn(
                "group flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? "bg-[#1e293b] text-white ring-1 ring-[#f97316]/40 shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                isActive ? "bg-[#f97316] text-white" : "bg-background text-muted-foreground"
              )}>
                {s.id}
              </span>
              {isActive && <span className="hidden sm:inline">{s.title}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-0">
        <div className="border-b lg:border-b-0 lg:border-r border-border p-6 lg:p-8 bg-background flex flex-col">
          <div
            key={`icon-${active}`}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-xl mb-5 animate-scale-in"
            style={{ background: "rgba(249,115,22,0.10)" }}
          >
            <Icon className="h-6 w-6" style={{ color: "#f97316" }} />
          </div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Step {active} of 5</p>
          <h3 key={`title-${active}`} className="mt-2 text-2xl font-bold text-foreground animate-fade-in">{current.title}</h3>
          <p key={`desc-${active}`} className="mt-3 text-sm leading-relaxed animate-fade-in" style={{ color: "#475569" }}>{current.desc}</p>
          <div className="mt-auto pt-8">
            <div className="flex gap-1.5">
              {STEPS.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors duration-300",
                    s.id < active && "bg-[#f97316]",
                    s.id === active && "bg-[#1e293b]",
                    s.id > active && "bg-muted"
                  )}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {paused ? "Paused — move away to resume" : "Auto-playing — hover to pause"}
            </p>
          </div>
        </div>

        <div className="bg-[#0b1220]">
          <div className="flex items-center justify-between gap-3 bg-[#1f2937] border-b border-[#0f172a] px-3 py-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 rounded-md bg-[#0f172a] px-2.5 py-1 flex-1 min-w-0 max-w-md">
                <Lock className="h-3 w-3 shrink-0 text-emerald-400" />
                <span key={`url-${active}`} className="truncate text-[11px] text-slate-300 font-mono animate-fade-in">{current.url}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="flex h-6 w-7 items-center justify-center rounded text-slate-400 hover:bg-[#374151]"><Minus className="h-3 w-3" /></button>
              <button className="flex h-6 w-7 items-center justify-center rounded text-slate-400 hover:bg-[#374151]"><Square className="h-2.5 w-2.5" /></button>
              <button className="flex h-6 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-600 hover:text-white"><X className="h-3 w-3" /></button>
            </div>
          </div>

          <div className="flex" style={{ minHeight: 460 }}>
            <aside className="w-[52px] shrink-0 bg-[#0f172a] flex flex-col items-center py-3 gap-1 border-r border-[#0b1220]">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}>S</div>
              {SIDEBAR_NAV.map((n) => {
                const isActive = n.slug === current.activeNav;
                const NavIcon = n.icon;
                return (
                  <div key={n.slug} className="flex h-9 w-9 items-center justify-center rounded-lg transition-all" style={isActive ? { background: "rgba(249,115,22,0.15)" } : undefined}>
                    <NavIcon className="h-4 w-4 transition-colors" style={{ color: isActive ? "#f97316" : "#64748b" }} />
                  </div>
                );
              })}
            </aside>
            <main className="flex-1 bg-[#111827] p-5 overflow-hidden">
              {active === 1 && <Step1 />}
              {active === 2 && <Step2 />}
              {active === 3 && <Step3 />}
              {active === 4 && <Step4 />}
              {active === 5 && <Step5 />}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageHeader({ title, badge, badgeColor }: { title: string; badge: string; badgeColor: string }) {
  return (
    <div className="flex items-center justify-between mb-4 animate-fade-in">
      <h4 className="text-base font-semibold text-white">{title}</h4>
      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}55` }}>{badge}</span>
    </div>
  );
}

function Step1() {
  const rows = [
    { label: "Customer", value: "Westfield Shopping Centre", color: "#e2e8f0" },
    { label: "Site",     value: "Unit 12, Level 3",          color: "#e2e8f0" },
    { label: "Service",  value: "Fire Alarm — BS 5839",       color: "#f97316" },
    { label: "Priority", value: "HIGH",                       color: "#ef4444", pill: true },
    { label: "RAMS",     value: "✓ Auto-generated",            color: "#10b981" },
  ];
  return (
    <div>
      <PageHeader title="New Job" badge="Draft" badgeColor="#f97316" />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center justify-between rounded-lg bg-[#1e293b] px-3.5 py-2.5 border border-[#1e293b]" style={{ animation: `fade-in 0.4s ease-out ${i * 0.08}s both` }}>
            <span className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">{r.label}</span>
            {r.pill ? (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(239,68,68,0.15)", color: r.color }}>{r.value}</span>
            ) : (
              <span className="text-xs font-medium" style={{ color: r.color }}>{r.value}</span>
            )}
          </div>
        ))}
      </div>
      <button className="mt-4 w-full rounded-lg py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "#f97316", animation: "fade-in 0.4s ease-out 0.5s both" }}>Create Job →</button>
    </div>
  );
}

function Step2() {
  const engineers = [
    { name: "James T.",  jobs: 4, area: "London SE",  status: "available", recommended: false },
    { name: "Sarah M.",  jobs: 6, area: "Birmingham", status: "full",      recommended: false },
    { name: "Kyle R.",   jobs: 3, area: "London W",   status: "available", recommended: true  },
  ];
  return (
    <div>
      <PageHeader title="Weekly Planner" badge="W/C 21 Apr" badgeColor="#a855f7" />
      <div className="space-y-2">
        {engineers.map((e, i) => (
          <div key={e.name} className="flex items-center justify-between rounded-lg bg-[#1e293b] px-3.5 py-3 border transition-all" style={{ borderColor: e.recommended ? "#f97316" : "#1e293b", boxShadow: e.recommended ? "0 0 0 1px rgba(249,115,22,0.3)" : "none", animation: `fade-in 0.4s ease-out ${i * 0.1}s both` }}>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0f172a] text-[10px] font-bold text-slate-200">{e.name.split(" ").map(s => s[0]).join("")}</div>
              <div>
                <p className="text-xs font-semibold text-white">{e.name}</p>
                <p className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> {e.area} · {e.jobs} jobs</p>
              </div>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: e.status === "available" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: e.status === "available" ? "#10b981" : "#ef4444" }}>{e.status === "available" ? "Available" : "Full"}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#1e293b] px-3 py-2.5 border border-[#f97316]/30" style={{ animation: "fade-in 0.4s ease-out 0.4s both" }}>
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: "#f97316" }}>AI</span>
        <span className="text-[11px] font-medium" style={{ color: "#f97316" }}>Recommends Kyle R. — closest to site, lightest schedule</span>
      </div>
    </div>
  );
}

function Step3() {
  const items = [
    { label: "Panel event log reviewed",       done: true,  active: false },
    { label: "Manual call points (5/5)",        done: true,  active: false },
    { label: "Smoke detectors zone 1 (12/12)",  done: true,  active: false },
    { label: "Smoke detectors zone 2 (4/8)",    done: false, active: true  },
    { label: "Sounder circuit test",            done: false, active: false },
  ];
  return (
    <div>
      <PageHeader title="Fire Alarm Inspection" badge="In Progress" badgeColor="#10b981" />
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={it.label} className="flex items-center gap-3 rounded-lg bg-[#1e293b] px-3.5 py-2.5" style={{ border: it.active ? "1px solid #f97316" : "1px solid transparent", animation: `fade-in 0.4s ease-out ${i * 0.08}s both` }}>
            <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded" style={{ background: it.done ? "#10b981" : "transparent", border: it.done ? "1px solid #10b981" : it.active ? "1px solid #f97316" : "1px solid #475569" }}>
              {it.done && <CheckCircle2 className="h-3 w-3 text-white" />}
            </div>
            <span className={cn("text-xs flex-1", it.done && "line-through")} style={{ color: it.done ? "#64748b" : it.active ? "#f1f5f9" : "#cbd5e1" }}>{it.label}</span>
            {it.active && <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "#f97316" }} />}
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-slate-400 text-center">4 of 12 checks complete · BS 5839-1:2017</p>
    </div>
  );
}

function Step4() {
  return (
    <div>
      <PageHeader title="Customer Sign-Off" badge="Awaiting" badgeColor="#f97316" />
      <div className="mx-auto max-w-sm rounded-xl bg-[#1e293b] border border-[#334155] p-5 text-center" style={{ animation: "fade-in 0.5s ease-out both" }}>
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Certificate</p>
        <h5 className="mt-1 text-sm font-bold text-white">Fire Alarm Inspection Certificate</h5>
        <p className="mt-1 text-[11px] text-slate-400">BS 5839-1:2017 · Westfield Shopping Centre</p>
        <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid #10b981", animation: "scale-in 0.4s ease-out 0.2s both" }}>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-sm font-bold text-emerald-400">PASS</span>
        </div>
        <div className="mt-4 rounded-lg bg-[#111827] border border-dashed border-[#334155] p-3 h-16 flex items-center justify-center">
          <svg viewBox="0 0 200 40" className="h-10 w-full">
            <path d="M 10 28 Q 25 8, 40 22 T 80 18 Q 100 5, 120 26 T 170 14 L 188 22" fill="none" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" style={{ strokeDasharray: 400, strokeDashoffset: 400, animation: "draw-sig 1.2s ease-out 0.4s forwards" }} />
          </svg>
        </div>
        <button className="mt-4 w-full rounded-lg py-2 text-xs font-semibold text-white" style={{ background: "#f59e0b", animation: "fade-in 0.4s ease-out 1.2s both" }}>Confirm & Generate PDF</button>
      </div>
      <style>{`@keyframes draw-sig { to { stroke-dashoffset: 0; } }`}</style>
    </div>
  );
}

function Step5() {
  const lines = [
    { label: "Fire Alarm Inspection",         qty: "",    amt: "£285.00" },
    { label: "Call-out charge",               qty: "",    amt: "£45.00"  },
    { label: "Replacement smoke detector",    qty: "× 2", amt: "£68.00"  },
  ];
  return (
    <div>
      <PageHeader title="Invoice #INV-2847" badge="Sent" badgeColor="#10b981" />
      <div className="space-y-1.5">
        {lines.map((l, i) => (
          <div key={l.label} className="flex items-center justify-between rounded-lg bg-[#1e293b] px-3.5 py-2.5" style={{ animation: `fade-in 0.4s ease-out ${i * 0.1}s both` }}>
            <div>
              <p className="text-xs text-slate-200">{l.label}</p>
              {l.qty && <p className="text-[10px] text-slate-500">{l.qty}</p>}
            </div>
            <span className="text-xs font-semibold text-white">{l.amt}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg px-3.5 py-2.5" style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.30)", animation: "fade-in 0.4s ease-out 0.35s both" }}>
        <span className="text-xs font-semibold text-slate-200">Total</span>
        <span className="text-base font-bold text-emerald-400">£398.00</span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.30)", animation: "fade-in 0.4s ease-out 0.5s both" }}>
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span className="text-[11px] text-emerald-300">Synced to Xero · Payment due 14 May</span>
        <Sparkles className="h-3 w-3 text-emerald-400 ml-auto" />
      </div>
    </div>
  );
}
