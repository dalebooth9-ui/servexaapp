export default function SlaPolicy() {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src="/servexa-logo.png" alt="Servexa" className="h-10 w-10 rounded-xl" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Service Level Agreement</h1>
          <p className="text-sm text-muted-foreground">Last updated: {date}</p>
        </div>
        <div className="space-y-6 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Service Availability</h2>
            <p className="text-muted-foreground leading-relaxed">Servexa targets 99.5% uptime measured monthly, excluding scheduled maintenance windows. Uptime is calculated as: ((total minutes in month − downtime minutes) / total minutes in month) × 100.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">2. Scheduled Maintenance</h2>
            <p className="text-muted-foreground leading-relaxed">Planned maintenance is typically performed between 02:00–04:00 UTC on weekdays. We will provide at least 48 hours' advance notice for scheduled maintenance that may affect service availability. Emergency maintenance may be performed without notice where necessary to maintain security or stability.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">3. Incident Response Times</h2>
            <p className="text-muted-foreground leading-relaxed">We classify incidents by severity:</p>
            <ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside">
              <li><strong className="text-foreground">Critical</strong> (platform unavailable): Initial response within 1 hour, resolution target 4 hours.</li>
              <li><strong className="text-foreground">High</strong> (major feature unavailable): Initial response within 4 hours, resolution target 24 hours.</li>
              <li><strong className="text-foreground">Medium</strong> (degraded performance): Initial response within 8 hours, resolution target 72 hours.</li>
              <li><strong className="text-foreground">Low</strong> (minor issues): Initial response within 2 business days.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">4. Support Channels</h2>
            <p className="text-muted-foreground leading-relaxed">Support is available via: in-app AI help wizard (24/7); email at <a href="mailto:privacy@servexaapp.com" className="underline underline-offset-2 hover:text-foreground transition-colors">privacy@servexaapp.com</a> (response within 1 business day). Enterprise customers may have dedicated support channels as specified in their contract.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">5. Service Credits</h2>
            <p className="text-muted-foreground leading-relaxed">If monthly uptime falls below 99.5%, eligible customers may request a service credit equal to: 10% of monthly fee for 99.0–99.4% uptime; 25% of monthly fee for 95.0–98.9% uptime; 50% of monthly fee for uptime below 95.0%. To claim a credit, email <a href="mailto:privacy@servexaapp.com?subject=SLA%20Service%20Credit%20Request" className="underline underline-offset-2 hover:text-foreground transition-colors">privacy@servexaapp.com</a> within 30 days of the incident with the subject "SLA Service Credit Request" and include: (i) your account/organisation name, (ii) the date(s) and approximate duration of the outage, and (iii) any reference numbers from our status updates. We will verify the claim against our monitoring records and apply approved credits to your next invoice.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">6. Exclusions</h2>
            <p className="text-muted-foreground leading-relaxed">This SLA does not apply to: downtime caused by factors outside our reasonable control (force majeure); issues resulting from customer's equipment, software, or network; scheduled maintenance; free trial periods; or beta features clearly marked as such.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">7. Data Backup</h2>
            <p className="text-muted-foreground leading-relaxed">We perform automated daily backups with a 30-day retention period. In the event of data loss caused by our infrastructure, we will restore to the most recent available backup. We are not responsible for data loss caused by user actions.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
