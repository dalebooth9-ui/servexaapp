import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CalendarPlus } from 'lucide-react';
import SiteJobDialog from '@/components/sites/SiteJobDialog';
import type { VisitType } from '@/lib/riserVisits';

export default function NewVisitDialog({siteId,siteName,open:controlled,onOpenChange}: {siteId:string;siteName:string;initialIds?:string[];initialTypes?:Record<string,VisitType>;open?:boolean;onOpenChange?:(v:boolean)=>void}) {
  const {userRole}=useAuth();
  const [localOpen,setLocalOpen]=useState(false);
  const setOpen=(v:boolean)=>{setLocalOpen(v);onOpenChange?.(v);};
  if(userRole!=='admin')return null;
  return <>{controlled===undefined&&<Button variant="outline" onClick={()=>setOpen(true)}><CalendarPlus className="mr-2 h-4 w-4"/>New visit</Button>}<SiteJobDialog siteId={siteId} siteName={siteName} open={controlled??localOpen} onOpenChange={setOpen}/></>;
}
