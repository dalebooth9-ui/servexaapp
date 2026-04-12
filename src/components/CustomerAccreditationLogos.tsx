import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Loader2, Trash2, Award } from "lucide-react";

interface Props {
  customerId: string;
}

export default function CustomerAccreditationLogos({ customerId }: Props) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [logos, setLogos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = userRole === "admin";

  useEffect(() => {
    supabase
      .from("customers")
      .select("accreditation_logos")
      .eq("id", customerId)
      .single()
      .then(({ data }) => {
        setLogos((data as any)?.accreditation_logos || []);
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

  if (!isAdmin && logos.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardContent className="pt-5">
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
            No accreditation logos uploaded. These appear on PDF reports for this customer.
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
      </CardContent>
    </Card>
  );
}
