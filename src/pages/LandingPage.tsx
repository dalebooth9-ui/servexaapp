import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ContactSalesDialog from "@/components/ContactSalesDialog";
import { Button } from "@/components/ui/button";
import { ChevronRight, Flame, UserRound, QrCode, History, ScanLine, Clock, ShieldCheck } from "lucide-react";
import { ProductDevices, WorkflowVisual } from "@/components/landing/LandingVisuals";
import { LANDING_PROOF, LANDING_WORKFLOWS, FOUNDER_QUOTE, SHOW_FOUNDER_NOTE } from "@/components/landing/landingContent";
import "@/components/landing/landing.css";

export default function LandingPage() {
  const [contactOpen, setContactOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.removeAttribute("data-pending"); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    root.current.querySelectorAll(".public-reveal").forEach(element => {
      if (element.getBoundingClientRect().top > window.innerHeight) element.setAttribute("data-pending", "true");
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);
  const featureIcons = [QrCode, History, ScanLine, Clock, ShieldCheck];
  return <div ref={root} className="servexa-public min-h-screen bg-card text-foreground">
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img src="/servexa-icon-only.png" alt="" width="32" height="32" className="h-8 w-8 object-contain" />
          <span className="text-lg font-bold">Servexa<span className="hidden text-accent sm:inline"> Platform</span></span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground lg:flex" aria-label="Main navigation">
          <a href="#features">Features</a><a href="#compliance">Standards</a><a href="#our-story">Our story</a><Link to="/pricing">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2"><Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild><Link to="/auth">Sign In</Link></Button><Button className="public-invite" asChild><Link to="/signup">Request an invitation</Link></Button></div>
      </div>
    </header>
    <section className="public-hero bg-sidebar text-sidebar-foreground">
      <div className="mx-auto max-w-6xl text-center">
        <p className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold text-accent"><Flame className="h-4 w-4" />BUILT FOR FIRE PROTECTION. PROVEN ON SITE.</p>
        <h1 className="font-extrabold text-sidebar-primary-foreground">The operations platform for<span className="mt-1 block text-accent">fire &amp; security companies.</span></h1>
        <p className="mx-auto mt-5 max-w-4xl text-base leading-relaxed text-sidebar-foreground md:text-lg">Dry riser QR stickers, outlet scanning, paper report scanning and automatic timesheets, built by a working fire protection company.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="public-invite" asChild><Link to="/signup">Request an invitation<ChevronRight className="ml-2 h-4 w-4" /></Link></Button>
          <Button size="lg" variant="outline" className="h-11 border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80" onClick={() => setContactOpen(true)}>Book a quick demo</Button>
        </div>
        <p className="mt-3 text-xs text-sidebar-foreground/70">Private beta. From £199/month flat, whole team included.</p>
        <ProductDevices />
      </div>
    </section>
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-9 sm:grid-cols-3">
        {LANDING_PROOF.map(proof => <div key={proof.value} className="public-reveal text-center sm:border-r sm:border-border sm:last:border-0"><p className="public-stat text-accent">{proof.value}</p><p className="mt-2 text-sm font-medium text-muted-foreground">{proof.label}</p></div>)}
      </div>
    </section>
    <div id="features">
      {LANDING_WORKFLOWS.map((feature, index) => {
        const Icon = featureIcons[index] ?? Flame;
        return <section key={feature.type} className={`public-feature-band ${index % 2 === 0 ? "public-navy" : "public-white"}`}>
          <div className="public-reveal mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-2 md:gap-12">
            <div className={index % 2 ? "md:order-2" : ""}><WorkflowVisual type={feature.type} /></div>
            <div className={index % 2 ? "md:order-1" : ""}>
              <p className="mb-4 flex items-center gap-3 text-xs font-semibold text-accent"><Icon className="h-6 w-6" />{feature.label}</p>
              <h2 className="public-feature-title">{feature.title}</h2><p className="public-feature-copy mt-5">{feature.body}</p>
              <div className="public-feature-card mt-6"><Icon className="h-7 w-7 shrink-0 text-accent" /><div><h3 className="font-bold">{feature.label}</h3><p className="mt-1 text-sm">{["Check every outlet. Keep every visit connected.", "Know what was found — and what was fixed.", "Scan, review and file the original.", "Recorded on site. Reviewed in the office.", "Reports and approvals, securely shared."][index]}</p></div></div>
              {index === 2 && <Button size="lg" className="public-invite mt-6" asChild><Link to="/signup">Request an invitation<ChevronRight className="ml-2 h-4 w-4" /></Link></Button>}
            </div>
          </div>
        </section>;
      })}
    </div>
    <section id="compliance" className="public-navy public-standards px-6 py-7">
      <div className="public-reveal mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 md:flex-row"><p className="text-lg font-bold">Built around UK fire standards</p><div className="flex flex-wrap justify-center gap-3 text-sm font-semibold">{["BS 9990", "BS 5306", "BS 5839", "PAS 79"].map(standard => <span className="rounded-full border border-accent/70 px-4 py-2" key={standard}>{standard}</span>)}</div></div>
    </section>
    <section id="our-story" className="public-white px-6 py-12 md:py-16">
      <div className="public-reveal mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 md:gap-16">
        <div><p className="mb-3 text-xs font-semibold text-accent">BUILT FROM EXPERIENCE</p><h2 className="public-feature-title">Built by a working fire protection company</h2><p className="mt-5 text-base leading-relaxed text-muted-foreground">Servexa was built by Viva Fire Protection for the way engineers and offices really work. Real jobs, real sites, and the details that matter when you’re responsible for fire protection.</p></div>
        {SHOW_FOUNDER_NOTE ? <blockquote className="rounded-2xl border border-border bg-card p-7 shadow-sm md:p-9"><p className="mt-5 text-xl leading-relaxed">{FOUNDER_QUOTE}</p><footer className="mt-7 flex items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secondary"><UserRound className="h-7 w-7 text-muted-foreground" /></div><div><p className="font-semibold">Dale Booth</p><p className="mt-1 text-sm text-muted-foreground">Director, Viva Fire Protection</p></div></footer></blockquote> : <div className="public-experience-mark"><Flame className="h-20 w-20 text-accent" /><strong className="text-2xl">Fire protection first.</strong><span className="text-sm text-muted-foreground">Built in the UK. Used in the field.</span></div>}
      </div>
    </section>
    <section className="public-navy px-6 py-12 md:py-16">
      <div className="public-reveal mx-auto max-w-3xl text-center"><Flame className="mx-auto mb-5 h-8 w-8 text-accent" /><h2 className="public-feature-title">Ready to run a tighter service operation?</h2><p className="mt-5 leading-relaxed">See how Servexa fits your fire protection team. Request an invitation or talk to us about your day-to-day work.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Button size="lg" className="public-invite" asChild><Link to="/signup">Request an invitation<ChevronRight className="ml-2 h-4 w-4" /></Link></Button><Button size="lg" variant="outline" className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80" onClick={() => setContactOpen(true)}>Book a quick demo</Button></div><p className="mt-4 text-xs text-sidebar-foreground/70">Private beta. From £199/month flat, whole team included. Cancel any time.</p></div>
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
              <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => setContactOpen(true)}>Contact</Button>
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
      <ContactSalesDialog open={contactOpen} onOpenChange={setContactOpen} />
  </div>;
}
