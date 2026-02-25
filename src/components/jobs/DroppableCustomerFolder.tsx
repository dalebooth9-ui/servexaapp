import { useState, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FolderOpen, Pencil, Trash2 } from "lucide-react";
import { filterAllowedFiles } from "@/lib/fileUtils";
import DraggableJobRow from "./DraggableJobRow";

interface DroppableCustomerFolderProps {
  customerName: string;
  jobs: any[];
  statusColor: (s: string) => string;
  isAdmin: boolean;
  isOver: boolean;
  onDelete?: () => void;
  onRename?: () => void;
  onDeleteJob?: (id: string) => void;
  selectedIds?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  onSelectAll?: (jobIds: string[], checked: boolean) => void;
  onJobFileDrop?: (jobId: string, files: File[]) => void;
  onFolderFileDrop?: (customerName: string, files: File[]) => void;
  onQuickSchedule?: (job: any) => void;
}

export default function DroppableCustomerFolder({
  customerName,
  jobs,
  statusColor,
  isAdmin,
  isOver,
  onDelete,
  onRename,
  onDeleteJob,
  selectedIds,
  onSelect,
  onSelectAll,
  onJobFileDrop,
  onFolderFileDrop,
  onQuickSchedule,
}: DroppableCustomerFolderProps) {
  const { setNodeRef } = useDroppable({
    id: `folder-${customerName}`,
    data: { customerName },
  });
  const [fileOver, setFileOver] = useState(false);
  const fileCounter = useRef(0);

  const handleFolderFileDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    fileCounter.current++;
    setFileOver(true);
  };
  const handleFolderFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    fileCounter.current--;
    if (fileCounter.current === 0) setFileOver(false);
  };
  const handleFolderFileDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
  };
  const handleFolderFileDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    fileCounter.current = 0;
    setFileOver(false);
    const files = filterAllowedFiles(e.dataTransfer.files);
    if (files.length > 0 && onFolderFileDrop) onFolderFileDrop(customerName, files);
  };

  const folderJobIds = jobs.map((j) => j.id);
  const allSelected = jobs.length > 0 && folderJobIds.every((id) => selectedIds?.has(id));
  const someSelected = folderJobIds.some((id) => selectedIds?.has(id));

  return (
    <AccordionItem
      ref={setNodeRef}
      value={customerName}
      className={`rounded-lg border bg-card transition-colors ${isOver ? "ring-2 ring-primary/50 bg-primary/5" : ""} ${fileOver ? "ring-2 ring-accent/50 bg-accent/5" : ""}`}
      onDragEnter={handleFolderFileDragEnter}
      onDragLeave={handleFolderFileDragLeave}
      onDragOver={handleFolderFileDragOver}
      onDrop={handleFolderFileDrop}
    >
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex items-center gap-2 flex-1">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="font-semibold">{customerName}</span>
          <Badge variant="secondary" className="ml-1 text-xs">{jobs.length}</Badge>
          {isAdmin && customerName !== "Unassigned" && (
            <div className="ml-auto mr-2 flex items-center gap-1">
              {onRename && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRename(); }}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Rename folder"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {jobs.length === 0 && onDelete && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete empty folder"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-8 px-2">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => onSelectAll?.(folderJobIds, !!checked)}
                  />
                </TableHead>
              )}
              {isAdmin && <TableHead className="w-8 px-2" />}
              <TableHead>Reference</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Submissions</TableHead>
              {isAdmin && <TableHead className="w-10 px-2" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 7} className="text-center text-muted-foreground py-4">
                  No jobs in this folder
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job: any) => (
                <DraggableJobRow key={job.id} job={job} statusColor={statusColor} isAdmin={isAdmin} onDelete={onDeleteJob} selected={selectedIds?.has(job.id)} onSelect={onSelect} onFileDrop={onJobFileDrop} onQuickSchedule={onQuickSchedule} />
              ))
            )}
          </TableBody>
        </Table>
      </AccordionContent>
    </AccordionItem>
  );
}
