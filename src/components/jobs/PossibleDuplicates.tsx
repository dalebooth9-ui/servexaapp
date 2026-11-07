import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy } from "lucide-react";
import { findDuplicateJobs, type DuplicateJob } from "@/lib/duplicateJobs";
import {supabase} from '@/integrations/supabase/client';
import {loadJobRisers} from '@/lib/jobRisers';
import MergeJobs from './MergeJobs';
import { formatDate } from "@/lib/dateFormat";

interface Props {
  jobId: string;
  customerPo?: string | null;
  address?: string | null;
  customerId?: string | null;
}

/**
 * Small panel on the job detail page listing other non-cancelled jobs that
 * share this job's PO number, or the same customer + address in the last
 * 90 days. Renders nothing when there is nothing to show.
 */
export default function PossibleDuplicates({ jobId, customerPo, address, customerId }: Props) {
  const [siteId,setSiteId]=useState<string|null>(null);
  const [locations,setLocations]=useState<Record<string,string>>({});
  const [dupes, setDupes] = useState<DuplicateJob[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {data:job}=await supabase.from('jobs').select('site_id,category,org_id').eq('id',jobId).maybeSingle();
      if(!job?.site_id)return;
      setSiteId(job.site_id);
      const membership=await loadJobRisers(jobId);const ids=membership.filter(r=>r.selected).map(r=>r.asset_id);
      const {data:links}=await supabase.from('job_risers').select('job_id,asset_id').in('asset_id',ids).eq('selected',true).neq('job_id',jobId);
      const candidates=[...new Set((links||[]).map(r=>r.job_id))];
      const {data:matches}=await supabase.from('jobs').select('id,reference_number,name,customer_po,address,customer,customer_id,status,created_at,sites(name)').in('id',candidates).eq('org_id',job.org_id).eq('site_id',job.site_id).eq('category',job.category||'').not('status','in','(archived,cancelled)').is('merged_into_job_id',null);
      const {data:assets}=await supabase.from('assets').select('id,riser_location,asset_tag').in('id',ids);
      setLocations(Object.fromEntries(candidates.map(id=>[id,(links||[]).filter(l=>l.job_id===id).map(l=>{const a=assets?.find(a=>a.id===l.asset_id);return `${a?.riser_location||'Riser'} (${a?.asset_tag||l.asset_id})`;}).join(', ')])));
      const rows=(matches||[]).map(r=>({...r,matchedBy:'address' as const}));
      if (!cancelled) setDupes(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, customerPo, address, customerId]);

  if (dupes.length === 0) return <div className="mb-4"><MergeJobs jobId={jobId} siteId={siteId}/></div>;

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Copy className="h-4 w-4 text-amber-600" />
        Possible duplicates ({dupes.length})
      </h2>
      <MergeJobs jobId={jobId} siteId={siteId}/>
      <ul className="space-y-1.5">
        {dupes.map((d) => (
          <li key={d.id} className="text-sm">
            <Link to={`/jobs/${d.id}`} className="font-medium underline-offset-2 hover:underline">
              {d.reference_number || d.name}
            </Link>
            <span className="text-xs text-muted-foreground">
              {d.name && <> — {d.name}</>}
              {d.customer_po && <> · PO {d.customer_po}</>}
              {(d.sites?.name || d.address) && <> · {d.sites?.name || d.address}</>}
              {d.created_at && <> · created {formatDate(d.created_at)}</>}
              {" · "}
              {locations[d.id]} · same site, riser and job type
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
