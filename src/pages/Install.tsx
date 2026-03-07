import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Smartphone, CheckCircle2, Wifi, Briefcase } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import servexaLogo from "@/assets/servexa-logo.png";

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-lg">
        {/* Header band */}
        <div className="rounded-t-lg bg-primary px-6 py-8 text-center">
          <img src={servexaLogo} alt="Servexa" className="mx-auto h-12 object-contain mb-4" />
          <p className="text-primary-foreground/80 text-sm">Field Operations Platform</p>
        </div>

        <CardContent className="pt-6 pb-8 space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-bold">Install the App</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Get instant job updates, submit reports and work offline in the field.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: Briefcase, text: "Receive & manage job assignments" },
              { icon: Wifi, text: "Works offline — syncs automatically" },
              { icon: CheckCircle2, text: "Submit photos, reports & location" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <span>{text}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-2 rounded-xl border bg-muted/40 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scan to open on your phone</p>
            <QRCodeSVG
              value="https://field-aid-box.lovable.app/install"
              size={152}
              bgColor="transparent"
              fgColor="hsl(var(--foreground))"
              level="M"
            />
          </div>

          {installed ? (
            <div className="rounded-xl bg-primary/10 p-4 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-primary mb-2" />
              <p className="font-semibold text-primary">App Installed!</p>
              <p className="text-xs text-muted-foreground mt-1">Open Servexa from your home screen.</p>
            </div>
          ) : deferredPrompt ? (
            <Button className="w-full" size="lg" onClick={handleInstall}>
              <Download className="mr-2 h-4 w-4" /> Install Servexa
            </Button>
          ) : (
            <div className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Add to your home screen</p>
              <p><strong>iPhone:</strong> Tap <span className="font-medium">Share</span> → "Add to Home Screen"</p>
              <p><strong>Android:</strong> Tap <span className="font-medium">⋮ menu</span> → "Install App"</p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">Powered by Servexa</p>
    </div>
  );
}
