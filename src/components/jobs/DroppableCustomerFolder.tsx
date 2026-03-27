import { useState, useRef } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FolderOpen, GripVertical, Pencil, Trash2 } from "lucide-react";
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
          {isAdmin && jobs.length > 0 && (
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary shrink-0"
              checked={allSelected}
              onChange={(e) => { e.stopPropagation(); onSelectAll?.(folderJobIds, e.target.checked); }}
              onClick={(e) => e.stopPropagation()}
              title="Select all in folder"
            />
          )}
          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
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
      <AccordionContent className="px-3 pb-3 pt-1">
        {jobs.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">No jobs in this folder</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {jobs.map((job: any) => (
              <DraggableJobRow
                key={job.id}
                job={job}
                statusColor={statusColor}
                isAdmin={isAdmin}
                onDelete={onDeleteJob}
                selected={selectedIds?.has(job.id)}
                onSelect={onSelect}
                onFileDrop={onJobFileDrop}
                onQuickSchedule={onQuickSchedule}
              />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
