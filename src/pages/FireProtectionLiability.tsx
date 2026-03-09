import servexaLogo from "@/assets/servexa-logo.png";

export default function FireProtectionLiability() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src={servexaLogo} alt="Servexa" className="h-10 rounded-lg" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Fire Protection Liability Addendum</h1>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive font-medium">Important: This addendum forms part of the Servexa Terms of Service and applies specifically to use of the platform in connection with fire protection, fire safety, and life safety systems.</p>
          </div>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Platform Purpose and Scope</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa is a field service management platform designed to assist contractors in organising, recording, and communicating their work. It provides tools for job scheduling, digital job sheets, compliance document storage, RAMS generation, and customer communications. Servexa is a record-keeping and workflow tool — it is not a regulatory compliance system, a safety certification authority, or a substitute for professional judgement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Compliance Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa does not guarantee, warrant, or represent that use of the platform will result in compliance with any applicable fire code, regulation, standard, or legislation, including but not limited to the Regulatory Reform (Fire Safety) Order 2005, BS 5839, BS 5306, BS 9999, or any other British Standard, BAFE scheme, or local authority requirement.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              The Customer and its engineers remain solely responsible for ensuring that all inspection, maintenance, and installation work meets applicable legal, regulatory, and professional standards. Servexa does not employ or supervise engineers and accepts no liability for the quality or adequacy of field work carried out by platform users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. AI-Generated Content</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa includes AI-assisted features that may generate or suggest content for RAMS (Risk Assessments and Method Statements), job briefs, maintenance alerts, and other documents. Such content is generated algorithmically and must be reviewed and verified by a competent person before use. AI-generated content:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground mt-2">
              <li>May not reflect site-specific hazards, conditions, or requirements</li>
              <li>Does not constitute professional advice</li>
              <li>Has not been reviewed or approved by a fire safety engineer or regulatory body</li>
              <li>Must be reviewed, adapted, and approved by a qualified competent person before being used in a live work situation</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Servexa expressly disclaims all liability arising from reliance on AI-generated content without appropriate human review.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Limitation of Liability — Safety-Critical Events</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by applicable law, Servexa shall not be liable for any loss, damage, injury, death, regulatory fine, or legal penalty arising from:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground mt-2">
              <li>Any fire, explosion, system failure, or safety incident at a Customer's or end-client's premises</li>
              <li>The Customer's failure to comply with fire safety laws, codes, or regulations</li>
              <li>Inaccurate, incomplete, or falsified records entered into the platform by the Customer or its users</li>
              <li>Reliance on AI-generated RAMS, risk assessments, or maintenance recommendations without independent verification</li>
              <li>Any system downtime occurring during a compliance deadline or inspection period</li>
              <li>Loss of compliance records due to user error, account deletion, or failure to export data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Inspection and Certification Records</h2>
            <p className="text-muted-foreground leading-relaxed">
              Records created within Servexa, including digital job sheets, inspection records, and certificates, reflect the information entered by the user. Servexa does not independently verify the accuracy of inspection data, test results, or certification status. The Customer is responsible for ensuring that all records accurately reflect the work performed and conditions found on site.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Digital signatures and customer sign-offs facilitated through the platform are tools for workflow management. They do not constitute formal legal or regulatory certification unless the relevant regulatory framework specifically permits electronic signatures in that context. The Customer is responsible for ensuring that digital signatures meet any requirements of their applicable regulatory scheme.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention and Record-Keeping</h2>
            <p className="text-muted-foreground leading-relaxed">
              Fire safety legislation may require records to be retained for specified periods. The Customer is responsible for understanding and meeting these retention requirements. While Servexa retains data as described in the Privacy Policy and DPA, the Customer should maintain independent copies of all safety-critical records. Upon termination of the Service, the Customer has 30 days to export their data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Professional Responsibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              Users of Servexa who are engaged in fire protection work should hold appropriate qualifications, accreditations, and insurance for the work they undertake. Servexa does not verify the credentials, qualifications, or insurance status of its users or their engineers. The existence of a Servexa account does not constitute endorsement of any contractor's competence or compliance status.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Indemnity</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Customer agrees to indemnify and hold harmless Servexa, its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including legal fees) arising from: (a) the Customer's breach of this Addendum or the Terms of Service; (b) negligent or unlawful conduct by the Customer's engineers or staff; (c) the Customer's failure to comply with applicable fire safety laws or regulations; or (d) reliance on platform-generated content without appropriate professional review.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Addendum is governed by the laws of England and Wales and forms part of the Terms of Service. In the event of conflict between this Addendum and the Terms of Service, this Addendum shall prevail with respect to fire protection and safety-critical matters.
            </p>
          </section>

          <div className="border-t pt-6 space-y-3 text-xs text-muted-foreground">
            <p>⚠️ <strong>Important notice:</strong> This is a template addendum. Fire safety law is complex and liability exposure is significant. You should have this reviewed by a solicitor with experience in fire safety, construction, or professional indemnity before commercial use.</p>
            <p>Related documents: <a href="/terms" className="text-primary hover:underline">Terms of Service</a> · <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> · <a href="/dpa" className="text-primary hover:underline">Data Processing Agreement</a> · <a href="/aup" className="text-primary hover:underline">Acceptable Use Policy</a> · <a href="/sla" className="text-primary hover:underline">Service Level Agreement</a> · <a href="/cookies" className="text-primary hover:underline">Cookie Policy</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}
