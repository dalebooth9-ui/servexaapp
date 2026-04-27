import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Droplet, Save, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  useWatermarkSettings,
  DEFAULT_WATERMARK_SETTINGS,
  type WatermarkMode,
  type WatermarkSettings,
} from "@/hooks/useWatermarkSettings";

const MODE_DESCRIPTIONS: Record<WatermarkMode, string> = {
  tinted: "Use the customer's brand colour to tint the Viva flame.",
  untinted: "Render the original grey Viva flame on every page.",
  none: "Hide the watermark and accreditation logos entirely.",
};

export default function WatermarkSettings() {
  const { settings: saved, loaded, save } = useWatermarkSettings();
  const [draft, setDraft] = useState<WatermarkSettings>(saved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  if (!loaded) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }

  const dirty = draft.mode !== saved.mode || draft.opacity !== saved.opacity;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await save(draft);
    setSaving(false);
    if (error) toast.error("Failed to save: " + error);
    else toast.success("PDF watermark settings saved");
  };

  const handleReset = () => setDraft(DEFAULT_WATERMARK_SETTINGS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplet className="h-5 w-5" /> PDF Watermark
        </CardTitle>
        <CardDescription>
          Controls the Viva flame watermark and the accreditation logo row on every generated PDF.
          Both follow the same opacity so they always blend together. Applies workspace-wide.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Mode</Label>
          <RadioGroup
            value={draft.mode}
            onValueChange={(v) => setDraft({ ...draft, mode: v as WatermarkMode })}
            className="grid gap-2"
          >
            {(Object.keys(MODE_DESCRIPTIONS) as WatermarkMode[]).map((m) => (
              <Label
                key={m}
                htmlFor={`wm-mode-${m}`}
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-accent/40"
              >
                <RadioGroupItem id={`wm-mode-${m}`} value={m} className="mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium capitalize">{m}</p>
                  <p className="text-xs text-muted-foreground">{MODE_DESCRIPTIONS[m]}</p>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {draft.mode !== "none" && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Watermark opacity</Label>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {Math.round(draft.opacity * 100)}%
                </span>
              </div>
              <Slider
                value={[draft.opacity]}
                min={0}
                max={0.3}
                step={0.01}
                onValueChange={([v]) => setDraft({ ...draft, opacity: v })}
              />
              <p className="text-xs text-muted-foreground">
                Recommended 8–12% for the Viva flame watermark.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Accreditation logo opacity</Label>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {Math.round(draft.accreditationOpacity * 100)}%
                </span>
              </div>
              <Slider
                value={[draft.accreditationOpacity]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([v]) => setDraft({ ...draft, accreditationOpacity: v })}
              />
              <p className="text-xs text-muted-foreground">
                Controls the footer accreditation row independently from the watermark. 100% = fully solid.
              </p>
            </div>
          </>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save settings
          </Button>
          <Button variant="ghost" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
