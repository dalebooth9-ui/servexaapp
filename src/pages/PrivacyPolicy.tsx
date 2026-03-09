import servexaLogo from "@/assets/servexa-logo.png";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src={servexaLogo} alt="Servexa" className="h-10 rounded-lg" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa ("we", "us", "our") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your data when you use our field service management platform. We comply with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Data We Collect</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">We collect the following categories of personal data:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li><strong>Account data:</strong> Name, email address, password (hashed), role</li>
              <li><strong>Profile data:</strong> Phone number, WhatsApp number, signature</li>
              <li><strong>Location data:</strong> GPS coordinates when engineers are clocked in (with consent)</li>
              <li><strong>Job data:</strong> Job records, submissions, photos, field reports you create</li>
              <li><strong>Communication data:</strong> Messages sent through the platform</li>
              <li><strong>Usage data:</strong> Log files, IP addresses, browser type, pages visited</li>
              <li><strong>Customer data:</strong> Customer and site records you enter into the system</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Legal Basis for Processing</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">We process your personal data on the following legal bases:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li><strong>Contract performance:</strong> Processing necessary to provide the Service under our agreement with you</li>
              <li><strong>Legitimate interests:</strong> Security monitoring, fraud prevention, service improvement</li>
              <li><strong>Consent:</strong> Location tracking (engineers may withdraw consent at any time)</li>
              <li><strong>Legal obligation:</strong> Compliance with applicable laws and regulations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>To provide, operate, and maintain the Service</li>
              <li>To process job assignments, scheduling, and field reports</li>
              <li>To send notifications, reminders, and reports</li>
              <li>To enable customer communications and sign-off workflows</li>
              <li>To improve and personalise the Service</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data Sharing</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">We do not sell your personal data. We may share data with:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li><strong>Supabase:</strong> Our cloud database and authentication provider (EU/US data centres)</li>
              <li><strong>Resend:</strong> Email delivery service for notifications and reports</li>
              <li><strong>Twilio:</strong> WhatsApp/SMS messaging integration (if configured)</li>
              <li><strong>Xero:</strong> Accounting integration (if connected)</li>
              <li><strong>Google Maps:</strong> Location mapping features</li>
              <li><strong>Law enforcement:</strong> Where required by law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your data for as long as your account is active or as needed to provide the Service. Job records and compliance documents may be retained for up to 7 years to meet legal obligations. Location data is retained for 90 days. You may request deletion of your data by contacting your account administrator.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Your Rights (UK GDPR)</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">Under UK GDPR, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Rectification:</strong> Correct inaccurate or incomplete data</li>
              <li><strong>Erasure:</strong> Request deletion of your data ("right to be forgotten")</li>
              <li><strong>Portability:</strong> Receive your data in a portable format</li>
              <li><strong>Restriction:</strong> Request limitation of processing</li>
              <li><strong>Object:</strong> Object to processing based on legitimate interests</li>
              <li><strong>Withdraw consent:</strong> For consent-based processing (e.g. location tracking)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              To exercise these rights, contact your account administrator. You also have the right to lodge a complaint with the Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ico.org.uk</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement appropriate technical and organisational measures to protect your personal data, including encryption in transit (TLS), encrypted storage, role-based access controls, and Row Level Security on all database tables. However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use essential cookies for authentication and session management. We do not use tracking or advertising cookies. The Service uses localStorage for offline caching of job data to enable field use without internet connectivity.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. International Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Some of our service providers are located outside the UK/EEA. Where data is transferred internationally, we ensure adequate safeguards are in place in accordance with UK GDPR, including Standard Contractual Clauses where applicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Changes to this Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of significant changes by email or through the Service. The date at the top of this page indicates when the policy was last updated.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For privacy-related queries or to exercise your rights, please contact your account administrator or reach out through the application.
            </p>
          </section>

          <div className="border-t pt-6 text-xs text-muted-foreground">
            <p>⚠️ <strong>Important notice:</strong> These are placeholder privacy policies for convenience. You should have these reviewed by a qualified solicitor or data protection officer before commercial use, particularly if processing employee or customer personal data at scale.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
