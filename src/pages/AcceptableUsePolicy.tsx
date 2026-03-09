import servexaLogo from "@/assets/servexa-logo.png";

export default function AcceptableUsePolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src={servexaLogo} alt="Servexa" className="h-10 rounded-lg" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Acceptable Use Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Purpose</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Acceptable Use Policy ("AUP") governs your use of the Servexa platform and all associated services. By accessing or using Servexa, you agree to comply with this policy. Violations may result in suspension or termination of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Permitted Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">You may use Servexa solely for lawful field service management purposes, including:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Managing and scheduling fire protection and maintenance jobs</li>
              <li>Recording inspection data, compliance documentation, and engineer activity</li>
              <li>Communicating with customers and team members through provided tools</li>
              <li>Generating reports, job sheets, RAMS, and compliance records for your own business use</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Prohibited Activities</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">You must not use Servexa to:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li><strong>Falsify compliance records</strong> — You must not create, alter, or submit inspection records, certificates, or compliance documentation that misrepresent actual conditions</li>
              <li><strong>Share access credentials</strong> — Account credentials must not be shared with unauthorised individuals</li>
              <li><strong>Access other organisations' data</strong> — Attempting to view or extract data belonging to another Servexa customer is strictly prohibited</li>
              <li><strong>Circumvent security controls</strong> — You must not attempt to bypass authentication, row-level security, or other access controls</li>
              <li><strong>Upload malicious content</strong> — Uploading viruses, malware, or harmful scripts via file uploads or API calls is prohibited</li>
              <li><strong>Automate abusive requests</strong> — Scraping, excessive API polling, or denial-of-service activity is not permitted</li>
              <li><strong>Violate data protection laws</strong> — Processing personal data through Servexa in a way that violates UK GDPR, DPA 2018, or applicable data protection legislation is prohibited</li>
              <li><strong>Resell or redistribute</strong> — You may not resell, sublicense, or redistribute access to Servexa without written authorisation</li>
              <li><strong>Impersonate others</strong> — Creating accounts under false identities or impersonating another person or organisation is prohibited</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Fire Protection and Safety-Critical Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">Given the safety-critical nature of fire protection work, users are additionally prohibited from:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Submitting inspection outcomes without physically completing the relevant inspection</li>
              <li>Marking jobs as completed when work has not been carried out</li>
              <li>Using generated RAMS, risk assessments, or method statements without reviewing them for accuracy and site-specific applicability</li>
              <li>Submitting customer sign-offs without obtaining genuine authorisation from the relevant customer representative</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Servexa is a platform for recording and managing field service activities. It does not guarantee compliance with fire codes or regulations. The user is solely responsible for ensuring that all work meets applicable legal and regulatory standards.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. User Content</h2>
            <p className="text-muted-foreground leading-relaxed">
              You retain ownership of all content you upload to Servexa. By uploading content, you grant Servexa a limited licence to store and process it solely to provide the Service. You are responsible for ensuring that any content you upload does not infringe third-party rights, contain personal data that you are not authorised to process, or violate applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Monitoring and Enforcement</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa reserves the right to monitor usage to detect and investigate violations of this AUP. Upon discovery of a violation, Servexa may suspend or terminate the relevant account, remove offending content, notify law enforcement where required, and seek damages for any harm caused.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Reporting Violations</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you believe another user is violating this AUP, please report it through the application or contact your account administrator. We take all reports seriously and will investigate promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa may update this AUP at any time. Continued use of the Service after changes constitutes acceptance of the updated policy. Material changes will be notified via email or in-app notice.
            </p>
          </section>

          <div className="border-t pt-6 space-y-3 text-xs text-muted-foreground">
            <p>⚠️ <strong>Important notice:</strong> This is a template AUP provided for convenience. You should have this reviewed and finalised by a qualified solicitor before commercial use.</p>
            <p>Related documents: <a href="/terms" className="text-primary hover:underline">Terms of Service</a> · <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> · <a href="/dpa" className="text-primary hover:underline">Data Processing Agreement</a> · <a href="/sla" className="text-primary hover:underline">Service Level Agreement</a> · <a href="/cookies" className="text-primary hover:underline">Cookie Policy</a> · <a href="/fire-liability" className="text-primary hover:underline">Fire Protection Liability</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}
