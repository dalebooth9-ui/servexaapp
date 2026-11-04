import {useEffect, useState} from 'react';
import {ImageIcon} from 'lucide-react';
import {resolveToSignedUrl} from '@/lib/durableStorageRef';

export default function CustomerLogo({src, alt, className, showMissing = false}: {src: string; alt: string; className?: string; showMissing?: boolean}) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl(''); setFailed(false);
    resolveToSignedUrl(src, 'customer-logos').then(value => {if (active) {setUrl(value || ''); setFailed(!value);}}).catch(() => {if (active) setFailed(true);});
    return () => {active = false;};
  }, [src]);
  if (failed) return <span className="inline-flex flex-col gap-1" title="Logo missing, please re-upload"><ImageIcon className={className}/>{showMissing && <span className="text-sm text-destructive">Logo missing, please re-upload</span>}</span>;
  if (!url) return <span className={className} aria-label="Loading logo"/>;
  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)}/>;
}