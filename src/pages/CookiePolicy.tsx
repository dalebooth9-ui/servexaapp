import servexaLogo from "@/assets/servexa-logo.png";

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src={servexaLogo} alt="Servexa" className="h-10 rounded-lg" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Cookie Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. What Are Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cookies are small text files placed on your device when you visit a website. They allow the site to remember your actions and preferences over time. Servexa uses both cookies and similar technologies such as localStorage and sessionStorage to operate the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Cookies We Use</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border border-border rounded-lg overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Cookie / Storage Key</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Purpose</th>
                    <th className="text-left px-4 py-2 font-medium text-foreground">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-2 font-mono text-xs">sb-*-auth-token</td>
                    <td className="px-4 py-2">Strictly Necessary</td>
                    <td className="px-4 py-2">Authentication session token issued by the backend</td>
                    <td className="px-4 py-2">Session / 1 week</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono text-xs">theme</td>
                    <td className="px-4 py-2">Functional</td>
                    <td className="px-4 py-2">Stores your preferred light/dark mode setting</td>
                    <td className="px-4 py-2">Persistent</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono text-xs">offline-queue-*</td>
                    <td className="px-4 py-2">Strictly Necessary</td>
                    <td className="px-4 py-2">Queues actions taken while offline for later sync</td>
                    <td className="px-4 py-2">Until synced</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Strictly Necessary Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Strictly necessary cookies are essential for the Service to function. They cannot be disabled. These include authentication tokens that keep you logged in and security cookies that protect against cross-site request forgery. No consent is required for these cookies under the UK Privacy and Electronic Communications Regulations (PECR).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Functional Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Functional cookies remember your preferences (such as dark mode) to improve your experience. They are not strictly necessary but do not track you across other websites. By continuing to use Servexa after being informed of these cookies, you consent to their use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Analytics and Tracking Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa does not currently use third-party analytics or advertising tracking cookies. If this changes, this policy will be updated and you will be given the opportunity to consent before such cookies are set.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Third-Party Cookies</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">Some features of the Service involve third-party services that may set their own cookies:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li><strong>Google Maps</strong> — When the map feature is used, Google may set cookies. See Google's <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a>.</li>
              <li><strong>Xero</strong> — If you connect Xero for accounting, Xero may set cookies during the OAuth flow. See Xero's <a href="https://www.xero.com/uk/legal/privacy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Managing Cookies</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              You can control cookies through your browser settings. Most browsers allow you to:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>View cookies currently stored on your device</li>
              <li>Delete individual or all cookies</li>
              <li>Block third-party cookies</li>
              <li>Set preferences for specific websites</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Note that disabling strictly necessary cookies will prevent you from logging in to Servexa. Deleting authentication cookies will sign you out of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              If we change the cookies we use or how we use them, we will update this page and, where required by law, obtain your consent. Continued use of the Service constitutes acceptance of this Cookie Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about our use of cookies or this policy, please contact us through the Servexa application or via your account administrator.
            </p>
          </section>

          <div className="border-t pt-6 space-y-3 text-xs text-muted-foreground">
            <p>⚠️ <strong>Important notice:</strong> This is a template Cookie Policy. If you add analytics, advertising, or additional third-party integrations, you must update this policy and implement a cookie consent mechanism (cookie banner) as required by UK PECR.</p>
            <p>Related documents: <a href="/terms" className="text-primary hover:underline">Terms of Service</a> · <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> · <a href="/dpa" className="text-primary hover:underline">Data Processing Agreement</a> · <a href="/aup" className="text-primary hover:underline">Acceptable Use Policy</a> · <a href="/sla" className="text-primary hover:underline">Service Level Agreement</a> · <a href="/fire-liability" className="text-primary hover:underline">Fire Protection Liability</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}
