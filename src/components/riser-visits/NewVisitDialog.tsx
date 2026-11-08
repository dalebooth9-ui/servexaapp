import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CalendarPlus } from 'lucide-react';
import SiteJobDialog from '@/components/sites/SiteJobDialog';
import type { SiteJobType } from '@/lib/siteJobForm';

type Props = {
  siteId: string;
  siteName: string;
  initialIds?: string[];
  initialType?: SiteJobType;
  selectionNote?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function NewVisitDialog({ siteId, siteName, initialIds, initialType, selectionNote, open: controlled, onOpenChange }: Props) {
  const { userRole } = useAuth();
  const [localOpen, setLocalOpen] = useState(false);
  const setOpen = (open: boolean) => { setLocalOpen(open); onOpenChange?.(open); };
  if (userRole !== 'admin') return null;
  return <>
    {controlled === undefined && <Button variant="outline" onClick={() => setOpen(true)}><CalendarPlus className="mr-2 h-4 w-4" />New visit</Button>}
    <SiteJobDialog siteId={siteId} siteName={siteName} initialIds={initialIds} initialType={initialType} selectionNote={selectionNote} open={controlled ?? localOpen} onOpenChange={setOpen} />
  </>;
}
