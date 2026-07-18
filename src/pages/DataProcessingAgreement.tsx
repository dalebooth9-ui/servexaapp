export default function DpaPolicy() {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src="/servexa-logo.png" alt="Servexa" className="h-10 w-10 rounded-xl" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Data Processing Agreement</h1>
          <p className="text-sm text-muted-foreground">Last updated: {date}</p>
        </div>
        <div className="space-y-6 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Parties</h2>
            <p className="text-muted-foreground leading-relaxed">This Data Processing Agreement ("DPA") is entered into between Servexa ("Data Processor") and the customer organisation ("Data Controller") using the Servexa platform. This DPA forms part of the Terms of Service and governs the processing of personal data on behalf of the Data Controller.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">2. Scope of Processing</h2>
            <p className="text-muted-foreground leading-relaxed">Servexa processes personal data solely to provide the field service management platform as described in the Terms of Service. Processing activities include: storage of engineer and customer contact details, job records, compliance documents, and location data for engineers who have consented to tracking.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">3. Data Controller Obligations</h2>
            <p className="text-muted-foreground leading-relaxed">The Data Controller warrants that it has a lawful basis for sharing personal data with Servexa, has provided appropriate privacy notices to data subjects, and will only instruct Servexa to process data in accordance with applicable data protection law, including UK GDPR and the Data Protection Act 2018.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data Processor Obligations</h2>
            <p className="text-muted-foreground leading-relaxed">Servexa shall: process data only on documented instructions from the Controller; ensure personnel authorised to process data are bound by confidentiality obligations; implement appropriate technical and organisational security measures; assist the Controller in responding to data subject rights requests; delete or return all personal data upon termination of the service.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">5. Sub-processors</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">Servexa engages the following sub-processors to deliver the platform. Servexa will provide 30 days' notice of any changes to this list and shall impose equivalent data protection obligations on all sub-processors.</p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground leading-relaxed">
              <li><span className="text-foreground font-medium">Supabase</span> — database, authentication and file storage (EU / US regions).</li>
              <li><span className="text-foreground font-medium">Lovable</span> — application hosting and platform infrastructure (EU / US).</li>
              <li><span className="text-foreground font-medium">Resend</span> — transactional and notification email delivery (US).</li>
              <li><span className="text-foreground font-medium">Stripe</span> — subscription billing and payment processing (US / EU).</li>
              <li><span className="text-foreground font-medium">Twilio</span> — WhatsApp and SMS messaging delivery (US / EU).</li>
              <li><span className="text-foreground font-medium">Google Maps Platform</span> — map tiles, geocoding and route data (US / EU).</li>
              <li><span className="text-foreground font-medium">what3words</span> — precise location reference lookups (UK / EU).</li>
              <li><span className="text-foreground font-medium">Google (Gemini) &amp; OpenAI, via the Lovable AI Gateway</span> — AI features such as RAMS auto-fill, customer report drafting, predictive maintenance and AI assistance. Prompt content may include job, asset and site data submitted by users. Inputs are not used to train these providers' foundation models. Processing occurs in US / EU regions.</li>
              <li><span className="text-foreground font-medium">ElevenLabs</span> — voice-to-text transcription for engineer voice notes (US / EU).</li>
              <li><span className="text-foreground font-medium">Firecrawl</span> — automated monitoring of public British Standards revision pages (US).</li>
              <li><span className="text-foreground font-medium">Accounting integrations (engaged only when the customer connects them)</span> — Xero, QuickBooks, Sage, FreeAgent, FreshBooks for invoice and contact synchronisation.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">6. International Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">Where personal data is transferred outside the UK or EEA, Servexa ensures appropriate safeguards are in place, including Standard Contractual Clauses or reliance on adequacy decisions as applicable.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">7. Security Incidents</h2>
            <p className="text-muted-foreground leading-relaxed">Servexa will notify the Data Controller without undue delay, and no later than 72 hours after becoming aware, of any personal data breach that is likely to result in a risk to the rights and freedoms of individuals.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">8. Audit Rights</h2>
            <p className="text-muted-foreground leading-relaxed">Servexa shall make available all information necessary to demonstrate compliance with this DPA and allow for audits conducted by the Controller or its designated auditor, subject to reasonable notice and confidentiality obligations.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">9. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">This DPA shall be governed by and construed in accordance with the laws of England and Wales, and the parties submit to the exclusive jurisdiction of the courts of England and Wales for any disputes arising out of or in connection with this DPA.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">For DPA enquiries, contact our Data Protection Officer at: <a href="mailto:privacy@servexaapp.com" className="underline underline-offset-2 hover:text-foreground transition-colors">privacy@servexaapp.com</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
