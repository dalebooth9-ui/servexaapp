import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import ProfileSignatureCapture from "@/components/ProfileSignatureCapture";
import VehicleCheckHistory from "@/components/VehicleCheckHistory";

export default function MyProfile() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, phone, whatsapp_number")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setFullName(data.full_name || "");
          setPhone(data.phone || "");
          setWhatsapp(data.whatsapp_number || "");
        }
      });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone, whatsapp_number: whatsapp })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile saved" });
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">My Profile</h1>
      </div>

      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div>
          <Label>Email</Label>
          <Input value={user.email || ""} disabled />
        </div>
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="wa">WhatsApp number</Label>
          <Input id="wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="rounded-2xl border bg-card p-5 space-y-3">
        <h2 className="font-semibold">My signature</h2>
        <ProfileSignatureCapture userId={user.id} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold px-1">Vehicle check history</h2>
        <VehicleCheckHistory />
      </div>
    </div>
  );
}
