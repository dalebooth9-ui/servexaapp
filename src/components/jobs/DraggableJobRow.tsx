import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, Trash2, ShieldCheck, CalendarDays, AlertCircle } from "lucide-react";
import { format, isPast, isToday, parseISO } from "date-fns";
import { filterAllowedFiles } from "@/lib/fileUtils";
import WhatsAppQuickSend from "./WhatsAppQuickSend";
import JobPrintSheetButton from "./JobPrintSheetButton";

interface DraggableJobRowProps {
  job: any;
  statusColor: (s: string) => string;
  isAdmin: boolean;
  onDelete?: (id: string) => void;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  onFileDrop?: (jobId: string, files: File[]) => void;
  onQuickSchedule?: (job: any) => void;
}

export default function DraggableJobRow({ job, statusColor, isAdmin, onDelete, selected, onSelect, onFileDrop, onQuickSchedule }: DraggableJobRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    data: { job },
    disabled: !isAdmin,
  });
  const [fileOver, setFileOver] = useState(false);
  const fileCounter = useRef(0);

  const handleNativeDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    fileCounter.current++;
    setFileOver(true);
  };
  const handleNativeDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    fileCounter.current--;
    if (fileCounter.current === 0) setFileOver(false);
  };
  const handleNativeDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
  };
  const handleNativeDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    fileCounter.current = 0;
    setFileOver(false);
    const files = filterAllowedFiles(e.dataTransfer.files);
    if (files.length > 0 && onFileDrop) onFileDrop(job.id, files);
  };

  const dueDate = job.due_date ? parseISO(job.due_date) : null;
  const overdue = dueDate && isPast(dueDate) && !isToday(dueDate) && job.status !== "completed";
  const dueToday = dueDate && isToday(dueDate);

  return (
    <div
      ref={setNodeRef}
      className={`group relative flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5 transition-all ${isDragging ? "opacity-30" : "hover:shadow-sm"} ${fileOver ? "ring-2 ring-primary bg-primary/5" : ""}`}
      onDragEnter={handleNativeDragEnter}
      onDragLeave={handleNativeDragLeave}
      onDragOver={handleNativeDragOver}
      onDrop={handleNativeDrop}
    >
      {/* Left: drag handle + checkbox */}
      {isAdmin && (
        <div className="flex flex-col items-center gap-1.5 pt-0.5 shrink-0">
          <button {...listeners} {...attributes} className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground">
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect?.(job.id, !!checked)}
            className="h-3.5 w-3.5"
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Line 1: ref + name + primary status */}
        <div className="flex items-center gap-2 min-w-0">
          <Link to={`/jobs/${job.id}`} className="font-mono text-xs font-semibold text-primary hover:underline shrink-0">
            {job.reference_number}
          </Link>
          <Link to={`/jobs/${job.id}`} className="text-sm font-medium text-foreground hover:underline truncate">
            {job.name}
          </Link>
          <Badge variant="secondary" className={`${statusColor(job.status)} text-[10px] uppercase h-4 px-1.5 shrink-0`}>
            {job.status.replace(/_/g, " ")}
          </Badge>
          {job.priority === "high" && (
            <Badge variant="destructive" className="text-[10px] uppercase h-4 px-1.5 shrink-0">High</Badge>
          )}
          {job.result === "pass" && (
            <Badge className="bg-green-700 text-primary-foreground text-[10px] uppercase h-4 px-1.5 shrink-0">Pass</Badge>
          )}
          {job.result === "fail" && (
            <Badge variant="destructive" className="text-[10px] uppercase h-4 px-1.5 shrink-0">Fail</Badge>
          )}
          {(job.submissions || []).some((s: any) => s.type === "document") && (
            <span title="Has compliance / RAMS documents">
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
            </span>
          )}
        </div>

        {/* Line 2: muted metadata */}
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground truncate">
          {(() => {
            const siteLabel = job.sites?.name || job.address;
            const parts: (string | null)[] = [
              siteLabel || null,
              job.category && job.category !== "general" ? job.category : null,
              dueDate ? format(dueDate, "dd MMM") : null,
            ];
            const scope: string[] = [];
            if (job.pressure_test_qty > 0) scope.push(`PT×${job.pressure_test_qty}`);
            if (job.visual_qty > 0) scope.push(`Vis×${job.visual_qty}`);
            if (job.other_qty > 0 && job.other_service_type) scope.push(`${job.other_service_type}×${job.other_qty}`);
            if (scope.length) parts.push(scope.join(" · "));
            if ((job.submissions?.length || 0) > 0) parts.push(`${job.submissions.length} sub${job.submissions.length !== 1 ? "s" : ""}`);
            const joined = parts.filter(Boolean).join(" · ");
            return (
              <span className={`truncate ${overdue ? "text-destructive font-medium" : dueToday ? "text-amber-500 font-medium" : ""}`}>
                {(overdue || dueToday) && <AlertCircle className="inline h-2.5 w-2.5 mr-1 shrink-0" />}
                {joined || "—"}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Right: actions */}
      {isAdmin && (
        <div className="flex items-center gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="text-muted-foreground hover:text-primary transition-colors p-0.5"
                onClick={() => onQuickSchedule?.(job)}
              >
                <CalendarDays className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Schedule visit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span><JobPrintSheetButton job={job} /></span>
            </TooltipTrigger>
            <TooltipContent side="top">Print job sheet</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span><WhatsAppQuickSend jobId={job.id} jobRef={job.reference_number} /></span>
            </TooltipTrigger>
            <TooltipContent side="top">Send message</TooltipContent>
          </Tooltip>
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <button className="text-muted-foreground hover:text-destructive transition-colors p-0.5">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Delete job</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete job?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{job.reference_number} – {job.name}</strong> and all associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => onDelete?.(job.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
