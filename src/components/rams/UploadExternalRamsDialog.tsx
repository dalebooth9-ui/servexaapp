import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UKDateInput } from "@/components/ui/uk-date-input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  EXTERNAL_RAMS_ACCEPT,
  EXTERNAL_RAMS_APPROVAL_STATUSES,
  uploadExternalRams,
} from "@/lib/externalRams";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onUploaded?: () => void;
}

/**
 * Upload a RAMS produced outside Servexa (client, principal contractor, or
 * written in Word) and attach it to the job as a full RAMS document.
 */
export default function UploadExternalRamsDialog({ open, onOpenChange, jobId, onUploaded }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<string>("approved");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setTitle("");
    setIssuedBy("");
    setApprovalStatus("approved");
    setValidUntil("");
  };

  const submit = async () => {
    if (!file || !user?.id) return;
    setBusy(true);
    const res = await uploadExternalRams({
      jobId,
      file,
      title,
      issuedBy,
      approvalStatus,
      validUntil: validUntil || null,
      userId: user.id,
    });
    setBusy(false);
    if (!res.ok) {
      toast({ title: "Upload failed", description: res.error, variant: "destructive" });
      return;
    }
    toast({
      title: "External RAMS attached",
      description: "It counts as a valid RAMS for this job, the same as a generated one.",
    });
    reset();
    onOpenChange(false);
    onUploaded?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload external RAMS</DialogTitle>
          <DialogDescription>
            For a RAMS written outside Servexa — a client's, a principal contractor's, or one done in
            Word. PDF, Word or a photo. It will satisfy this job's RAMS requirement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ext-rams-file">Document</Label>
            <Input
              id="ext-rams-file"
              type="file"
              accept={EXTERNAL_RAMS_ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ext-rams-title">Title</Label>
            <Input
              id="ext-rams-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Principal contractor RAMS — Riser works"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ext-rams-issuer">Issued by (optional)</Label>
              <Input
                id="ext-rams-issuer"
                value={issuedBy}
                onChange={(e) => setIssuedBy(e.target.value)}
                placeholder="Company name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Approval status (optional)</Label>
              <Select value={approvalStatus} onValueChange={setApprovalStatus}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {EXTERNAL_RAMS_APPROVAL_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Valid until (optional)</Label>
            <UKDateInput value={validUntil} onChange={setValidUntil} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !file}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload RAMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
