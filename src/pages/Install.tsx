import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, CheckCircle2, Wifi } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

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

    // Check if already in standalone mode
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Smartphone className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Install FieldReport</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Get the full mobile experience — receive jobs, submit reports, and share your live location.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            {[
              { icon: Download, text: "Receive job assignments instantly" },
              { icon: Wifi, text: "Works offline — sync when back online" },
              { icon: CheckCircle2, text: "Submit photos, reports & location" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">Scan to open on your phone</p>
            <QRCodeSVG
              value="https://field-aid-box.lovable.app/install"
              size={160}
              bgColor="transparent"
              fgColor="hsl(var(--foreground))"
              level="M"
            />
          </div>

          {installed ? (
            <div className="rounded-lg bg-primary/10 p-4 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-primary mb-2" />
              <p className="font-medium text-primary">App Installed!</p>
              <p className="text-xs text-muted-foreground mt-1">You can now access FieldReport from your home screen.</p>
            </div>
          ) : deferredPrompt ? (
            <Button className="w-full" size="lg" onClick={handleInstall}>
              <Download className="mr-2 h-4 w-4" /> Install App
            </Button>
          ) : (
            <div className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
              <p className="font-medium mb-1">To install on your device:</p>
              <p><strong>iPhone:</strong> Tap Share → "Add to Home Screen"</p>
              <p><strong>Android:</strong> Tap ⋮ menu → "Install App"</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
