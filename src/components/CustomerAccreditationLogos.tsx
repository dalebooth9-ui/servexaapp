import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Trash2, Award, Palette } from "lucide-react";

interface Props {
  customerId: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function CustomerAccreditationLogos({ customerId }: Props) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [logos, setLogos] = useState<string[]>([]);
  const [brandColour, setBrandColour] = useState<string>("");
  const [savingColour, setSavingColour] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = userRole === "admin";

  useEffect(() => {
    supabase
      .from("customers")
      .select("accreditation_logos, brand_colour")
      .eq("id", customerId)
      .single()
      .then(({ data }) => {
        const row = data as any;
        setLogos(row?.accreditation_logos || []);
        setBrandColour(row?.brand_colour || "");
      });
  }, [customerId]);

  const handleUpload = async (file: File) => {
    if (!user) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const path = `${customerId}/accreditation/${Date.now()}${ext}`;
    const { error: upErr } = await supabase.storage.from("customer-logos").upload(path, file, { upsert: true });
    if (upErr) {
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("customer-logos").getPublicUrl(path);
    const updated = [...logos, publicUrl];
    await supabase.from("customers").update({ accreditation_logos: updated } as any).eq("id", customerId);
    setLogos(updated);
    toast({ title: "Accreditation logo added" });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleRemove = async (url: string) => {
    const updated = logos.filter((l) => l !== url);
    await supabase.from("customers").update({ accreditation_logos: updated } as any).eq("id", customerId);
    // Try to remove from storage
    const storagePath = url.split("/customer-logos/").pop();
    if (storagePath) {
      await supabase.storage.from("customer-logos").remove([decodeURIComponent(storagePath)]);
    }
    setLogos(updated);
    toast({ title: "Accreditation logo removed" });
  };

  const saveBrandColour = async (value: string) => {
    const next = value.trim();
    if (next && !HEX_RE.test(next)) {
      toast({
        title: "Invalid colour",
        description: "Use a hex value like #c8102e.",
        variant: "destructive",
      });
      return;
    }
    setSavingColour(true);
    const { error } = await supabase
      .from("customers")
      .update({ brand_colour: next || null } as any)
      .eq("id", customerId);
    setSavingColour(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "Brand colour saved" : "Brand colour cleared" });
  };

  if (!isAdmin && logos.length === 0 && !brandColour) return null;

  return (
    <Card className="mb-6">
      <CardContent className="pt-5 space-y-6">
        {/* Brand colour picker */}
        {isAdmin && (
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
              <Palette className="h-4 w-4 text-primary" />
              Main brand colour
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Used to tint the flame watermark on this customer's PDFs. Leave empty for a neutral grey.
            </p>
            <div className="flex items-center gap-2 max-w-sm">
              <input
                type="color"
                aria-label="Brand colour swatch"
                value={HEX_RE.test(brandColour) ? brandColour : "#c8102e"}
                onChange={(e) => setBrandColour(e.target.value)}
                onBlur={(e) => saveBrandColour(e.target.value)}
                className="h-9 w-14 rounded border cursor-pointer bg-transparent p-0"
              />
              <Input
                className="font-mono"
                placeholder="#c8102e"
                value={brandColour}
                onChange={(e) => setBrandColour(e.target.value)}
                onBlur={(e) => saveBrandColour(e.target.value)}
              />
              {savingColour && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {brandColour && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setBrandColour(""); saveBrandColour(""); }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              Accreditation Logos
            </h3>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                Add Logo
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
            />
          </div>
          {logos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No accreditation logos uploaded. Only this customer's own accreditations appear on their branded PDFs — Viva Fire's badges never appear on another company's paperwork.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {logos.map((url) => (
                <div key={url} className="relative group">
                  <img
                    src={url}
                    alt="Accreditation"
                    className="h-14 w-auto rounded border bg-white p-1 object-contain"
                  />
                  {isAdmin && (
                    <button
                      onClick={() => handleRemove(url)}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
