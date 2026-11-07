import { useRef, type MouseEvent } from 'react';
import { Copy, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cleanMapText, copyableAddress, mapAddressUrl } from '@/lib/mapAddress';
import { cn } from '@/lib/utils';
import type { MapsDestination } from '@/lib/openInMaps';

type Props = MapsDestination & { what3words?: string | null; siteId?: string | null; jobId?: string | null; className?: string; label?: string; showPin?: boolean };

export default function MapAddress({ address, postcode, lat, lng, what3words, siteId, jobId, className, label, showPin = true }: Props) {
  const { toast } = useToast();
  const resolved = useRef<MapsDestination | null>(null);
  const text = copyableAddress(address, postcode);
  if (!text) return <span className={className}>{address || '—'}</span>;
  const destination = { address: cleanMapText(address), postcode: cleanMapText(postcode), lat, lng };
  const open = async (event: MouseEvent, directions: boolean) => {
    event.preventDefault(); event.stopPropagation();
    // Open during the tap so browsers do not block an async lookup as a popup.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    let dest = resolved.current || destination;
    let words = what3words;
    try {
      if (!resolved.current) {
        if (jobId) {
          const { data } = await supabase.from('jobs').select('site_latitude,site_longitude,sites(address,postcode,what3words)').eq('id', jobId).maybeSingle();
          if (data) {
            const site = data.sites;
            dest = { address: site?.address || dest.address, postcode: site?.postcode || dest.postcode, lat: data.site_latitude ?? dest.lat, lng: data.site_longitude ?? dest.lng };
            words = site?.what3words || words;
          }
        } else if (siteId) {
          const { data } = await supabase.from('sites').select('address,postcode,what3words').eq('id', siteId).maybeSingle();
          if (data) { dest = { ...dest, address: data.address || dest.address, postcode: data.postcode || dest.postcode }; words = data.what3words || words; }
        }
        if ((dest.lat == null || dest.lng == null) && words) {
          const { data } = await supabase.functions.invoke('w3w-convert', { body: { words } });
          if (data?.lat != null && data?.lng != null) dest = { ...dest, lat: data.lat, lng: data.lng };
          else {
            // Never send three words to Google as an imprecise street search.
            const url = `https://what3words.com/${encodeURIComponent(words.replace(/^\/+/, ''))}`;
            if (tab) tab.location.replace(url);
            else window.location.assign(url);
            return;
          }
        }
        resolved.current = dest;
      }
      const url = mapAddressUrl(dest, directions);
      if (tab) tab.location.replace(url);
      else window.location.assign(url);
    } catch {
      if (tab) tab.location.replace(mapAddressUrl(destination, directions));
    }
  };
  const copy = async (event: MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    try { await navigator.clipboard.writeText(text); toast({ title: 'Address copied' }); }
    catch { toast({ title: "Couldn't copy address", variant: 'destructive' }); }
  };
  return <span className={cn('inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 align-middle', className)} onClick={event => event.stopPropagation()}>
    <a href={mapAddressUrl(destination)} target="_blank" rel="noopener noreferrer" onClick={event => void open(event, false)} title="Open in maps" className="inline-flex min-w-0 items-start gap-1 cursor-pointer hover:text-primary hover:underline underline-offset-2">
      {showPin && <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span className="break-words">{label || text}</span>
    </a>
    <a href={mapAddressUrl(destination, true)} target="_blank" rel="noopener noreferrer" onClick={event => void open(event, true)} title="Directions from your current location" className="text-xs text-muted-foreground cursor-pointer hover:text-primary hover:underline underline-offset-2">Directions</a>
    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 hover:bg-muted hover:text-primary" title="Copy address" aria-label="Copy address" onClick={event => void copy(event)}><Copy className="h-3 w-3" /></Button>
  </span>;
}