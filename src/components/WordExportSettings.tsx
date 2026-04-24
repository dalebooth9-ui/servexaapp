import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_WORD_EXPORT_CONFIG,
  getWordExportConfig,
  saveWordExportConfig,
  type LogoAlignment,
  type WordExportConfig,
} from "@/lib/wordExportConfig";

export function WordExportSettings() {
  const [config, setConfig] = useState<WordExportConfig>(DEFAULT_WORD_EXPORT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getWordExportConfig();
        setConfig(cfg);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveWordExportConfig(config);
      toast.success("Word export settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Word Export — Logo</CardTitle>
        <CardDescription>
          Match the Word document logo placement to your PDF reports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Logo alignment</Label>
          <Select
            value={config.logoAlignment}
            onValueChange={(v) => setConfig({ ...config, logoAlignment: v as LogoAlignment })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="spacing-before">Top spacing (twips)</Label>
            <Input
              id="spacing-before"
              type="number"
              min={0}
              value={config.logoSpacingBefore}
              onChange={(e) =>
                setConfig({ ...config, logoSpacingBefore: Math.max(0, Number(e.target.value) || 0) })
              }
            />
            <p className="text-xs text-muted-foreground">20 twips = 1pt. e.g. 240 ≈ 12pt.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="spacing-after">Bottom spacing (twips)</Label>
            <Input
              id="spacing-after"
              type="number"
              min={0}
              value={config.logoSpacingAfter}
              onChange={(e) =>
                setConfig({ ...config, logoSpacingAfter: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-width">Max logo width (px)</Label>
            <Input
              id="max-width"
              type="number"
              min={50}
              max={600}
              value={config.logoMaxWidth}
              onChange={(e) =>
                setConfig({ ...config, logoMaxWidth: Math.max(50, Number(e.target.value) || 200) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-height">Max logo height (px)</Label>
            <Input
              id="max-height"
              type="number"
              min={20}
              max={400}
              value={config.logoMaxHeight}
              onChange={(e) =>
                setConfig({ ...config, logoMaxHeight: Math.max(20, Number(e.target.value) || 80) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Logos fit within both bounds, preserving aspect ratio — keeps wide and tall logos visually consistent.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save settings
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfig(DEFAULT_WORD_EXPORT_CONFIG)}
            disabled={saving}
          >
            Reset to defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
