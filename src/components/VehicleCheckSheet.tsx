import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Car, AlertTriangle, Camera, X, CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const CHECK_ITEMS = [
  { key: "tyres", label: "Tyres (tread, pressure, condition)" },
  { key: "lights", label: "Lights (head, tail, indicators, brake)" },
  { key: "oil", label: "Oil level" },
  { key: "washer_fluid", label: "Washer fluid" },
  { key: "mirrors", label: "Mirrors clean & adjusted" },
  { key: "wipers", label: "Wipers working" },
  { key: "horn", label: "Horn" },
  { key: "brakes", label: "Brakes (feel, handbrake)" },
  { key: "fuel_charge", label: "Fuel / charge level" },
  { key: "cleanliness", label: "Vehicle clean (interior & exterior)" },
  { key: "ladder_secured", label: "Ladder secured" },
  { key: "tools_secured", label: "Tools secured" },
  { key: "fire_extinguisher", label: "Fire extinguisher in van" },
  { key: "first_aid_kit", label: "First aid kit present" },
];

type LatestCheck = {
  id: string;
  status: string;
  rejection_reason: string | null;
  vehicle_reg: string | null;
  items: Record<string, "ok" | "defect"> | null;
  has_defects: boolean;
  defect_notes: string | null;
} | null;

type Props = {
  onAccepted: () => void;
};

export default function VehicleCheckSheet({ onAccepted }: Props) {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const [latest, setLatest] = useState<LatestCheck | undefined>(undefined); // undefined = loading
  const [showForm, setShowForm] = useState(false);
  const [vehicleReg, setVehicleReg] = useState("");
  const [regTouched, setRegTouched] = useState(false);
  const [mileage, setMileage] = useState("");
  const [items, setItems] = useState<Record<string, "ok" | "defect" | null>>(
    Object.fromEntries(CHECK_ITEMS.map((i) => [i.key, null]))
  );
  const [defectNotes, setDefectNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const regKey = user ? `vfc_reg_${user.id}` : null;

  const loadLatest = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("vehicle_checks")
      .select("id, status, rejection_reason, vehicle_reg, items, has_defects, defect_notes")
      .eq("engineer_id", user.id)
      .eq("check_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest((data as any) ?? null);
    if (data?.status === "accepted") onAccepted();
    // Prefill reg from localStorage if no check submitted yet today
    if (!data && regKey) {
      const saved = localStorage.getItem(regKey);
      if (saved) setVehicleReg(saved);
    }
  };

  useEffect(() => {
    loadLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime: react to admin review
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("vehicle-checks-self")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_checks", filter: `engineer_id=eq.${user.id}` },
        () => loadLatest()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Prefill from latest (rejected) check when opening form
  const startResubmit = () => {
    if (latest) {
      setVehicleReg(latest.vehicle_reg || "");
      if (latest.items) {
        setItems({
          ...Object.fromEntries(CHECK_ITEMS.map((i) => [i.key, null])),
          ...latest.items,
        });
      }
      setDefectNotes(latest.defect_notes || "");
    }
    setShowForm(true);
  };

  const hasDefects = Object.values(items).some((v) => v === "defect");
  const allAnswered = Object.values(items).every((v) => v !== null);

  const setItem = (key: string, value: "ok" | "defect") => {
    setItems((prev) => ({ ...prev, [key]: value }));
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPhotos((prev) => [...prev, ...files].slice(0, 6));
    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!vehicleReg.trim()) {
      toast.error("Vehicle registration is required");
      return;
    }
    if (!allAnswered) {
      toast.error("Please complete all checks");
      return;
    }
    if (hasDefects && !defectNotes.trim()) {
      toast.error("Please describe the defect");
      return;
    }


    setSubmitting(true);
    try {
      const photoUrls: string[] = [];
      for (const photo of photos) {
        const ext = photo.name.split(".").pop();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("vehicle-checks")
          .upload(path, photo);
        if (upErr) throw upErr;
        photoUrls.push(path);
      }

      const now = new Date().toISOString();
      const { error } = await supabase.from("vehicle_checks").insert({
        engineer_id: user.id,
        check_date: today,
        vehicle_reg: vehicleReg.trim() || null,
        mileage: mileage ? parseInt(mileage) : null,
        items: items as any,
        has_defects: hasDefects,
        defect_notes: hasDefects ? defectNotes.trim() : null,
        defect_photo_urls: photoUrls,
        status: "accepted",
        submitted_at: now,
        auto_accepted_at: now,
      } as any);

      if (error) throw error;
      toast.success("Check submitted — you're all set");
      setShowForm(false);
      setPhotos([]);
      await loadLatest();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit check");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render: loading
  if (latest === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render: pending review (after submit, before form re-open)
  if (!showForm && latest && latest.status === "pending") {
    return (
      <div className="space-y-4 pb-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/15 p-2.5">
            <Car className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Daily Vehicle Check</h2>
            <p className="text-xs text-muted-foreground">Awaiting admin review</p>
          </div>
        </div>
        <Card className="p-6 text-center space-y-3">
          <Clock className="h-10 w-10 text-amber-500 mx-auto" />
          <p className="font-semibold">Your check is awaiting admin review</p>
          <p className="text-sm text-muted-foreground">
            You'll get access to today's jobs as soon as it's accepted. This page will update automatically.
          </p>
        </Card>
        <Button variant="outline" className="w-full" onClick={startResubmit}>
          <RotateCcw className="h-4 w-4 mr-2" /> Edit & resubmit
        </Button>
      </div>
    );
  }

  // ── Render: rejected, prompt to resubmit
  if (!showForm && latest && latest.status === "rejected") {
    return (
      <div className="space-y-4 pb-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-destructive/15 p-2.5">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Vehicle check rejected</h2>
            <p className="text-xs text-muted-foreground">Please correct and resubmit</p>
          </div>
        </div>
        <Card className="p-4 border-destructive/30 bg-destructive/5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Admin reason</p>
          <p className="text-sm">{latest.rejection_reason || "No reason provided."}</p>
        </Card>
        <Button onClick={startResubmit} size="lg" className="w-full h-14">
          <RotateCcw className="h-5 w-5 mr-2" /> Resubmit check
        </Button>
      </div>
    );
  }

  // ── Render: form (new submission or resubmission)
  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/15 p-2.5">
          <Car className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">
            {latest?.status === "rejected" ? "Resubmit Vehicle Check" : "Daily Vehicle Check"}
          </h2>
          <p className="text-xs text-muted-foreground">Required before viewing today's jobs</p>
        </div>
      </div>

      {latest?.status === "rejected" && latest.rejection_reason && (
        <Card className="p-3 border-destructive/30 bg-destructive/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive mb-1">
            Previous rejection
          </p>
          <p className="text-sm">{latest.rejection_reason}</p>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="reg" className="text-xs">Vehicle reg <span className="text-destructive">*</span></Label>
            <Input
              id="reg"
              value={vehicleReg}
              onChange={(e) => {
                setVehicleReg(e.target.value.toUpperCase());
                setRegTouched(true);
              }}
              onBlur={() => setRegTouched(true)}
              placeholder="AB12 CDE"
              className={`uppercase ${regTouched && !vehicleReg.trim() ? "border-destructive ring-1 ring-destructive/30 focus-visible:ring-destructive" : ""}`}
              aria-invalid={regTouched && !vehicleReg.trim()}
            />
            {regTouched && !vehicleReg.trim() && (
              <p className="text-[11px] text-destructive mt-1">Vehicle registration is required</p>
            )}
          </div>
          <div>
            <Label htmlFor="mileage" className="text-xs">Mileage</Label>
            <Input
              id="mileage"
              type="number"
              inputMode="numeric"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="123456"
            />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Walk-around checks
        </p>
        {CHECK_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center justify-between py-2 border-b last:border-0">
            <span className="text-sm flex-1 pr-2">{item.label}</span>
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setItem(item.key, "ok")}
                className={`h-9 px-3 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                  items[item.key] === "ok"
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setItem(item.key, "defect")}
                className={`h-9 px-3 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                  items[item.key] === "defect"
                    ? "bg-destructive text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                Defect
              </button>
            </div>
          </div>
        ))}
      </Card>

      {hasDefects && (
        <Card className="p-4 space-y-3 border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-semibold">Defect details required</p>
          </div>
          <Textarea
            value={defectNotes}
            onChange={(e) => setDefectNotes(e.target.value)}
            placeholder="Describe the defect(s)..."
            rows={3}
          />
          <div>
            <Label className="text-xs">Photos (optional, up to 6)</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {photos.map((p, i) => (
                <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border">
                  <img src={URL.createObjectURL(p)} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <label className="h-16 w-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer text-muted-foreground hover:border-primary hover:text-primary">
                  <Camera className="h-5 w-5" />
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </label>
              )}
            </div>
          </div>
        </Card>
      )}

      <Button
        onClick={handleSubmit}
        disabled={submitting || !vehicleReg.trim() || !allAnswered}
        size="lg"
        className="w-full h-14 text-base"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Submit check
          </>
        )}
      </Button>
      {!allAnswered && vehicleReg.trim() && (
        <p className="text-xs text-center text-muted-foreground">
          {Object.values(items).filter((v) => v === null).length} items remaining
        </p>
      )}
      {latest && (
        <Button variant="ghost" className="w-full" onClick={() => setShowForm(false)}>
          Cancel
        </Button>
      )}
    </div>
  );
}
