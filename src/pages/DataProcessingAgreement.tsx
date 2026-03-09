import servexaLogo from "@/assets/servexa-logo.png";

export default function DataProcessingAgreement() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src={servexaLogo} alt="Servexa" className="h-10 rounded-lg" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Data Processing Agreement</h1>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Parties and Purpose</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Data Processing Agreement ("DPA") is entered into between Servexa ("Data Processor", "we", "us") and the organisation subscribing to the Servexa platform ("Data Controller", "you", "Customer"). This DPA forms part of the Terms of Service and governs the processing of personal data by Servexa on behalf of the Customer, in accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Definitions</h2>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li><strong>Personal Data:</strong> Any information relating to an identified or identifiable natural person as defined under UK GDPR Article 4(1)</li>
              <li><strong>Processing:</strong> Any operation performed on personal data, as defined under UK GDPR Article 4(2)</li>
              <li><strong>Data Controller:</strong> The Customer who determines the purposes and means of processing personal data</li>
              <li><strong>Data Processor:</strong> Servexa, which processes personal data on behalf of the Data Controller</li>
              <li><strong>Sub-processor:</strong> Any third party engaged by Servexa to process personal data</li>
              <li><strong>Service:</strong> The Servexa field service management platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Subject Matter and Nature of Processing</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">Servexa processes personal data solely to provide the Service as described in the Terms of Service. The categories of personal data processed include:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Engineer and employee data (name, email, phone, GPS location, signatures)</li>
              <li>Customer contact data (name, email, phone, address)</li>
              <li>Job and field service records (visit data, photos, reports, signatures)</li>
              <li>Compliance and certification documentation</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">The legal basis for processing is performance of the contract between Servexa and the Customer (UK GDPR Article 6(1)(b)) and legitimate interests (Article 6(1)(f)).</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Obligations of the Data Processor</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">Servexa agrees to:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Process personal data only on documented instructions from the Data Controller, including as set out in this DPA and the Terms of Service</li>
              <li>Ensure that persons authorised to process personal data are subject to appropriate confidentiality obligations</li>
              <li>Implement appropriate technical and organisational security measures as required by UK GDPR Article 32</li>
              <li>Assist the Data Controller in responding to requests from data subjects exercising their rights under UK GDPR</li>
              <li>Notify the Data Controller without undue delay (and within 72 hours where feasible) upon becoming aware of a personal data breach</li>
              <li>Delete or return all personal data upon termination of the Service, at the Data Controller's election</li>
              <li>Make available all information necessary to demonstrate compliance with obligations under Article 28 UK GDPR</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Sub-processors</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">The Customer provides general written authorisation for Servexa to engage the following sub-processors:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border border-border rounded-lg overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Sub-processor</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Purpose</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="px-4 py-2">Supabase</td><td className="px-4 py-2">Database, authentication, file storage</td><td className="px-4 py-2">EU / US</td></tr>
                  <tr><td className="px-4 py-2">Resend</td><td className="px-4 py-2">Transactional email delivery</td><td className="px-4 py-2">US</td></tr>
                  <tr><td className="px-4 py-2">Twilio</td><td className="px-4 py-2">WhatsApp / SMS messaging (if enabled)</td><td className="px-4 py-2">US</td></tr>
                  <tr><td className="px-4 py-2">Google Maps</td><td className="px-4 py-2">Location mapping and geocoding</td><td className="px-4 py-2">US</td></tr>
                  <tr><td className="px-4 py-2">Xero</td><td className="px-4 py-2">Accounting integration (if connected)</td><td className="px-4 py-2">NZ / US</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground leading-relaxed mt-2">Servexa will notify the Data Controller of any intended changes to sub-processors, giving the Data Controller the opportunity to object. All sub-processors are subject to data processing terms no less protective than this DPA.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. International Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Where personal data is transferred outside the UK/EEA, Servexa ensures that appropriate safeguards are in place in accordance with UK GDPR Chapter V, including Standard Contractual Clauses (SCCs) or the UK International Data Transfer Agreement (IDTA) where applicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Security Measures</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">Servexa implements the following technical and organisational measures:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Encryption in transit (TLS 1.2+) for all data transmissions</li>
              <li>Encryption at rest for stored personal data</li>
              <li>Row Level Security (RLS) enforcing strict per-organisation data isolation</li>
              <li>Role-based access controls limiting data access to authorised personnel</li>
              <li>Regular security assessments and vulnerability monitoring</li>
              <li>Access logs and audit trails for sensitive operations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Data Subject Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa will assist the Data Controller in fulfilling its obligations to respond to data subject rights requests (access, rectification, erasure, portability, restriction, objection) within the timeframes required by UK GDPR. The Data Controller remains responsible for communicating with data subjects.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Data Breach Notification</h2>
            <p className="text-muted-foreground leading-relaxed">
              In the event of a personal data breach affecting Customer data, Servexa will notify the Data Controller without undue delay and in any event within 72 hours of becoming aware of the breach. Notification will include the nature of the breach, categories and approximate number of data subjects affected, likely consequences, and measures taken or proposed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Audit Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa will make available all information necessary to demonstrate compliance with this DPA and will allow for and contribute to audits conducted by the Data Controller or a mandated auditor, subject to reasonable notice and confidentiality requirements. Servexa may satisfy audit obligations through the provision of third-party certifications or audit reports.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Termination and Data Return</h2>
            <p className="text-muted-foreground leading-relaxed">
              Upon termination of the Service, Servexa will, at the Data Controller's choice, delete or return all personal data within 30 days. Servexa may retain anonymised or aggregated data that does not constitute personal data. Servexa will provide written confirmation of deletion upon request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              This DPA is governed by the laws of England and Wales and shall be construed in accordance therewith. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For data protection queries, to exercise rights, or to raise concerns regarding this DPA, please contact your account administrator or reach out through the Servexa application.
            </p>
          </section>

          <div className="border-t pt-6 space-y-3 text-xs text-muted-foreground">
            <p>⚠️ <strong>Important notice:</strong> This is a template DPA provided for convenience. You should have this reviewed and finalised by a qualified solicitor or data protection officer before commercial use. Consider appointing a Data Protection Officer (DPO) if required by UK GDPR Article 37.</p>
            <p>Related documents: <a href="/terms" className="text-primary hover:underline">Terms of Service</a> · <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> · <a href="/aup" className="text-primary hover:underline">Acceptable Use Policy</a> · <a href="/sla" className="text-primary hover:underline">Service Level Agreement</a> · <a href="/cookies" className="text-primary hover:underline">Cookie Policy</a> · <a href="/fire-liability" className="text-primary hover:underline">Fire Protection Liability</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}
