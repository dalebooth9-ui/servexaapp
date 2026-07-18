export default function AupPolicy() {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src="/servexa-logo.png" alt="Servexa" className="h-10 w-10 rounded-xl" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Acceptable Use Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {date}</p>
        </div>
        <div className="space-y-6 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Purpose</h2>
            <p className="text-muted-foreground leading-relaxed">This Acceptable Use Policy ("AUP") sets out the rules governing use of the Servexa platform. By using Servexa, you agree to comply with this policy. Violation may result in suspension or termination of your account.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">2. Permitted Use</h2>
            <p className="text-muted-foreground leading-relaxed">Servexa is provided solely for legitimate field service management purposes including job scheduling, compliance tracking, customer management, invoicing, and related operational activities. You may only use the platform for lawful business purposes.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">3. Prohibited Activities</h2>
            <p className="text-muted-foreground leading-relaxed">You must not use the platform to: upload or transmit unlawful, harmful, or offensive content; violate any applicable laws or regulations; infringe third-party intellectual property rights; distribute malware or attempt to compromise system security; scrape or harvest data without authorisation; impersonate any person or entity; use the service to send unsolicited bulk communications.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data Integrity</h2>
            <p className="text-muted-foreground leading-relaxed">You are responsible for the accuracy and legality of data you input into the platform. You must not enter false, misleading, or fabricated compliance records, job sheets, or certificates.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">5. Account Security</h2>
            <p className="text-muted-foreground leading-relaxed">You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. You must notify us immediately of any unauthorised use at <a href="mailto:privacy@servexaapp.com" className="underline underline-offset-2 hover:text-foreground transition-colors">privacy@servexaapp.com</a>.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">6. Resource Usage</h2>
            <p className="text-muted-foreground leading-relaxed">You must not place excessive load on the platform infrastructure through automated scripts, bulk API requests, or other means that degrade service for other users. We reserve the right to throttle or suspend accounts that abuse system resources.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">7. Enforcement</h2>
            <p className="text-muted-foreground leading-relaxed">We reserve the right to investigate suspected violations and, where appropriate, to suspend or terminate access, remove content, and report activities to relevant authorities. We will endeavour to give notice where possible, but may act immediately where necessary to protect the platform or other users.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">8. Reporting Violations</h2>
            <p className="text-muted-foreground leading-relaxed">To report suspected violations of this AUP, contact us at: <a href="mailto:privacy@servexaapp.com" className="underline underline-offset-2 hover:text-foreground transition-colors">privacy@servexaapp.com</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
