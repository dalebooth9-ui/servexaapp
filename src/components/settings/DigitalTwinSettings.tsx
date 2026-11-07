import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useDigitalTwinSettings } from '@/hooks/useDigitalTwinSettings';
import { toast } from 'sonner';

export default function DigitalTwinSettings() {
  const { enabled, loaded, error, canChange, save } = useDigitalTwinSettings();
  const [saving, setSaving] = useState(false);
  if (!canChange) return null;
  const change = async (next: boolean) => {
    setSaving(true);
    try {
      await save(next);
      toast.success(next ? 'Digital Twin switched on for your company' : 'Digital Twin switched off for your company');
    } catch {
      toast.error('Could not save Digital Twin setting. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Digital Twin (IoT sensors)</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="digital-twin-enabled">{saving ? 'Saving…' : enabled ? 'On' : 'Off'}</Label>
          <Switch id="digital-twin-enabled" aria-label="Digital Twin (IoT sensors)" checked={enabled}
            disabled={!loaded || saving || Boolean(error)} onCheckedChange={change} />
        </div>
        {error && <p className="mt-2 text-sm text-destructive">Setting unavailable. Please try again.</p>}
      </CardContent>
    </Card>
  );
}