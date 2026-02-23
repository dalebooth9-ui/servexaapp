import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { ArrowUpDown, Users, Trash2, Wrench, MessageSquare } from "lucide-react";

interface JobPart {
  id: string;
  job_id: string;
  name: string;
  quantity: number;
  notes: string | null;
}

interface SubmissionComment {
  id: string;
  content: string;
  created_at: string;
  submission_id: string;
  submission_job_id?: string;
}

interface ScheduleEntry {
  id: string;
  job_id: string;
  engineer_id: string;
  schedule_date: string;
  notes: string | null;
}

interface Engineer { user_id: string; full_name: string }
interface Job {
  id: string;
  name: string;
  reference_number: string;
  priority: string;
  category: string;
  customer: string | null;
  address: string | null;
  site_id: string | null;
  site?: { name: string; address: string | null; postcode: string | null } | null;
  pressure_test_qty: number;
  visual_qty: number;
}

function extractPostcode(address: string | null): string {
  if (!address) return "";
  const match = address.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
  return match ? match[0].toUpperCase() : "";
}

export default function ListView({
  schedule,
  engineers,
  jobs,
  isAdmin,
  onRemove,
  onBulkReassign,
  onBulkDelete,
  jobParts = [],
  submissionComments = [],
  optimisedJobOrder = [],
}: {
  schedule: ScheduleEntry[];
  engineers: Engineer[];
  jobs: Job[];
  isAdmin: boolean;
  onRemove: (id: string) => Promise<void>;
  onBulkReassign: (entryIds: string[], newEngineerId: string) => Promise<void>;
  onBulkDelete: (entryIds: string[]) => Promise<void>;
  jobParts?: JobPart[];
  submissionComments?: SubmissionComment[];
  optimisedJobOrder?: string[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"date" | "engineer" | "customer" | "postcode">("date");
  const [sortAsc, setSortAsc] = useState(true);
  const [reassignTarget, setReassignTarget] = useState("");

  const getJob = (id: string) => jobs.find((j) => j.id === id);
  const getEngineer = (id: string) => engineers.find((e) => e.user_id === id);
  const getPartsForJob = (jobId: string) => jobParts.filter((p) => p.job_id === jobId);
  const getLatestComment = (jobId: string) => submissionComments.find((c) => c.submission_job_id === jobId);
  const getRouteOrder = (jobId: string) => {
    const idx = optimisedJobOrder.indexOf(jobId);
    return idx >= 0 ? idx + 1 : null;
  };

  const sorted = useMemo(() => {
    const items = [...schedule];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = a.schedule_date.localeCompare(b.schedule_date);
      else if (sortBy === "engineer") {
        cmp = (getEngineer(a.engineer_id)?.full_name || "").localeCompare(getEngineer(b.engineer_id)?.full_name || "");
      } else if (sortBy === "customer") {
        cmp = ((getJob(a.job_id) as any)?.customers?.name || getJob(a.job_id)?.customer || "").localeCompare((getJob(b.job_id) as any)?.customers?.name || getJob(b.job_id)?.customer || "");
      } else {
        const pcA = getJob(a.job_id)?.site?.postcode || extractPostcode(getJob(a.job_id)?.address || null) || "";
        const pcB = getJob(b.job_id)?.site?.postcode || extractPostcode(getJob(b.job_id)?.address || null) || "";
        cmp = pcA.localeCompare(pcB);
      }
      return sortAsc ? cmp : -cmp;
    });
    return items;
  }, [schedule, sortBy, sortAsc, engineers, jobs]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortAsc(!sortAsc);
    else { setSortBy(field); setSortAsc(true); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = schedule.length > 0 && schedule.every((s) => selectedIds.has(s.id));

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(schedule.map((s) => s.id)));
  };

  const handleBulkReassign = async () => {
    if (!reassignTarget || selectedIds.size === 0) return;
    await onBulkReassign(Array.from(selectedIds), reassignTarget);
    setSelectedIds(new Set());
    setReassignTarget("");
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    await onBulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  return (
    <div>
      {/* Bulk actions */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <Select value={reassignTarget} onValueChange={setReassignTarget}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Reassign to..." />
              </SelectTrigger>
              <SelectContent>
                {engineers.map((e) => (
                  <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleBulkReassign} disabled={!reassignTarget}>
              <Users className="mr-1.5 h-3.5 w-3.5" /> Reassign
            </Button>
          </div>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove {selectedIds.size}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {isAdmin && (
                  <TableHead className="w-10 px-2">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                )}
                <TableHead className="cursor-pointer" onClick={() => toggleSort("date")}>
                  <span className="flex items-center gap-1">Date <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("engineer")}>
                  <span className="flex items-center gap-1">Engineer <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("customer")}>
                  <span className="flex items-center gap-1">Customer <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("postcode")}>
                  <span className="flex items-center gap-1">Postcode <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Priority</TableHead>
                {optimisedJobOrder.length > 0 && <TableHead className="w-12 text-center">Route #</TableHead>}
                <TableHead>Materials</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Notes</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                   <TableCell colSpan={(isAdmin ? 13 : 11) + (optimisedJobOrder.length > 0 ? 1 : 0)} className="py-12 text-center text-muted-foreground">
                    No entries for this period.
                  </TableCell>
                </TableRow>
              ) : sorted.map((entry) => {
                const job = getJob(entry.job_id);
                const eng = getEngineer(entry.engineer_id);
                return (
                  <TableRow key={entry.id} className={selectedIds.has(entry.id) ? "bg-primary/5" : ""}>
                    {isAdmin && (
                      <TableCell className="w-10 px-2">
                        <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => toggleSelect(entry.id)} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium whitespace-nowrap">{format(parseISO(entry.schedule_date), "EEE dd/MM")}</TableCell>
                    <TableCell className="text-sm">{eng?.full_name || "—"}</TableCell>
                    <TableCell className="text-sm">{(job as any)?.customers?.name || job?.customer || "—"}</TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">{job?.site?.name || job?.address || "—"}</TableCell>
                    <TableCell className="text-sm font-mono">{job?.site?.postcode || extractPostcode(job?.address || null) || "—"}</TableCell>
                    <TableCell>
                      {job ? (
                        <Link to={`/jobs/${job.id}`} className="hover:underline">
                          <span className="font-mono text-xs font-medium text-primary">{job.reference_number}</span>
                          <span className="ml-1 text-sm">{job.name}</span>
                        </Link>
                      ) : <span className="text-muted-foreground">Unknown</span>}
                    </TableCell>
                    <TableCell>
                      {(job?.pressure_test_qty > 0 || job?.visual_qty > 0) ? (
                        <div className="flex gap-1">
                          {job.pressure_test_qty > 0 && <span className="inline-flex items-center rounded bg-primary/10 text-primary px-1 py-0.5 text-[9px] font-semibold">PT×{job.pressure_test_qty}</span>}
                          {job.visual_qty > 0 && <span className="inline-flex items-center rounded bg-accent/20 text-accent-foreground px-1 py-0.5 text-[9px] font-semibold">Vis×{job.visual_qty}</span>}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={job?.priority === "high" ? "destructive" : "secondary"} className="text-[10px]">
                        {job?.priority || "—"}
                      </Badge>
                    </TableCell>
                    {optimisedJobOrder.length > 0 && (
                      <TableCell className="text-center">
                        {job ? (() => {
                          const order = getRouteOrder(job.id);
                          if (!order) return <span className="text-muted-foreground">—</span>;
                          return (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                              {order}
                            </span>
                          );
                        })() : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    <TableCell className="max-w-[160px]">
                      {job ? (() => {
                        const parts = getPartsForJob(job.id);
                        if (parts.length === 0) return <span className="text-muted-foreground">—</span>;
                        const summary = parts.map((p) => `${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ""}`).join(", ");
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1 text-xs truncate cursor-default">
                                <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{summary}</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <ul className="text-xs space-y-0.5">
                                {parts.map((p) => (
                                  <li key={p.id}>{p.name} ×{p.quantity}{p.notes ? ` — ${p.notes}` : ""}</li>
                                ))}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })() : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      {job ? (() => {
                        const comment = getLatestComment(job.id);
                        if (!comment) return <span className="text-muted-foreground">—</span>;
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1 text-xs truncate cursor-default">
                                <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{comment.content}</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              {comment.content}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })() : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">{entry.notes || "—"}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onRemove(entry.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
