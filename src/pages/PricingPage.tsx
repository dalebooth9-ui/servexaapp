import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronRight, Zap, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ContactSalesDialog from "@/components/ContactSalesDialog";

const STARTER_FEATURES = [
  "Up to 3 engineers",
  "Unlimited jobs & customers",
  "Digital job sheets & templates",
  "RAMS builder & PDF export",
  "Customer sign-off portal",
  "Weekly planner & PPM scheduling",
  "Compliance document tracking",
  "Asset register & QR code scanning",
  "Floor plans & site documents",
  "Job costing & parts library",
  "Certificate of conformity",
  "Incident reports",
  "14-day free trial, cancel any time",
];

const PRO_FEATURES = [
  "Unlimited engineers",
  "Everything in Starter, plus:",
  "AI job briefs & RAMS auto-fill",
  "AI predictive maintenance alerts",
  "AI scheduler & route optimisation",
  "AI customer reports",
  "Live engineer GPS tracking",
  "Accounting & invoicing integration (Xero, QuickBooks, Sage, FreeAgent)",
  "WhatsApp field reporting",
  "Before/after photo reports with annotation",
  "Insurance claims history & export",
  "BMS sync panel",
  "SLA breach alerts",
  "Weekly management reports",
  "Audit module",
  "Voice notes on jobs",
  "Priority support",
];

const FAQS = [
  { q: "Is there a free trial?", a: "Yes — every new organisation gets a full 14-day free trial with complete access to all features. No credit card required to start." },
  { q: "What's the difference between Starter and Pro?", a: "Starter is great for small teams (up to 3 engineers) and covers core job management and compliance. Pro unlocks unlimited engineers, all AI features, Xero integration, and WhatsApp reporting." },
  { q: "Can I switch plans later?", a: "Absolutely. Upgrade from Starter to Pro at any time from your billing settings. Downgrades take effect at the end of your billing period." },
  { q: "Do you offer annual billing?", a: "Yes — pay annually and get 2 months free (equivalent to ~17% off). Toggle above to see annual pricing." },
  { q: "Can I cancel any time?", a: "Yes. Cancel from your billing portal at any time. You'll retain access until the end of your current billing period." },
  { q: "Is my data secure?", a: "All data is encrypted in transit and at rest. We use row-level security so your data is completely isolated from other organisations." },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const starterMonthly = 49;
  const proMonthly = 99;

  const starterPrice = annual ? Math.round(starterMonthly * 10) : starterMonthly;
  const proPrice = annual ? Math.round(proMonthly * 10) : proMonthly;

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/servexa-icon-only.png" alt="Servexa icon" className="h-9 w-9 object-contain" />
            <div className="flex flex-col leading-snug">
              <span className="text-lg font-extrabold tracking-tight">Servexa <span className="text-primary">Platform</span></span>
              <span className="text-[10px] text-muted-foreground tracking-widest uppercase font-medium leading-none">Smarter Service Operations</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link to="/auth">Sign In</Link></Button>
            <Button size="sm" asChild><Link to="/signup">Start Free Trial</Link></Button>
          </div>
        </div>
      </header>

      <section className="px-6 pt-24 pb-12 text-center">
        <Badge className="mb-4 border-primary/30 bg-primary/10 text-primary">Simple, transparent pricing</Badge>
        <h1 className="text-5xl font-bold tracking-tight">The right plan for your team</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Start free for 14 days. No credit card required. Upgrade or cancel any time.
        </p>

        <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border bg-muted/40 p-1 text-sm">
          <button onClick={() => setAnnual(false)} className={cn("rounded-full px-4 py-1.5 font-medium transition-all", !annual ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>Monthly</button>
          <button onClick={() => setAnnual(true)} className={cn("flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition-all", annual ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>
            Annual
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">2 months free</span>
          </button>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="relative rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
            <div className="p-8 text-center flex-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-foreground mb-4">
                <Building2 className="h-3.5 w-3.5" />
                Starter
              </div>
              <div className="mt-2">
                <span className="text-5xl font-bold">£{starterPrice}</span>
                <span className="text-lg text-muted-foreground">/{annual ? "year" : "month"}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-primary/80">
                That's just £{annual ? (Math.round((starterMonthly * 10) / 365 * 100) / 100).toFixed(2) : (starterMonthly / 30).toFixed(2)} per day
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Per organisation · Up to 3 engineers
                {annual && <span className="ml-1 text-primary font-medium">(save £{starterMonthly * 2})</span>}
              </p>
              <Button size="lg" variant="outline" className="mt-6 w-full h-12 text-base border-2" asChild>
                <Link to="/signup">Start free trial<ChevronRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">No credit card required.</p>
            </div>
            <div className="border-t border-border px-8 py-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Includes:</p>
              <ul className="space-y-2.5">
                {STARTER_FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative rounded-2xl border-2 border-primary/40 bg-card shadow-2xl overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-orange-400" />
            <div className="absolute top-4 right-4">
              <Badge className="bg-primary text-primary-foreground text-xs">Most popular</Badge>
            </div>
            <div className="p-8 text-center flex-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary mb-4">
                <Zap className="h-3.5 w-3.5" />
                Pro
              </div>
              <div className="mt-2">
                <span className="text-5xl font-bold">£{proPrice}</span>
                <span className="text-lg text-muted-foreground">/{annual ? "year" : "month"}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-primary/80">
                That's just £{annual ? (Math.round((proMonthly * 10) / 365 * 100) / 100).toFixed(2) : (proMonthly / 30).toFixed(2)} per day
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Per organisation · Unlimited engineers
                {annual && <span className="ml-1 text-primary font-medium">(save £{proMonthly * 2})</span>}
              </p>
              <Button size="lg" className="mt-6 w-full h-12 text-base" asChild>
                <Link to="/signup">Start free trial<ChevronRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">No credit card required. Then £{proPrice}/{annual ? "yr" : "mo"}.</p>
            </div>
            <div className="border-t border-border px-8 py-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Everything in Starter, plus:</p>
              <ul className="space-y-2.5">
                {PRO_FEATURES.filter(f => f !== "Everything in Starter, plus:").map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Need a custom plan for multiple branches or white-labelling?{" "}
          <button onClick={() => setContactOpen(true)} className="text-primary font-medium hover:underline focus:outline-none">Contact us</button>
        </p>
      </section>

      <section className="bg-muted/30 px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently asked questions</h2>
          <div className="space-y-4">
            {FAQS.map(({ q, a }) => (
              <div key={q} className="rounded-xl border bg-card p-6">
                <p className="font-semibold">{q}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sidebar px-6 py-20 text-center text-sidebar-foreground">
        <h2 className="text-3xl font-bold text-sidebar-primary-foreground">Start your free trial today</h2>
        <p className="mt-3 text-sidebar-foreground/70">Full access for 14 days. No credit card. No commitment.</p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg" className="h-12 px-10 text-base" asChild>
            <Link to="/signup">Get started free<ChevronRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <Button size="lg" variant="outline" className="h-12 px-10 text-base bg-transparent border-sidebar-foreground/30 text-sidebar-foreground hover:bg-sidebar-foreground/10" asChild>
            <a href="mailto:hello@servexaapp.com">Talk to sales</a>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border bg-background px-6 py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Servexa. All rights reserved.</span>
          <div className="flex gap-5">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
    <ContactSalesDialog open={contactOpen} onOpenChange={setContactOpen} />
    </>
  );
}
