import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { GripVertical, Trash2, ShieldCheck } from "lucide-react";
import { filterAllowedFiles } from "@/lib/fileUtils";
import WhatsAppQuickSend from "./WhatsAppQuickSend";

interface DraggableJobRowProps {
  job: any;
  statusColor: (s: string) => string;
  isAdmin: boolean;
  onDelete?: (id: string) => void;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  onFileDrop?: (jobId: string, files: File[]) => void;
}

export default function DraggableJobRow({ job, statusColor, isAdmin, onDelete, selected, onSelect, onFileDrop }: DraggableJobRowProps) {
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

  return (
    <TableRow
      ref={setNodeRef}
      className={`${isDragging ? "opacity-30" : ""} ${fileOver ? "ring-2 ring-primary bg-primary/5" : ""}`}
      onDragEnter={handleNativeDragEnter}
      onDragLeave={handleNativeDragLeave}
      onDragOver={handleNativeDragOver}
      onDrop={handleNativeDrop}
    >
      {isAdmin && (
        <TableCell className="w-8 px-2">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect?.(job.id, !!checked)}
          />
        </TableCell>
      )}
      {isAdmin && (
        <TableCell className="w-8 px-2">
          <button {...listeners} {...attributes} className="cursor-grab touch-none text-muted-foreground hover:text-foreground">
            <GripVertical className="h-4 w-4" />
          </button>
        </TableCell>
      )}
      <TableCell>
        <Link to={`/jobs/${job.id}`} className="font-mono text-sm font-medium text-primary hover:underline">
          {job.reference_number}
        </Link>
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-1.5">
          {job.name}
          {(job.submissions || []).some((s: any) => s.type === "document") && (
            <span title="Has compliance / RAMS documents attached">
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={job.priority === "high" ? "destructive" : "secondary"} className="text-[10px] uppercase">
          {job.priority || "medium"}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="text-xs capitalize text-muted-foreground">{job.category || "general"}</span>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className={statusColor(job.status)}>
          {job.status.replace(/_/g, " ")}
        </Badge>
      </TableCell>
      <TableCell>
        {job.result === "pass" ? (
          <Badge className="bg-green-600 text-white text-[10px] uppercase">Pass</Badge>
        ) : job.result === "fail" ? (
          <Badge variant="destructive" className="text-[10px] uppercase">Fail</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">{job.submissions?.length || 0}</TableCell>
      {isAdmin && (
        <TableCell className="w-20 px-2">
          <div className="flex items-center gap-2">
            <WhatsAppQuickSend jobId={job.id} jobRef={job.reference_number} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-muted-foreground hover:text-destructive transition-colors" title="Delete job">
                  <Trash2 className="h-4 w-4" />
                </button>
              </AlertDialogTrigger>
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
        </TableCell>
      )}
    </TableRow>
  );
}
