import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useLocationSharingSettings } from "@/hooks/useLocationSharingSettings";
import { getSelfOptIn, setSelfOptIn } from "@/hooks/useEngineerLocation";
import type { SharingRole } from "@/lib/locationSharing";

export default function LocationSharingSettings() {
  const { settings, loaded, error, save, canChange } = useLocationSharingSettings();
  const [saving, setSaving] = useState(false);
  const [self, setSelf] = useState(getSelfOptIn());
  if (!canChange) return null;
  const s = settings ?? { enabled: true, roles: ["engineer"] as SharingRole[] };
  const update = async (next: typeof s) => {
    setSaving(true);
    try { await save(next); toast.success("Location sharing setting saved"); }
    catch { toast.error("Could not save the location sharing setting. Please try again."); }
    finally { setSaving(false); }
  };
  const toggleRole = (role: SharingRole, on: boolean) =>
    update({ ...s, roles: on ? Array.from(new Set([...s.roles, role])) : s.roles.filter((r) => r !== role) });
  const disabled = !loaded || saving || Boolean(error);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Location sharing</CardTitle>
        <CardDescription>Phones share their location with office admins while Servexa is open, for job planning on the Planner.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="loc-enabled">Location sharing for the whole company</Label>
          <Switch id="loc-enabled" checked={s.enabled} disabled={disabled} onCheckedChange={(v) => update({ ...s, enabled: v })} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Who is asked to share</p>
          {([["engineer", "Engineers"], ["admin", "Office staff (admins)"]] as const).map(([role, label]) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <Checkbox checked={s.roles.includes(role)} disabled={disabled || !s.enabled} onCheckedChange={(v) => toggleRole(role, v === true)} />
              {label}
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 border-t pt-4">
          <Label htmlFor="loc-self">Share my own location from this device</Label>
          <Switch id="loc-self" checked={self} disabled={!s.enabled} onCheckedChange={(v) => { setSelf(v); setSelfOptIn(v); }} />
        </div>
        {error && <p className="text-sm text-destructive">Setting unavailable. Please try again.</p>}
      </CardContent>
    </Card>
  );
}
