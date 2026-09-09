/**
 * ProductScreenshots — real, current screenshots of the running product.
 *
 * All images are captured from a demo workspace containing fictitious
 * customers, sites and engineers only. Images are lazy-loaded and sized
 * so the section never blocks first paint.
 */
import dashboard from "@/assets/screens/dashboard.webp";
import planner from "@/assets/screens/planner.webp";
import jobDetail from "@/assets/screens/job-detail.webp";
import defects from "@/assets/screens/defects.webp";
import quote from "@/assets/screens/quote.webp";
import helpGuides from "@/assets/screens/help-guides.webp";
import engineerToday from "@/assets/screens/engineer-today.webp";
import engineerReport from "@/assets/screens/engineer-report.webp";

const WIDE = [
  { src: dashboard, alt: "Servexa dashboard showing jobs awaiting approval, overdue jobs, this week's schedule and upcoming renewals", caption: "Office dashboard — what needs attention today" },
  { src: planner, alt: "Weekly job planner grid with engineers down the side and jobs scheduled across the week", caption: "Drag-and-drop weekly planner" },
  { src: jobDetail, alt: "Job record with engineer assignment, scheduled visits, RAMS and job sheets", caption: "Everything about a job on one page" },
  { src: defects, alt: "Defects register listing outstanding remedial items with severity, site and status", caption: "Defects tracked to closure" },
  { src: quote, alt: "Branded quote document with line items, subtotal, VAT and total", caption: "Branded quotes and invoices" },
  { src: helpGuides, alt: "In-app help centre listing step-by-step guides grouped by category", caption: "Step-by-step guides built in" },
];

const PHONE = [
  { src: engineerToday, alt: "Engineer phone view listing today's jobs as large tappable cards", caption: "Engineer's day, on their phone" },
  { src: engineerReport, alt: "Engineer filling in a fire alarm inspection sheet on a phone", caption: "Fill the report on site — even offline" },
];

export default function ProductScreenshots() {
  return (
    <section id="screenshots" className="border-t border-border bg-muted/20 px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-bold tracking-tight">A look inside Servexa</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Real screens from the live product — not mock-ups.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {WIDE.map((s) => (
            <figure key={s.caption} className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
              <img
                src={s.src}
                alt={s.alt}
                loading="lazy"
                decoding="async"
                width={1600}
                height={1111}
                className="w-full"
              />
              <figcaption className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                {s.caption}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:mx-auto lg:max-w-3xl">
          {PHONE.map((s) => (
            <figure key={s.caption} className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
              <img
                src={s.src}
                alt={s.alt}
                loading="lazy"
                decoding="async"
                width={900}
                height={1800}
                className="w-full"
              />
              <figcaption className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                {s.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
