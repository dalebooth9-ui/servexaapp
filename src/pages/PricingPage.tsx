import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronRight, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ContactSalesDialog from "@/components/ContactSalesDialog";
import { PLAN_BANDS, formatMonthly } from "@/lib/planBands";

const CORE_FEATURES = [
  "Whole team included — no per-user charges",
  "Unlimited jobs, customers, sites and assets",
  "Digital job sheets, RAMS and PDF/Word reports",
  "Weekly planner, PPM scheduling and route optimisation",
  "AI job briefs, AI RAMS auto-fill and AI reports",
  "Live engineer GPS tracking",
  "Compliance & certification tracker (BS 5839, 5306, 9990, PAS 79)",
  "Xero, QuickBooks, Sage and FreeAgent invoicing sync",
  "Defects → Quote → Remedial job pipeline",
  "Renewals engine + overdue register",
  "Support ticket inbox + AI help assistant",
];

const PORTAL_FEATURES = [
  "Unlimited customer portal users at every tier — free",
  "Customers see their reports, service history, quotes and sites",
  "Portal users never count towards your user band",
];

const FAQS = [
  { q: "How do you count users?", a: "Only your staff — engineers and admins with a Servexa login — count towards the band. Customer portal users are unlimited and free at every tier and are never included in the count." },
  { q: "What happens if I hire past my band?", a: "Nothing breaks. We show a friendly notice in the app suggesting you upgrade, and your account owner is notified. There's no per-seat charge and no hard cap in the current beta — we'll help you move to the next band when you're ready." },
  { q: "Can I switch bands later?", a: "Yes — upgrade at any time from your billing portal. Downgrades take effect at the end of the current billing period." },
  { q: "Do you offer annual billing?", a: "Not at launch — flat monthly to keep things simple. Annual with a discount is coming shortly." },
  { q: "Can I cancel any time?", a: "Yes. Cancel from your billing portal at any time. You'll retain access until the end of the current billing period." },
  { q: "Is my data secure?", a: "All data is encrypted in transit and at rest. Row-level security isolates every organisation's data completely." },
];

export default function PricingPage() {
  const [contactOpen, setContactOpen] = useState(false);

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
              <Button variant="ghost" size="sm" asChild><Link to="/login">Sign In</Link></Button>
              <Button size="sm" asChild><Link to="/signup">Get invited</Link></Button>
            </div>
          </div>
        </header>

        <section className="px-6 pt-24 pb-8 text-center">
          <Badge className="mb-4 border-primary/30 bg-primary/10 text-primary">Simple, transparent pricing</Badge>
          <h1 className="text-5xl font-bold tracking-tight">One flat fee. Your whole team included.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            No per-user charges. No surprises when you hire. Pick the band that matches your team size —
            <span className="text-foreground font-medium"> customer portal users are unlimited and free at every tier.</span>
          </p>
        </section>

        <section className="px-6 pb-16">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PLAN_BANDS.map((band, idx) => {
              const highlight = idx === 0;
              return (
                <div
                  key={band.code}
                  className={cn(
                    "relative rounded-2xl border bg-card shadow-sm overflow-hidden flex flex-col",
                    highlight ? "border-2 border-primary/40 shadow-2xl" : "border-border",
                  )}
                >
                  {highlight && (
                    <>
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-orange-400" />
                      <div className="absolute top-3 right-3">
                        <Badge className="bg-primary text-primary-foreground text-[10px]">Launch band</Badge>
                      </div>
                    </>
                  )}
                  <div className="p-6 text-center flex-1">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold mb-3">
                      <Users className="h-3 w-3" />
                      {band.label}
                    </div>
                    <div className="mt-2 min-h-[64px] flex flex-col items-center justify-center">
                      {band.monthlyPriceGbp === null ? (
                        <span className="text-3xl font-bold">Contact us</span>
                      ) : (
                        <>
                          <span className="text-4xl font-bold">£{band.monthlyPriceGbp}</span>
                          <span className="text-sm text-muted-foreground">per month, flat</span>
                        </>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{band.tagline}</p>
                    <div className="mt-5">
                      {band.selfServe ? (
                        <Button className="w-full" asChild>
                          <Link to="/signup">Get invited<ChevronRight className="ml-1 h-4 w-4" /></Link>
                        </Button>
                      ) : (
                        <Button variant="outline" className="w-full" onClick={() => setContactOpen(true)}>
                          Contact us
                        </Button>
                      )}
                    </div>
                    {band.selfServe && (
                      <p className="mt-2 text-[10px] text-muted-foreground">Invitation code required during private beta</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
            Every band gets the <strong className="text-foreground">full Servexa platform</strong>. The band you're on
            simply reflects how big your team is — the software you get is identical.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-16">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Included in every band
              </p>
              <ul className="space-y-2.5">
                {CORE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border p-6 bg-primary/5 border-primary/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Customer portal — free, unlimited
              </p>
              <ul className="space-y-2.5">
                {PORTAL_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Invite as many of your customers to their own read-only portal as you like. They never count
                towards your user band and there is no extra charge, ever.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-muted/30 px-6 py-20">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
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
          <h2 className="text-3xl font-bold text-sidebar-primary-foreground">Ready to bring your team on board?</h2>
          <p className="mt-3 text-sidebar-foreground/70">Private beta — request an invitation code and be set up in minutes.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="h-12 px-10 text-base" asChild>
              <Link to="/signup">Enter invitation code<ChevronRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-10 text-base bg-transparent border-sidebar-foreground/30 text-sidebar-foreground hover:bg-sidebar-foreground/10"
              onClick={() => setContactOpen(true)}
            >
              Talk to us
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
