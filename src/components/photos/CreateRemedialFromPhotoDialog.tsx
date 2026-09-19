/**
 * CreateRemedialFromPhotoDialog — logs a remedial (defect) straight from a
 * photo, linking the photo to it and auto-tagging the photo
 * "Remedial Required".
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Wrench } from "lucide-react";
import { applyTagByName, REMEDIAL_TAG_NAME } from "@/lib/photoTags";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  /** Submission row id for the photo, when it has one. */
  submissionId?: string | null;
  /** Durable storage path for the photo (stored on the remedial). */
  photoPath?: string | null;
  previewUrl?: string | null;
  siteId?: string | null;
  onCreated?: () => void;
};

const SEVERITIES = ["critical", "high", "medium", "low"] as const;

export default function CreateRemedialFromPhotoDialog({
  open, onOpenChange, jobId, submissionId, photoPath, previewUrl, siteId, onCreated,
}: Props) {
  const { user, orgId } = useAuth();
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<string>("medium");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setDescription(""); setSeverity("medium"); }
  }, [open]);

  const save = async () => {
    const text = description.trim();
    if (!text || !user) return;
    setSaving(true);
    const title = text.length > 80 ? `${text.slice(0, 77)}…` : text;
    const { error } = await supabase.from("defects").insert({
      job_id: jobId,
      site_id: siteId || null,
      reported_by: user.id,
      title,
      description: text,
      severity,
      category: "other",
      linked_photo_url: photoPath || null,
      linked_submission_id: submissionId || null,
    } as any);
    if (error) {
      setSaving(false);
      toast({ title: "Couldn't create the remedial", description: error.message, variant: "destructive" });
      return;
    }
    if (submissionId) {
      await applyTagByName(submissionId, REMEDIAL_TAG_NAME, orgId, user.id);
    }
    setSaving(false);
    onOpenChange(false);
    toast({ title: "Remedial created from photo" });
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-orange-500" /> Create remedial from photo
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {previewUrl && (
            <img src={previewUrl} alt="Linked photo" className="h-32 w-full rounded border object-cover" />
          )}
          <div>
            <Label>What needs doing? *</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Replace damaged landing valve on 3rd floor riser"
            />
          </div>
          <div>
            <Label>Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This photo is linked to the remedial and tagged "{REMEDIAL_TAG_NAME}".
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !description.trim()}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create remedial
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
