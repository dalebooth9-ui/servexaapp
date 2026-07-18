export default function CookiesPolicy() {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src="/servexa-logo.png" alt="Servexa" className="h-10 w-10 rounded-xl" />
            <span className="text-xl font-bold">Servexa</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Cookie Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {date}</p>
        </div>
        <div className="space-y-6 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. What Are Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">Cookies are small text files placed on your device by websites you visit. They are widely used to make websites work efficiently, to remember preferences, and to provide information to website owners. Servexa uses cookies and similar technologies (such as localStorage) to operate and improve the platform.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">2. Cookies We Use</h2>
            <div className="space-y-3 text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Essential Cookies</p>
                <p className="leading-relaxed">These are strictly necessary for the platform to function. They include authentication session tokens (provided by Supabase) that keep you logged in, and local storage keys for offline data sync. These cannot be disabled without breaking the service.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Preference Cookies</p>
                <p className="leading-relaxed">We store your navigation preferences (sidebar order, collapsed sections) in localStorage to personalise your experience. These do not contain personal data.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Analytics Cookies</p>
                <p className="leading-relaxed">With your consent, we collect anonymous usage data to understand how the platform is used and to improve it. This data is aggregated and not linked to your identity.</p>
              </div>
            </div>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">3. Cookies We Do Not Use</h2>
            <p className="text-muted-foreground leading-relaxed">We do not use advertising or tracking cookies. We do not share cookie data with advertising networks or third-party marketers. We do not use cross-site tracking technologies.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">4. Third-Party Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">Some third-party services integrated into Servexa may set their own cookies, including Stripe (payment processing) and Google Maps (location features). These are subject to the respective third parties' privacy policies.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">5. Managing Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">You can control cookies through your browser settings. Please note that disabling essential cookies will prevent you from logging in or using core platform features. To clear your consent preference, clear your browser's localStorage for this site.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">6. Your Consent</h2>
            <p className="text-muted-foreground leading-relaxed">When you first visit Servexa, you are presented with a cookie consent banner. By clicking "Accept all" you consent to essential and analytics cookies. By clicking "Essential only" you consent to essential cookies only. You may withdraw consent at any time by clearing your browser storage.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-3">7. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">For questions about our use of cookies, contact us at: <a href="mailto:privacy@servexaapp.com" className="underline underline-offset-2 hover:text-foreground transition-colors">privacy@servexaapp.com</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
