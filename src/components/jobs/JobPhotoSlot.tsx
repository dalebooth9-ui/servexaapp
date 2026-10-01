import { useEffect, useRef, useState } from "react";
import { Camera, Images, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import JobPhotoPickerDialog from "@/components/jobs/JobPhotoPickerDialog";
import { createSubmissionPhotoSignedUrl, type JobPhoto } from "@/lib/jobPhotos";

type Props = {
  jobId: string;
  label: string;
  photoRef?: string | null;
  busy?: boolean;
  canEdit?: boolean;
  onFile: (file: File) => void | Promise<void>;
  onJobPhoto: (photo: JobPhoto) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
  ghostUrl?: string | null;
  ghostOpacity?: number;
  /** Shows a small "Auto" tag when the slot was filled from job photos automatically. */
  autoTag?: boolean;
};

export default function JobPhotoSlot({
  jobId,
  label,
  photoRef,
  busy = false,
  canEdit = true,
  onFile,
  onJobPhoto,
  onRemove,
  ghostUrl,
  ghostOpacity = 0.3,
  autoTag = false,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const deviceRef = useRef<HTMLInputElement>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!photoRef) {
      setSignedUrl(null);
      return () => { alive = false; };
    }
    void createSubmissionPhotoSignedUrl(photoRef, jobId, 3600).then((result) => {
      if (alive) setSignedUrl(result?.signedUrl || null);
    });
    return () => { alive = false; };
  }, [photoRef, jobId]);

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void onFile(file);
    event.target.value = "";
    setReplaceOpen(false);
  };

  const sourceButtons = (
    <div className="grid gap-2 sm:grid-cols-3">
      <Button type="button" variant="outline" className="min-h-12 gap-2" disabled={busy} onClick={() => cameraRef.current?.click()}>
        <Camera className="h-4 w-4" /> Take photo
      </Button>
      <Button type="button" variant="outline" className="min-h-12 gap-2" disabled={busy} onClick={() => deviceRef.current?.click()}>
        <Upload className="h-4 w-4" /> Choose device
      </Button>
      <Button type="button" variant="outline" className="min-h-12 gap-2" disabled={busy} onClick={() => { setReplaceOpen(false); setPickerOpen(true); }}>
        <Images className="h-4 w-4" /> Job photos
      </Button>
    </div>
  );

  return (
    <div className="space-y-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInput} />
      <input ref={deviceRef} type="file" accept="image/*" className="hidden" onChange={handleInput} />

      {photoRef ? (
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => signedUrl && setPreviewOpen(true)}
            className="relative h-36 w-full overflow-hidden rounded-md border bg-muted p-0"
            aria-label={`View ${label.toLowerCase()} full size`}
          >
            {busy ? (
              <span className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Updating…</span>
            ) : signedUrl ? (
              <img src={signedUrl} alt={label} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading photo…</span>
            )}
            {!busy && autoTag && (
              <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">Auto</span>
            )}
            {!busy && ghostUrl && (
              <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary/70" style={{ opacity: ghostOpacity }}>
                <img src={ghostUrl} alt="Before reference overlay" className="h-full w-full object-cover" />
              </span>
            )}
          </Button>
          {canEdit && (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="min-h-12 gap-2" disabled={busy} onClick={() => setReplaceOpen(true)}>
                <RefreshCw className="h-4 w-4" /> Replace
              </Button>
              <Button type="button" variant="outline" className="min-h-12 gap-2 text-destructive hover:text-destructive" disabled={busy} onClick={() => setRemoveOpen(true)}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </div>
          )}
        </>
      ) : canEdit ? sourceButtons : null}

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
          <DialogHeader><DialogTitle>Replace {label.toLowerCase()}</DialogTitle></DialogHeader>
          {sourceButtons}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl p-2">
          {signedUrl && <img src={signedUrl} alt={label} className="max-h-[82vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>

      <JobPhotoPickerDialog
        jobId={jobId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={async (photo) => {
          await onJobPhoto(photo);
          setReplaceOpen(false);
        }}
      />

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This only clears the slot. The original stays in the job photos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep photo</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void onRemove()}>
              Remove photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}