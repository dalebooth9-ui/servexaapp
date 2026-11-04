import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useJobCategories } from "@/hooks/useJobCategories";
import { useAuth } from "@/hooks/useAuth";
import { changeJobCategory } from "@/lib/jobCategoryChange";

interface Props {
  job: { id: string; org_id: string; category?: string | null; category_suggestion?: string | null; category_other_types?: string[] | null };
  onChanged?: (slug: string) => void;
  compact?: boolean;
}

/** Job type dropdown using only the job's own company's job types. */
export default function JobTypePicker({ job, onChanged, compact }: Props) {
  const { categories } = useJobCategories();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [reprint, setReprint] = useState(false);
  const own = categories.filter((c: any) => c.org_id === job.org_id);
  const needsType = job.category_suggestion === "needs_type";
  const value = needsType ? "" : job.category || "";

  const pick = async (slug: string) => {
    if (slug === job.category && !needsType) return;
    setBusy(true);
    try {
      const r = await changeJobCategory(job, slug, user?.id);
      toast.success(`Job type set to ${r.newName}`);
      onChanged?.(slug);
      if (r.printedBefore) setReprint(true);
    } catch (e: any) {
      toast.error("Couldn't change job type", { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={value} onValueChange={pick} disabled={busy}>
          <SelectTrigger className={compact ? "h-7 w-[190px] text-xs" : "h-8 w-[230px] text-sm"} aria-label="Job type">
            <SelectValue placeholder="Choose job type" />
          </SelectTrigger>
          <SelectContent>
            {own.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {job.category_suggestion === "suggested" && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Suggested from PO</Badge>}
        {needsType && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">Needs a type</Badge>}
      </div>
      {!!job.category_other_types?.length && (
        <p className="text-[11px] text-muted-foreground">PO also mentions: {job.category_other_types.join(", ")}</p>
      )}
      {reprint && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border bg-muted px-2 py-1.5 text-xs">
          <span>Job type changed. Reprint reports?</span>
          <Button size="sm" className="h-6 px-2 text-xs" onClick={() => { const detail: any = { jobId: job.id }; window.dispatchEvent(new CustomEvent("job:reprint-reports", { detail })); if (!detail.handled) toast.info("Open the Documents tab and press Print reports."); setReprint(false); }}>Reprint</Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setReprint(false)}>Not now</Button>
        </div>
      )}
    </div>
  );
}
