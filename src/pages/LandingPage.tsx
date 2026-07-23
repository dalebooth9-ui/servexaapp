import { Link } from "react-router-dom";
import ProductWalkthrough from "@/components/landing/ProductWalkthrough";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Briefcase, CalendarDays, Shield, FileText, Smartphone, MapPin,
  Zap, BarChart2, Users, ChevronRight, Layers, Brain, Flame, ClipboardCheck,
  Bell, Wrench, Camera, Building2, FileCheck, Siren, ScanLine, Send,
} from "lucide-react";

const FEATURES = [
  { icon: Briefcase, title: "Intelligent Job Management", desc: "Create, assign and track fire & security jobs from first call to customer sign-off — full audit trail, priority flags and SLA breach alerts included." },
  { icon: CalendarDays, title: "PPM Scheduling & Planner", desc: "Drag-and-drop weekly planner with auto-generated PPM visits for every fire system type. AI-assisted route optimisation to sequence a day's jobs efficiently." },
  { icon: Shield, title: "Compliance & Certification", desc: "Track certificate and engineer qualification expiry dates, attach documents, and generate PDF reports aligned to BS 9990, BS 5306 and BS 5839." },
  { icon: FileText, title: "RAMS & Digital Job Sheets", desc: "Build PAS 79-aligned Risk Assessments and Method Statements with AI auto-fill from the job's category, site and customer. Custom templates, digital signatures and one-click PDF export." },
  { icon: Smartphone, title: "Engineer Mobile App", desc: "Engineers clock in, submit voice notes, capture on-site photos and get client sign-offs — on or off site, even offline." },
  { icon: Brain, title: "AI-Powered Fire Tools", desc: "AI RAMS auto-fill, AI job briefs, AI scheduler, AI customer report summaries and predictive maintenance alerts — built right in, no extra tools needed." },
  { icon: MapPin, title: "Live Engineer Tracking", desc: "See every engineer in real time. View assigned fire jobs, today's site visits and route history on one map." },
  { icon: BarChart2, title: "Reports & Analytics", desc: "Weekly management reports every Monday — revenue, jobs completed, top engineers, compliance status and more." },
  { icon: ScanLine, title: "Paper Sheets → Digital", desc: "Post or email in your paper job sheets. Servexa's OCR + AI reads the handwriting, matches to a template, and produces a clean branded PDF ready for the customer." },
  { icon: Send, title: "Customer Sign-Off & Send", desc: "Digital customer sign-off via a secure link. Send the finished report straight from the app — via Servexa or via your own Microsoft 365 mailbox." },
  { icon: Wrench, title: "Job Costing & Invoicing", desc: "Track parts, labour and margin per job. Raise invoices directly from the job sheet and sync with Xero, QuickBooks, Sage or FreeAgent." },
  { icon: ClipboardCheck, title: "Installation Projects", desc: "Manage multi-phase installation projects with milestone tracking, handover sign-off and certificate of conformity generation." },
];

const WHY_CHOOSE = [
  { icon: Shield, title: "Built for UK Fire Standards", desc: "Every workflow aligns with BS 5839, BS 5306, BS 9990, PAS 79 and 6 more UK standards. Not a generic tool retrofitted for fire — purpose-built from day one." },
  { icon: Layers, title: "One Platform, Not Five", desc: "RAMS, job sheets, compliance certificates, scheduling, invoicing and customer sign-off in one place. Replace the spreadsheet, the WhatsApp group, and the filing cabinet." },
  { icon: Smartphone, title: "Your Engineers Will Actually Use It", desc: "Dark-themed mobile interface designed for site use. Clock in, complete checklists, capture photos, get customer sign-off — all from their phone. No training needed." },
  { icon: Zap, title: "From First Job to Invoice in Minutes", desc: "Create a job, assign an engineer, complete on-site, get signed off, generate the invoice and sync to Xero. The whole workflow, end to end, no paper." },
];

const WHY_SERVEXA = [
  { icon: Brain, title: "AI-Powered RAMS", desc: "Auto-generate PAS 79-aligned risk assessments in minutes, not hours" },
  { icon: Smartphone, title: "Engineers Love It", desc: "Dark mobile UI built for site work. No training, no app download needed" },
  { icon: MapPin, title: "Live GPS Tracking", desc: "See every engineer in real time with route optimisation and ETA updates" },
  { icon: Shield, title: "UK Standards Built In", desc: "BS 5839, BS 5306, BS 9990, PAS 79 and more — compliance tracking is built in" },
  { icon: Zap, title: "Job to Invoice in Minutes", desc: "Complete on-site, get signed off, sync to Xero — no paper, no waiting" },
  { icon: FileCheck, title: "Certificates & Sign-Off", desc: "Digital customer sign-off via secure link. PDF certificates auto-generated" },
];

const COMPLIANCE_STANDARDS = [
  { code: "BS 9990", label: "Dry Risers" },
  { code: "BS 5306", label: "Fire Extinguishers" },
  { code: "BS 5839", label: "Fire Alarms" },
  { code: "BS 9251", label: "Sprinkler Systems" },
  { code: "PAS 79", label: "Fire Risk Assessments" },
  { code: "BAFE SP203", label: "Gas Suppression" },
  { code: "BS EN 62676", label: "CCTV Systems" },
  { code: "BS 7858", label: "Access Control" },
];

const FIRE_SYSTEMS = [
  { icon: Flame, label: "Dry Risers" },
  { icon: Siren, label: "Fire Alarms" },
  { icon: Wrench, label: "Suppression" },
  { icon: Shield, label: "Emergency Lighting" },
  { icon: Camera, label: "CCTV & Access" },
  { icon: FileCheck, label: "Sprinklers" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary p-1">
              <img src="/servexa-icon-only.png" alt="Servexa icon" className="h-full w-full object-contain" />
            </div>
            <div className="flex flex-col leading-snug">
              <span className="text-lg font-extrabold tracking-tight">Servexa <span className="text-accent">Platform</span></span>
              <span className="text-[10px] text-muted-foreground tracking-widest uppercase font-medium leading-none">Fire &amp; Security Operations</span>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#compliance" className="hover:text-foreground transition-colors">Compliance</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
            <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link to="/auth">Sign In</Link></Button>
            <Button size="sm" asChild><Link to="/signup">Start Free Trial</Link></Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-sidebar px-6 py-24 text-sidebar-foreground lg:py-36">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--primary)/0.25),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_90%_110%,hsl(var(--accent)/0.10),transparent)]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(hsl(var(--primary-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary-foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="relative mx-auto max-w-5xl text-center">
          <Badge className="mb-5 border-accent/30 bg-accent/10 text-accent hover:bg-accent/15 gap-1.5 px-3 py-1">
            <Flame className="h-3.5 w-3.5" />
            Built exclusively for UK fire &amp; security contractors
          </Badge>
          <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight text-sidebar-primary-foreground lg:text-[3.75rem]">
            The operations platform for
            <span className="block mt-1 text-accent">fire & security companies.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-sidebar-foreground/70">
            Manage RAMS, compliance certificates, PPM schedules, engineer dispatch and customer sign-off in one purpose-built platform — from dry riser inspections to sprinkler commissioning.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="h-12 px-8 text-base font-semibold" asChild>
              <Link to="/signup">Start your free 14-day trial<ChevronRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 border-sidebar-border/60 px-8 text-base text-sidebar-foreground hover:bg-sidebar-accent" asChild>
              <Link to="/pricing">View pricing</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-sidebar-foreground/35">Full access. No credit card required. Then from £49/month.</p>

          <div className="mt-12 flex flex-wrap justify-center gap-2">
            {FIRE_SYSTEMS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 rounded-full border border-sidebar-border/40 bg-sidebar-accent/30 px-3 py-1.5 text-xs font-medium text-sidebar-foreground/70">
                <Icon className="h-3.5 w-3.5 text-accent" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/40 py-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-8 px-6 text-sm text-muted-foreground">
          {["Workflows aligned to BAFE SP203", "Aligned with BS 9990 / BS 5306 / BS 5839", "PAS 79 Fire Risk Templates", "GDPR-Ready Data Handling", "99.5% Uptime SLA"].map((t) => (
            <div key={t} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-border bg-background px-6 py-10">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Designed to support contractors accredited with</p>
          <p className="text-sm text-muted-foreground/80 mb-6 max-w-2xl mx-auto">
            Servexa is a software platform that helps accredited contractors manage their compliance workflows. We are not affiliated with, endorsed by, or accredited by any of the bodies listed below.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {["BAFE", "NICEIC", "SSAIB", "NSI", "Gas Safe Register", "Constructionline", "ISO 9001", "SafeContractor"].map((name) => (
              <span key={name} className="rounded-full border border-border bg-muted/50 px-4 py-1.5 text-xs font-semibold text-muted-foreground tracking-wide">{name}</span>
            ))}
          </div>
        </div>
      </section>

      <section id="compliance" className="bg-primary px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-2 text-center">
            <h2 className="text-xl font-bold text-primary-foreground">Built around UK fire &amp; security standards</h2>
            <p className="mt-1.5 text-sm text-primary-foreground/60">Every workflow maps directly to the regulation that governs it</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {COMPLIANCE_STANDARDS.map(({ code, label }) => (
              <div key={code} className="flex flex-col items-center rounded-xl border border-primary-foreground/10 bg-primary-foreground/5 px-3 py-5 text-center hover:bg-primary-foreground/10 transition-colors">
                <Flame className="mb-2 h-5 w-5 text-accent" />
                <span className="text-sm font-bold text-primary-foreground">{code}</span>
                <span className="mt-0.5 text-[11px] text-primary-foreground/50">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="px-6 py-24 bg-muted/20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Platform Features</Badge>
            <h2 className="text-4xl font-bold tracking-tight">Everything fire &amp; security teams need</h2>
            <p className="mt-4 text-lg text-muted-foreground">One platform. Every workflow. Inspection to invoice.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="group rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-card-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-background px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Purpose-built for the fire protection sector</h2>
            <p className="mt-3 text-muted-foreground">Not a generic field service tool — built from the ground up for fire and security contractors.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: ClipboardCheck, title: "Digital RAMS Builder", body: "Generate PAS 79-aligned Risk Assessments and Method Statements from your own RAMS library, with AI auto-fill from the job's category, site and customer." },
              { icon: Bell, title: "Compliance Expiry Alerts", body: "Automated reminders for customer certificate renewals, engineer qualification / training document expiry and upcoming service intervals — configurable per organisation." },
              { icon: Wrench, title: "PPM Auto-Scheduling", body: "Define service frequencies per site and asset. Servexa auto-generates planned maintenance jobs against the schedule so nothing is missed." },
              { icon: ScanLine, title: "Paper → Digital → Send", body: "Post or email your paper job sheets in. Servexa's OCR + AI reads the handwriting, matches to a template and produces a branded PDF ready to send to the customer." },
              { icon: Camera, title: "Site Photos & Sketch Pad", body: "Engineers capture site photos and free-hand sketches / floor plans during a site survey, all bundled into the job record and PDF." },
              { icon: Building2, title: "Asset Register & Service History", body: "Keep a per-site asset register with categories, service intervals and full service history. Every visit and certificate is filed against the asset." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4 rounded-xl border bg-card p-6 shadow-sm">
                <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-card-foreground">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-muted/20 px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Getting started</Badge>
            <h2 className="text-4xl font-bold tracking-tight">Up and running in minutes</h2>
            <p className="mt-4 text-lg text-muted-foreground">No lengthy onboarding. No consultants. Just sign up and go.</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { step: "1", icon: Users, title: "Sign up & invite your team", desc: "Create your organisation, add engineers via email invite. They're live and submitting fire inspection reports in minutes." },
              { step: "2", icon: Briefcase, title: "Create your first fire job", desc: "Add a client, set the job type (dry riser, alarm, suppression), assign an engineer and RAMS auto-fills from job details." },
              { step: "3", icon: CheckCircle2, title: "Complete & get signed off", desc: "Engineer submits their report with photos, client signs off digitally via a secure link. Invoice with one click." },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative rounded-xl border bg-card p-6 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">{step}</div>
                <Icon className="mx-auto mb-3 h-5 w-5 text-primary" />
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-background px-6 py-24 border-t border-border">
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="outline" className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">See it in action</Badge>
          <h2 className="text-4xl font-bold tracking-tight">Watch Servexa in 60 seconds</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            From first job to final sign-off — see how fire and security teams run their entire operation on one platform.
          </p>
          <div className="mt-10">
            <ProductWalkthrough />
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            {["Digital job sheets", "AI RAMS builder", "Live engineer tracking", "Customer sign-off", "Floor plans & QR assets", "Incident reports", "Job costing"].map((f) => (
              <div key={f} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <Button size="lg" className="mt-8 h-12 px-10 text-base" asChild>
            <Link to="/signup">Start free 14-day trial<ChevronRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      <section className="bg-background px-6 py-24 border-t border-border">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Why Servexa</Badge>
            <h2 className="text-4xl font-bold tracking-tight">Why fire contractors choose Servexa</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {WHY_CHOOSE.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border bg-card p-6 shadow-sm flex flex-col">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/20 px-6 py-20 border-t border-border">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Comparison</Badge>
            <h2 className="text-3xl font-bold tracking-tight">How we compare</h2>
            <p className="mt-3 text-muted-foreground">Purpose-built features that generic field service tools can't match</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {WHY_SERVEXA.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border bg-card p-6 shadow-sm flex flex-col">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sidebar px-6 py-24 text-sidebar-foreground">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent/15">
            <Flame className="h-8 w-8 text-accent" />
          </div>
          <h2 className="text-4xl font-bold text-sidebar-primary-foreground">Ready to run a tighter service operation?</h2>
          <p className="mt-4 text-lg text-sidebar-foreground/70">
            Start your free 14-day trial today. Full access from day one — RAMS, compliance, scheduling, engineer dispatch and customer sign-off. No credit card required.
          </p>
          <Button size="lg" className="mt-8 h-12 px-10 text-base font-semibold" asChild>
            <Link to="/signup">Start Free Trial — 14 Days<ChevronRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <p className="mt-4 text-xs text-sidebar-foreground/40">From £49/month. Cancel any time.</p>
        </div>
      </section>

      <footer className="border-t border-border bg-background px-6 py-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
            <div className="flex items-center gap-2">
              <img src="/servexa-logo.png" alt="Servexa" className="h-6 w-6 rounded object-contain" />
              <span className="font-medium text-foreground">Servexa</span>
              <span>© {new Date().getFullYear()}</span>
            </div>
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
              <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/dpa" className="hover:text-foreground transition-colors">DPA</Link>
              <Link to="/aup" className="hover:text-foreground transition-colors">AUP</Link>
              <Link to="/sla" className="hover:text-foreground transition-colors">SLA</Link>
              <Link to="/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
              <Link to="/fire-liability" className="hover:text-foreground transition-colors">Fire Liability</Link>
              <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
            </div>
          </div>
          <div className="border-t border-border pt-6 text-xs text-muted-foreground/80 leading-relaxed text-center sm:text-left">
            Servexa is a trading product of <span className="font-medium text-foreground">Viva Fire Protection Ltd</span>, a company registered in England &amp; Wales.
            Registered office: Unit 1, St Johns Industrial Estate, Lees, Oldham, OL4 3DZ.
            Company No. <span className="font-mono">06464084</span> · VAT No. <span className="font-mono">934 3471 23</span>.
          </div>
        </div>
      </footer>
    </div>
  );
}
