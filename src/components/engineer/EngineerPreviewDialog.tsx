import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

type EngineerOption = { user_id: string; full_name: string };

/**
 * Admin-only dialog to enter "Preview as Engineer" mode.
 * Client-side role-view — no server impersonation.
 */
export default function EngineerPreviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { realUserRole, enterEngineerPreview } = useAuth();
  const [loading, setLoading] = useState(false);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [selected, setSelected] = useState<string>("__generic__");
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || realUserRole !== "admin") return;
    setLoading(true);
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "engineer");
      const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id))).filter(Boolean);
      if (!ids.length) {
        setEngineers([]);
        setLoading(false);
        return;
      }
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      const list: EngineerOption[] = (profs ?? [])
        .map((p: any) => ({ user_id: p.user_id, full_name: p.full_name || "Engineer" }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
      setEngineers(list);
      setLoading(false);
    })();
  }, [open, realUserRole]);

  const handleStart = () => {
    if (selected === "__generic__") {
      enterEngineerPreview(null, "Generic");
    } else {
      const eng = engineers.find((e) => e.user_id === selected);
      enterEngineerPreview(selected, eng?.full_name ?? null);
    }
    onOpenChange(false);
    // Send them to the engineer home
    navigate("/");
  };

  if (realUserRole !== "admin") return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" /> Preview as Engineer
          </DialogTitle>
          <DialogDescription>
            See the app exactly as an engineer sees it — engineer navigation, home
            screen, job list scoping and the mobile/tablet job-sheet experience.
            You stay signed in as yourself; actions are still recorded under your
            admin account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="preview-engineer">Preview scope</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="preview-engineer">
              <SelectValue placeholder="Choose engineer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__generic__">Generic engineer (no specific assignments)</SelectItem>
              {loading && (
                <div className="px-2 py-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading engineers…
                </div>
              )}
              {engineers.map((e) => (
                <SelectItem key={e.user_id} value={e.user_id}>
                  {e.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Picking a specific engineer scopes "my jobs" and page-access rules to
            that engineer, read-only where sensible.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleStart}>
            <Eye className="h-4 w-4 mr-1" /> Start preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
