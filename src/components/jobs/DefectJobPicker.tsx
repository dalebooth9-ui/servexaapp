import { defectStatusErrorMessage } from "@/lib/defectStatus";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { attachmentMessage, type DefectAttachmentResult } from "@/lib/defectCarryForward";
import { toast } from "sonner";

export default function DefectJobPicker({ defectId, onClose, onAdded }: { defectId: string; onClose: () => void; onAdded: (result: DefectAttachmentResult) => void }) {
  const [jobs, setJobs] = useState<{ id: string; reference_number: string; site_name: string | null; visit_date: string | null; same_site: boolean | null }[]>([]);
  const [search, setSearch] = useState(""); const [busy, setBusy] = useState(true);
  useEffect(() => { supabase.rpc("defect_job_candidates", { p_defect: defectId }).then(({ data, error }) => { setBusy(false); if (error) toast.error(error.message); else setJobs(data || []); }); }, [defectId]);
  const choose = async (id: string) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("attach_defects_to_job", { p_defect_ids: [defectId], p_job: id });
    setBusy(false);
    if (error) return toast.error(defectStatusErrorMessage(error));
    const result = data?.[0]; if (!result) return toast.error("Defect was not added");
    onAdded(result); if (result.outcome === "scheduled") { toast.success(attachmentMessage(result)); onClose(); } else toast.error(attachmentMessage(result));
  };
  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Choose job for this defect</DialogTitle></DialogHeader>
    <Input placeholder="Search job or site" value={search} onChange={e => setSearch(e.target.value)} />
    {!busy && !jobs.length && <p>No available jobs for this customer.</p>}
    {jobs.filter(j => `${j.reference_number} ${j.site_name}`.toLowerCase().includes(search.toLowerCase())).map(j => <div key={j.id} className="flex items-center justify-between gap-3 border-b py-3"><div className="text-sm"><p className="font-medium">{j.reference_number} · {j.site_name || "No site"}</p><p className="text-muted-foreground">{j.visit_date || "Visit not scheduled"}{!j.same_site && " · Different or missing site"}</p></div><Button size="sm" disabled={busy} onClick={() => choose(j.id)}>Add to this job</Button></div>)}
  </DialogContent></Dialog>;
}