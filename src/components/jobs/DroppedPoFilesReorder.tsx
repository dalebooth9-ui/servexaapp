import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";
import { FileText, GripVertical, Image as ImageIcon, X } from "lucide-react";

const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);

function Thumb({ file, index, onRemove }: { file: File; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `${index}-${file.name}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage(file)) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex w-24 shrink-0 flex-col items-center gap-1 rounded-md border bg-background p-1.5 text-xs"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute left-0.5 top-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted"
        title="Drag to reorder"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        title="Remove"
      >
        <X className="h-3 w-3" />
      </button>
      <div className="mt-3 flex h-14 w-full items-center justify-center overflow-hidden rounded bg-muted">
        {preview ? (
          <img src={preview} alt={file.name} className="h-full w-full object-cover" />
        ) : isImage(file) ? (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        ) : (
          <FileText className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <span className="w-full truncate text-center" title={file.name}>
        {index + 1}. {file.name}
      </span>
    </div>
  );
}

export default function DroppedPoFilesReorder({
  files,
  onChange,
}: {
  files: File[];
  onChange: (next: File[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = useMemo(() => files.map((f, i) => `${i}-${f.name}`), [files]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(files, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <Thumb key={ids[i]} file={file} index={i} onRemove={() => onChange(files.filter((_, j) => j !== i))} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
