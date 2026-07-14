import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import servexaLogo from "@/assets/servexa-logo.png";

export default function TermsOfService() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src={servexaLogo} alt="Servexa Platform" className="h-10 rounded-lg" />
            <span className="text-xl font-bold">Servexa Platform</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">
            Last updated:{" "}
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Agreement to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using Servexa Platform ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. These terms constitute a legally binding agreement between you and Servexa Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Servexa Platform is a field service management platform designed for fire protection and maintenance businesses. The Service enables job management, engineer scheduling, compliance documentation, digital job sheets, customer communications, and related field service workflows.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Use the Service in any way that violates applicable UK or international laws or regulations</li>
              <li>Upload or transmit any material that is unlawful, harmful, or offensive</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its related systems</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Collect or harvest any personally identifiable information from the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. User Accounts</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              You must be <strong>at least 18 years old</strong> to create an account or use the Service. The Service is intended for business use only and is not directed to children. We do not knowingly collect personal data from anyone under 18; if we become aware that we have done so, we will delete that data without undue delay.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorised use of your account. We reserve the right to terminate accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data, Privacy and Incorporated Policies</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              Your use of the Service is also governed by our <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>, which is incorporated into these Terms by reference. By using the Service, you consent to the collection and use of your data as described in our Privacy Policy. We process data in accordance with UK GDPR and the Data Protection Act 2018.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              These Terms expressly incorporate the following policies, each of which forms a binding part of the agreement between you and us:{" "}
              <a href="/dpa" className="text-primary hover:underline">Data Processing Agreement (DPA)</a>,{" "}
              <a href="/aup" className="text-primary hover:underline">Acceptable Use Policy (AUP)</a>,{" "}
              <a href="/sla" className="text-primary hover:underline">Service Level Agreement (SLA)</a>,{" "}
              <a href="/cookies" className="text-primary hover:underline">Cookie Policy</a>, and the{" "}
              <a href="/fire-liability" className="text-primary hover:underline">Fire Safety Liability Disclaimer</a>. In the event of any conflict between these Terms and an incorporated policy, the incorporated policy prevails on matters within its specific scope.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service and its original content, features, and functionality are owned by Servexa Platform and are protected by international copyright, trademark, and other intellectual property laws. You retain ownership of any data or content you upload to the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6a. AI-Generated Content</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              The Service includes AI-assisted features (including, without limitation, AI RAMS auto-fill, AI job briefs, AI scheduling, AI customer reports, AI predictive maintenance alerts and AI defect-to-quote drafting). AI outputs are produced by third-party large language models and are provided to you on an "as is" basis as a productivity aid only. They do not constitute professional fire safety, engineering, legal, or compliance advice.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-2">You acknowledge and agree that:</p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>
                All AI-generated content (including risk assessments, method statements, schedules, quotes and customer reports) <strong>must be reviewed, verified and approved by a competent and qualified person</strong> before being relied upon, issued to a customer, used in compliance documentation, or used to inform site work.
              </li>
              <li>
                AI outputs may be incomplete, inaccurate, out of date, or contain "hallucinated" information; you are solely responsible for confirming accuracy against current British Standards, manufacturer guidance and actual site conditions.
              </li>
              <li>
                You retain full professional and legal responsibility for any AI-generated content you adopt, sign off, export or send to a third party — adoption constitutes your representation that the content has been independently verified.
              </li>
              <li>
                To the fullest extent permitted by law, Servexa Platform and Viva Fire Protection Ltd accept no liability for any loss, damage, injury, regulatory penalty or third-party claim arising from AI-generated content used without competent human review.
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              This clause operates in addition to, and is reinforced by, the{" "}
              <a href="/fire-liability" className="text-primary hover:underline">Fire Safety Liability Disclaimer</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the fullest extent permitted by applicable law, Servexa Platform shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising from your use of the Service. Our total liability to you for any claim shall not exceed the amount paid by you to us in the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is provided "as is" and "as available" without any warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be uninterrupted, secure, or error-free.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may terminate or suspend your access to the Service immediately, without prior notice, for any reason, including breach of these Terms. Upon termination, your right to use the Service will immediately cease. You may request export of your data within 30 days of termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of England and Wales. Any disputes arising from these Terms or the Service shall be subject to the exclusive jurisdiction of the courts of England and Wales.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify users of material changes by email or prominent notice within the Service. Continued use of the Service after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms, please contact us through the application or via your account administrator.
            </p>
          </section>

          <div className="border-t pt-6 space-y-3 text-xs text-muted-foreground">
            <p>
              Related documents:{" "}
              <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> ·{" "}
              <a href="/dpa" className="text-primary hover:underline">Data Processing Agreement</a> ·{" "}
              <a href="/aup" className="text-primary hover:underline">Acceptable Use Policy</a> ·{" "}
              <a href="/sla" className="text-primary hover:underline">Service Level Agreement</a> ·{" "}
              <a href="/cookies" className="text-primary hover:underline">Cookie Policy</a> ·{" "}
              <a href="/fire-liability" className="text-primary hover:underline">Fire Protection Liability</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
