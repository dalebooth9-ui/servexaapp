import servexaLogo from "@/assets/servexa-logo.png";

export default function ServiceLevelAgreement() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src={servexaLogo} alt="Servexa" className="h-10 rounded-lg" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Service Level Agreement</h1>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Overview</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Service Level Agreement ("SLA") sets out the performance standards and support commitments that Servexa provides to its customers. This SLA forms part of the Terms of Service. Capitalised terms not defined here have the meanings given in the Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Service Availability</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border border-border rounded-lg overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Metric</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Target</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Measurement Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="px-4 py-2">Platform uptime</td><td className="px-4 py-2">99.5%</td><td className="px-4 py-2">Rolling calendar month</td></tr>
                  <tr><td className="px-4 py-2">Scheduled maintenance window</td><td className="px-4 py-2">Max 4 hrs/month</td><td className="px-4 py-2">Advance notice given</td></tr>
                  <tr><td className="px-4 py-2">File storage availability</td><td className="px-4 py-2">99.9%</td><td className="px-4 py-2">Rolling calendar month</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Uptime is calculated as: <em>(Total minutes in month − downtime minutes) / total minutes × 100</em>. Scheduled maintenance, force majeure events, and third-party service outages (e.g., underlying infrastructure providers) are excluded from downtime calculations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Support Response Times</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border border-border rounded-lg overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Priority</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Description</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Initial Response</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Target Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-2 font-medium">Critical (P1)</td>
                    <td className="px-4 py-2">Service unavailable or data loss risk</td>
                    <td className="px-4 py-2">2 business hours</td>
                    <td className="px-4 py-2">8 business hours</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium">High (P2)</td>
                    <td className="px-4 py-2">Core feature unusable, compliance-blocking</td>
                    <td className="px-4 py-2">4 business hours</td>
                    <td className="px-4 py-2">2 business days</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium">Medium (P3)</td>
                    <td className="px-4 py-2">Feature degraded, workaround available</td>
                    <td className="px-4 py-2">1 business day</td>
                    <td className="px-4 py-2">5 business days</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium">Low (P4)</td>
                    <td className="px-4 py-2">Minor issues, feature requests, questions</td>
                    <td className="px-4 py-2">2 business days</td>
                    <td className="px-4 py-2">Best effort</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Business hours are Monday–Friday, 08:00–18:00 GMT/BST, excluding UK public holidays. Support is provided via in-app messaging or the registered account email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Scheduled Maintenance</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa will endeavour to perform all scheduled maintenance outside of peak business hours (typically between 22:00–04:00 GMT). We will provide at least 48 hours' advance notice of scheduled maintenance windows via email or in-app notification. Emergency maintenance required to maintain security or prevent data loss may be performed without advance notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Service Credits</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              If monthly uptime falls below the 99.5% target, eligible customers may claim a service credit:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border border-border rounded-lg overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Monthly Uptime</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Service Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="px-4 py-2">99.0% – 99.49%</td><td className="px-4 py-2">10% of monthly subscription fee</td></tr>
                  <tr><td className="px-4 py-2">95.0% – 98.99%</td><td className="px-4 py-2">25% of monthly subscription fee</td></tr>
                  <tr><td className="px-4 py-2">Below 95.0%</td><td className="px-4 py-2">50% of monthly subscription fee</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Credits must be claimed within 30 days of the qualifying incident by contacting support. Credits are applied to future invoices and are not redeemable for cash. Credits are the sole remedy for SLA breaches unless otherwise agreed in writing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Exclusions</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">This SLA does not apply to downtime or degradation caused by:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Customer's own network, infrastructure, or devices</li>
              <li>Third-party services outside Servexa's control (e.g., internet providers, payment processors)</li>
              <li>Force majeure events (natural disasters, acts of government, pandemics)</li>
              <li>Customer-caused issues including misuse, unauthorised modifications, or excessive load</li>
              <li>Free trial or beta feature usage</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Data Backup</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa performs automated daily backups of all customer data with a 30-day retention period. Point-in-time recovery is available for critical incidents. Backups are stored in geographically redundant locations. Customers may request a data export at any time via their account settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Contact for SLA Claims</h2>
            <p className="text-muted-foreground leading-relaxed">
              To report an incident or claim a service credit, contact support through the Servexa application or via your account administrator. Please include the date, duration, and description of the incident.
            </p>
          </section>

          <div className="border-t pt-6 space-y-3 text-xs text-muted-foreground">
            <p>⚠️ <strong>Important notice:</strong> This is a template SLA provided for convenience. Uptime targets should be verified against your actual infrastructure capabilities before publishing commercially. Have this reviewed by a qualified solicitor.</p>
            <p>Related documents: <a href="/terms" className="text-primary hover:underline">Terms of Service</a> · <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> · <a href="/dpa" className="text-primary hover:underline">Data Processing Agreement</a> · <a href="/aup" className="text-primary hover:underline">Acceptable Use Policy</a> · <a href="/cookies" className="text-primary hover:underline">Cookie Policy</a> · <a href="/fire-liability" className="text-primary hover:underline">Fire Protection Liability</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}
