import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, ImagePlus, Loader2, AlertTriangle } from 'lucide-react';
import { createSubmissionPhotoSignedUrl } from '@/lib/jobPhotos';
import { useEffect, useState } from 'react';

export default function ReportPhotoQuestion({ value, onAdd, pending, onRetry }: {
  value: string | null; onAdd: (file: File, source: 'camera' | 'library') => void;
  pending: { id: string; preview: string; status: 'uploading' | 'failed'; error?: string }[];
  onRetry: (photo: any) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let current = true; if (value) void createSubmissionPhotoSignedUrl(value, undefined, 3600).then(result => { if (current) setUrl(result?.signedUrl || null); }); else setUrl(null); return () => { current = false; }; }, [value]);
  return <div className="w-full space-y-2">
    {url && <img src={url} alt="Stored report photo" className="max-h-24 max-w-full rounded border object-cover" />}
    {pending.map(photo => <div key={photo.id} className="space-y-1">
      <img src={photo.preview} alt="Report photo waiting to upload" className="max-h-24 max-w-full rounded border object-cover" />
      {photo.status === 'failed' ? <Button size="sm" variant="destructive" onClick={() => onRetry(photo)}><AlertTriangle className="h-3 w-3 mr-1" />Retry photo</Button> : <span className="flex gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" />Uploading…</span>}
    </div>)}
    <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onAdd(file, 'camera'); }} />
    <input ref={library} type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onAdd(file, 'library'); }} />
    <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" disabled={pending.length > 0} onClick={() => camera.current?.click()}><Camera className="h-3 w-3 mr-1" />Take photo</Button><Button size="sm" variant="outline" disabled={pending.length > 0} onClick={() => library.current?.click()}><ImagePlus className="h-3 w-3 mr-1" />Choose from library</Button></div>
  </div>;
}